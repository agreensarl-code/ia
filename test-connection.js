const odoo = require('./server/services/odooService');

async function test() {
    try {
        console.log('Testing Odoo connection...');
        const projects = await odoo.getProjects();
        console.log('Projects found:', projects.map(p => p.name).join(', '));
        
        console.log('Testing Email Partner Search...');
        const partner = await odoo.searchPartnerByEmail('info@agreen.lu');
        console.log('Partner found:', partner ? partner.name : 'Not found');
        
        process.exit(0);
    } catch (err) {
        console.error('Test failed:', err);
        process.exit(1);
    }
}

test();
