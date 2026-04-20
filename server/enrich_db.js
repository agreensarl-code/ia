const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const odoo = require('./services/odooService');

dotenv.config();

const DB_PATH = path.join(__dirname, 'db.json');

async function enrich() {
    if (!fs.existsSync(DB_PATH)) return;
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

    console.log('Refreshing address data for', db.pending.length, 'pending items...');

    for (let item of db.pending) {
        if (item.partner && item.partner.id) {
            try {
                const details = await odoo.getPartnerDetails(item.partner.id);
                if (details) {
                    item.partner.city = details.city;
                    item.partner.zip = details.zip;
                    console.log(`Updated ${item.partner.name}: ${details.zip} ${details.city}`);
                }
            } catch (e) {
                console.error('Error updating', item.partner.name, e.message);
            }
        }
    }

    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    console.log('Database enriched successfully.');
}

enrich();
