const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const path = require('path');
const dotenv = require('dotenv');
// Charger dotenv seulement si le fichier existe (local), sinon utiliser process.env (Render)
if (fs.existsSync(path.join(__dirname, '../.env'))) {
    dotenv.config({ path: path.join(__dirname, '../.env') });
} else {
    dotenv.config(); // Charge les variables d'environnement système par défaut
}

const config = {
    imap: {
        host: process.env.EMAIL_IMAP_HOST,
        port: parseInt(process.env.EMAIL_IMAP_PORT),
        user: process.env.EMAIL_USER, // Stocké séparément pour le log
        secure: true,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    },
    smtp: {
        host: process.env.EMAIL_SMTP_HOST,
        port: parseInt(process.env.EMAIL_SMTP_PORT),
        secure: true,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    }
};

const { simpleParser } = require('mailparser');

const fetchUnread = async () => {
    console.log(`[IMAP] Tentative de connexion à ${config.imap.host} avec l'utilisateur ${config.imap.user}...`);
    
    if (!config.imap.user || !config.imap.auth.pass) {
        console.error('[IMAP] ERREUR : EMAIL_USER ou EMAIL_PASS est vide !');
        return [];
    }

    const client = new ImapFlow(config.imap);
    
    try {
        await client.connect();
        console.log('[IMAP] Connecté avec succès.');
        
        const emails = [];
        const folders = ['INBOX', 'a. Interne', 'b. Site web', 'c. Privé (Client)'];

        for (const folder of folders) {
            try {
                let lock = await client.getMailboxLock(folder);
                try {
                    let uids = await client.search({ seen: false }, { uid: true });
                    console.log(`[IMAP] Dossier ${folder} : ${uids.length} emails non lus trouvés.`);
                    
                    for (let uid of uids) {
                        let message = await client.fetchOne(uid, { source: true }, { uid: true });
                        let parsed = await simpleParser(message.source);
                        
                        emails.push({
                            uid: `${folder}-${uid}`,
                            messageId: parsed.messageId || `${folder}-${uid}`,
                            folder,
                            subject: parsed.subject,
                            from: parsed.from.value[0].address,
                            fromName: parsed.from.value[0].name,
                            date: parsed.date,
                            body: parsed.text || parsed.html
                        });
                    }
                } finally {
                    lock.release();
                }
            } catch (e) {
                console.error(`[IMAP] Erreur scan dossier ${folder}:`, e.message);
            }
        }

        await client.logout();
        return emails;
    } catch (err) {
        console.error('[IMAP] Erreur de connexion critique :', err.message);
        throw err;
    }
};

const sendEmail = async (to, subject, html) => {
    const transporter = nodemailer.createTransport(config.smtp);
    return await transporter.sendMail({
        from: `"${process.env.EMAIL_USER}" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        text: html // variable name remains html but content is now plain text
    });
};

const markAsSeen = async (folder, uid) => {
    const client = new ImapFlow(config.imap);
    await client.connect();
    
    // Extract numerical UID from our combined ID
    const realUid = uid.includes('-') ? uid.split('-').pop() : uid;
    
    let lock = await client.getMailboxLock(folder);
    try {
        await client.messageFlagsAdd(realUid, ['\\Seen'], { uid: true });
    } finally {
        lock.release();
    }
    await client.logout();
};

module.exports = {
    fetchUnread,
    sendEmail,
    markAsSeen
};
