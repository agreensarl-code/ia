const OpenAI = require('openai');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

// Charger dotenv seulement si le fichier existe (local), sinon utiliser process.env (Render)
if (fs.existsSync(path.join(__dirname, '../.env'))) {
    dotenv.config({ path: path.join(__dirname, '../.env') });
} else {
    dotenv.config();
}

console.log(`[OPENAI] Initialisation avec modèle: ${process.env.OPENAI_MODEL}`);
if (!process.env.OPENAI_API_KEY) {
    console.error('[OPENAI] ERREUR : API Key manquante !');
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

/**
 * Analyse l'email et les tâches existantes pour décider de la suite.
 */
const analyzeEmail = async (emailContent, existingTasks, customerName, productCatalog = [], partnerHistory = [], partnerAddress = null) => {
    const prompt = `
Tu es un assistant intelligent expert pour Agreen Robotics (spécialiste des robots de tonte Honda et Kress). 

CONTEXTE DE L'ENTREPRISE :
- Agreen Robotics vend, installe et dépanne des robots de tonte.
- Catalogue de produits/services disponibles dans Odoo :
${JSON.stringify(productCatalog.map(p => ({ name: p.name, price: p.list_price })), null, 2)}

HORAIRES DE TRAVAIL :
- Mardi au Vendredi : 08h30 - 12h00 et 13h00 - 18h00
- Samedi : 08h30 - 12h00 et 13h00 - 17h00
- Fermé : Dimanche et Lundi.

LOGIQUE D'INTERVENTION ET ROUTAGE (PROJETS) :
- Durée d'un créneau : 1h30 (1h travail + 30min trajet).
- Début possible : Demain à partir de 08h30.
- Si le client demande un **Entretien**, le projet est TOUJOURS "Entretien" (ID: 10).
- Si c'est un **Dépannage / Réparation / Installation**, choisis le projet en fonction de la LOCALISATION du client (utilise le champ 'Adresse connue' ci-dessous) :
  - **SECTEUR ARLON** : Arlon (6700), Messancy (6780), Aubange (6790), Attert (6717), Musson (6750), Saint-Léger (6747) -> Projet "Journée Thibault (Arlon)" (ID: 17)
  - **SECTEUR BASTOGNE** : Bastogne (6600), Vaux-sur-Sûre (6640), Bertogne (6687), Houffalize (6660), Gouvy (6670), Sainte-Ode (6680), Martelange (6630) -> Projet "Journée Thibaut (Bastogne)" (ID: 1)
  - **SECTEUR LIBRAMONT** : Libramont (6800), Neufchâteau (6840), Saint-Hubert (6870), Bertrix (6880), Paliseul (6850), Leglise (6860) -> Projet "Journée Ruben (Libramont)" (ID: 3)
  - Si tu ne sais pas ou si c'est hors zone, mets l'ID 13 ("Dépannages clients").
  - PRIORITÉ : Si tu trouves un mot-clé de ville dans l'adresse connue ou dans le contenu du mail, utilise-le pour choisir le secteur.

HISTORIQUE DU CLIENT (${customerName}) :
Adresse connue (Ville/CP) : ${partnerAddress ? `${partnerAddress.zip || ''} ${partnerAddress.city || 'Inconnue'}` : 'Inconnue'}
${JSON.stringify(partnerHistory, null, 2)}

TÂCHES EN COURS :
${JSON.stringify(existingTasks, null, 2)}

EMAIL DU CLIENT :
Contenu: "${emailContent}"

TA MISSION :
1. Analyse la demande.
2. Détermine si une nouvelle intervention est nécessaire.
3. Si oui, calcule une date d'intervention. RÈGLE D'OPTIMISATION GEOGRAPHIQUE : Analyse minutieusement les TÂCHES EN COURS. Si le technicien est DÉJÀ prévu dans la même zone (ex: même projet Arlon ou Bastogne, ou même ville) à une date future, tu DOIS proposer cette MÊME date pour grouper les trajets. Sinon, propose le prochain jour disponible.
4. Détermine le bon ID de projet (suggestedProjectId) selon les règles de routage ci-dessus.
5. Rédige une réponse d'email courte, BANALE et directe en français (pas de marketing, pas de chichis).

FORMAT DE RÉPONSE :
- La réponse ('emailResponse') doit être en TEXTE BRUT (pas de HTML, pas de balises).
- IMPORTANT : NE MENTIONNE JAMAIS D'HEURE FIXE dans la réponse email (ex: ne dis pas "à 08h30"). Indique UNIQUEMENT LE JOUR (ex: "Nous passerons le mardi 21 avril dans la journée").
- La 'proposedDate' JSON doit cependant rester au format "YYYY-MM-DD HH:mm:ss" (mets 08:30:00 par défaut) pour notre base de données.
- Utilise des sauts de ligne simples (\n).

RÉPONDRE UNIQUEMENT EN JSON :
{
  "needsTask": boolean,
  "reasoning": "Explication courte en français",
  "proposedDate": "YYYY-MM-DD HH:mm:ss",
  "suggestedProjectId": 17, // L'ID du projet selon le routage (ex: 17, 1, 3, 10, 13)
  "taskTitle": "Titre court",
  "emailSubject": "Sujet",
  "emailResponse": "Corps du mail en TEXTE BRUT"
}
`;

    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
    });

    return JSON.parse(response.choices[0].message.content);
};

