const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const odooService = require('./services/odooService');
const emailService = require('./services/emailService');
const aiService = require('./services/aiService');
const supabaseService = require('./services/supabaseService');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const DIST_PATH = path.join(__dirname, '../client/dist');

app.use(express.static(DIST_PATH));

/**
 * Scan des nouveaux emails
 */
app.post('/api/scan', async (req, res) => {
    try {
        console.log('Scanning for unread emails (Limit: 5)...');
        const unreadEmails = await emailService.fetchUnread(5);
        console.log(`[API] ${unreadEmails.length} emails récupérés pour analyse.`);
        const results = [];

        // 1. Charger le catalogue produits une seule fois pour le scan
        const products = await odooService.getProducts();

        for (const email of unreadEmails) {
            // Éviter les doublons (En attente + Historique) via Supabase
            const isDuplicate = await supabaseService.isDuplicate(email.uid, email.messageId);
            
            if (isDuplicate) continue;

            console.log(`Analyzing email from ${email.from}: ${email.subject}`);
            
            // 2. Chercher le partenaire dans Odoo (Email puis Nom)
            let partner = await odooService.searchPartnerByEmail(email.from);
            if (!partner && email.fromName) {
                const potentialPartners = await odooService.searchPartnersByName(email.fromName);
                if (potentialPartners.length > 0) {
                    partner = potentialPartners[0]; // On prend le meilleur match
                }
            }
            
            // 3. Chercher les tâches existantes, l'historique et l'adresse
            let existingTasks = [];
            let partnerHistory = [];
            let partnerAddress = null;
            if (partner) {
                existingTasks = await odooService.getTasksForPartner(partner.id);
                partnerHistory = await odooService.getPartnerHistory(partner.id);
                partnerAddress = await odooService.getPartnerDetails(partner.id);
            }

            // 4. Analyse IA avec connaissance Odoo & Routage Localisation
            const aiAnalysis = await aiService.analyzeEmail(
                email.body, 
                existingTasks, 
                email.fromName || email.from,
                products,
                partnerHistory,
                partnerAddress
            );

            // Petit délai pour éviter de saturer le quota OpenAI (Rate Limit)
            await new Promise(resolve => setTimeout(resolve, 800));

            const pendingItem = {
                id: Date.now() + Math.random().toString(36).substr(2, 9),
                emailUid: email.uid,
                messageId: email.messageId,
                email: email,
                partner: partner,
                ai: aiAnalysis,
                status: 'pending'
            };

            await supabaseService.addPendingEmail(pendingItem.id, pendingItem);
            results.push(pendingItem);
        }

        res.json({ success: true, newItems: results.length });
    } catch (error) {
        console.error('Scan error:', error);
        if (error.status === 429 && error.code === 'insufficient_quota') {
            return res.status(402).json({ error: 'CREDITS_EXHAUSTED', message: 'Votre crédit OpenAI est épuisé.' });
        }
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/pending', async (req, res) => {
    try {
        const pending = await supabaseService.getPendingEmails();
        res.json(pending);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Approbation et envoi
 */
app.post('/api/approve/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { modifiedResponse, modifiedDate, modifiedTitle, projectId } = req.body;
        
        const item = await supabaseService.getEmailById(id);

        if (!item) return res.status(404).json({ error: 'Item not found' });

        // 1. Créer la tâche Odoo si nécessaire
        if (item.ai.needsTask) {
            const partnerId = item.partner ? item.partner.id : null;
            // Si pas de partenaire, on pourrait en créer un, mais on va rester simple
            await odooService.createTask(
                partnerId,
                projectId || 1, // Projet par défaut
                modifiedTitle || item.ai.taskTitle,
                item.email.body,
                modifiedDate || item.ai.proposedDate
            );
        }

        // 2. Envoyer l'email
        await emailService.sendEmail(
            item.email.from,
            item.ai.emailSubject,
            modifiedResponse || item.ai.emailResponse
        );

        // 3. Déplacer vers l'historique
        item.status = 'approved';
        db.history.push(item);
        db.pending = db.pending.filter(p => p.id !== id);
        
        saveDB(db);
        res.json({ success: true });
    } catch (error) {
        console.error('Approve error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Marquer comme lu
 */
app.post('/api/emails/mark-seen', async (req, res) => {
    try {
        const { id, folder, emailUid } = req.body;
        
        // 1. Marquer sur Gmail
        await emailService.markAsSeen(folder, emailUid);

        // 2. Retirer de la liste locale (Supabase)
        if (id) {
            await supabaseService.updateEmailStatus(id, 'seen');
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Mark seen error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/projects', async (req, res) => {
    try {
        const projects = await odooService.getProjects();
        res.json(projects);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/partners/search', async (req, res) => {
    try {
        const q = req.query.q;
        if (!q) return res.json([]);
        const partners = await odooService.searchPartnersByName(q);
        res.json(partners);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/capacity', async (req, res) => {
    try {
        const { projectId, date } = req.query;
        if (!projectId || !date) return res.json({ count: 0 });
        // Clean date just in case
        const simpleDate = date.split(' ')[0].split('T')[0];
        const count = await odooService.getDailyTaskCount(projectId, simpleDate);
        res.json({ count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/manual-task', async (req, res) => {
    try {
        const { partnerId, projectId, name, description, dateDeadline } = req.body;
        await odooService.createTask(partnerId, projectId, name, description, dateDeadline);
        res.json({ success: true });
    } catch (error) {
        console.error('Manual task error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * MODULE DISPATCH DEPANNAGES
 */
app.post('/api/dispatch/scan', async (req, res) => {
    try {
        const tasks = await odooService.getTasksByProject(13); // ID 13: Dépannages clients
        console.log(`[SCAN DISPATCH] Found ${tasks.length} tasks in Odoo project 13`);
        const results = [];

        for (const task of tasks) {
            // Limiter à 8 tâches par scan
            if (results.length >= 8) break;
            
            // Vérifier si déjà scanné dans Supabase
            if (await supabaseService.isDispatchDuplicate(task.id)) continue;

            console.log(`[SCAN DISPATCH] Processing task: ${task.name}`);

            const partnerAddress = task.partner_id ? await odooService.getPartnerDetails(task.partner_id[0]) : null;
            let existingTasks = task.partner_id ? await odooService.getTasksForPartner(task.partner_id[0]) : [];
            
            // Condenser les tâches existantes
            existingTasks = existingTasks.map(t => ({
                id: t.id,
                name: t.name,
                project: t.project_id ? t.project_id[1] : 'Inconnu',
                date: t.date_deadline
            })).slice(0, 10);

            const shortDesc = task.description ? task.description.substring(0, 400) + '...' : '(Aucune)';

            let aiAnalysis;
            try {
                aiAnalysis = await aiService.analyzeTaskDispatch(
                    task.name,
                    shortDesc,
                    existingTasks,
                    task.partner_id ? task.partner_id[1] : 'Inconnu',
                    partnerAddress
                );
            } catch (err) {
                if (err.status === 429 || err.code === 'rate_limit_exceeded') {
                    console.warn('[SCAN DISPATCH] OpenAI Rate Limit reached, pausing...');
                    break;
                }
                throw err;
            }

            const pendingDispatch = {
                id: Date.now() + Math.random().toString(36).substr(2, 9),
                taskId: task.id,
                taskName: task.name,
                taskDescription: task.description,
                partner: partnerAddress || { name: task.partner_id ? task.partner_id[1] : 'Inconnu' },
                ai: aiAnalysis,
                status: 'pending'
            };

            await supabaseService.addDispatchItem(pendingDispatch);
            results.push(pendingDispatch);
            
            console.log(`[SCAN DISPATCH] Successfully analyzed: ${task.name}`);
            
            // Délai minimal de 1.2s entre les appels IA
            await new Promise(resolve => setTimeout(resolve, 1200)); 
        }

        res.json({ 
            success: true, 
            newItems: results.length, 
            message: results.length >= 8 ? 'Scan partiel (8 max)' : 'Scan terminé' 
        });
    } catch (error) {
        console.error('[SCAN DISPATCH] Error:', error);
        if (error.status === 429 && error.code === 'insufficient_quota') {
            return res.status(402).json({ error: 'CREDITS_EXHAUSTED', message: 'Votre crédit OpenAI est épuisé.' });
        }
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/dispatch/pending', async (req, res) => {
    try {
        const pending = await supabaseService.getDispatchPending();
        res.json(pending);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/dispatch/approve/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { projectId, dateDeadline } = req.body;
        
        const item = await supabaseService.getDispatchById(id);

        if (!item) return res.status(404).json({ error: 'Item not found' });

        await odooService.updateTask(item.taskId, projectId, dateDeadline);
        await supabaseService.updateDispatchStatus(id, 'approved');
        
        res.json({ success: true });
    } catch (error) {
        console.error('Dispatch Approve Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Route par défaut pour servir le frontend React
app.get(/^(?!\/api).+/, (req, res) => {
    const indexPath = path.join(DIST_PATH, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Frontend non compilé. Lancez "npm run build" dans le dossier client.');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
