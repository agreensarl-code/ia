const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../.env') });

const config = {
    imap: {
        host: process.env.EMAIL_IMAP_HOST,
        port: parseInt(process.env.EMAIL_IMAP_PORT),
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
    const client = new ImapFlow(config.imap);
    await client.connect();
    const emails = [];
    const folders = ['INBOX', 'a. Interne', 'b. Site web', 'c. Privé (Client)'];

    for (const folder of folders) {
        try {
            let lock = await client.getMailboxLock(folder);
            try {
                let uids = await client.search({ seen: false }, { uid: true });
                for (let uid of uids) {
                    let message = await client.fetchOne(uid, { source: true }, { uid: true });
                    let parsed = await simpleParser(message.source);
                    
                    emails.push({
                        uid: `${folder}-${uid}`, // Unique across folders mapping
                        messageId: parsed.messageId || `${folder}-${uid}`, // Global uniqueness
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
            console.error(`Error scanning folder ${folder}:`, e.message);
        }
    }

    await client.logout();
    return emails;
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