const analyzeTaskDispatch = async (taskName, taskDescription, existingTasks, partnerName, partnerAddress) => {
    const prompt = `
Tu es un planificateur expert pour Agreen Robotics.
Ta mission : Analyser une tâche de dépannage existante et suggérer vers quel projet régional la déplacer, et à quelle date.

HORAIRES DE TRAVAIL :
- Mardi au Vendredi : 08h30 - 12h00 et 13h00 - 18h00
- Samedi : 08h30 - 12h00 et 13h00 - 17h00
- Fermé : Dimanche et Lundi.

ROUTAGE (PROJETS DISPONIBLES) :
- Arlon et villes proches -> "Journée Thibault (Arlon)" (ID: 17)
- Bastogne et environs -> "Journée Thibaut (Bastogne)" (ID: 1)
- Libramont et environs -> "Journée Ruben (Libramont)" (ID: 3)
- Par défaut en cas d'inconnu -> "Dépannages clients" (ID: 13)

CLIENT : ${partnerName}
ADRESSE (Ville/CP) : ${partnerAddress ? `${partnerAddress.zip || ''} ${partnerAddress.city || 'Inconnue'}` : 'Inconnue'}

TÂCHE À OPTIMISER :
Titre : ${taskName}
Description : ${taskDescription || '(Aucune description)'}

TÂCHES EN COURS (POUR OPTIMISATION GÉOGRAPHIQUE) :
${JSON.stringify(existingTasks, null, 2)}

TA MISSION :
1. Analyse l'adresse du client et détermine le bon ID de projet (suggestedProjectId).
2. Propose la meilleure \`proposedDate\`. REGLE CRUCIALE : Analyse minutieusement les TACHES EN COURS. Si le technicien est DEJA prévu dans la même zone (ou projet) à une date future, tu DOIS proposer cette MEME date pour grouper les trajets. Sinon, propose le prochain jour disponible à partir de demain 08:30:00.

RÉPONDRE UNIQUEMENT EN JSON :
{
  "suggestedProjectId": 17, 
  "proposedDate": "YYYY-MM-DD HH:mm:ss",
  "reasoning": "Explication courte sur le choix du routing et/ou de la date"
}
`;

    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
    });

    return JSON.parse(response.choices[0].message.content);
};

module.exports = {
    analyzeEmail,
    analyzeTaskDispatch
};
