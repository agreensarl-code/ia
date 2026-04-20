const xmlrpc = require('xmlrpc');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../.env') });

const url = process.env.ODOO_URL;
const db = process.env.ODOO_DB;
const username = process.env.ODOO_USER;
const password = process.env.ODOO_API_KEY;

const host = new URL(url).hostname;
const commonClient = xmlrpc.createSecureClient({ host, port: 443, path: '/xmlrpc/2/common' });
const modelsClient = xmlrpc.createSecureClient({ host, port: 443, path: '/xmlrpc/2/object' });

const getUid = () => {
    return new Promise((resolve, reject) => {
        commonClient.methodCall('authenticate', [db, username, password, {}], (err, uid) => {
            if (err) return reject(err);
            resolve(uid);
        });
    });
};

const execute = async (model, method, args, kwargs = {}) => {
    const uid = await getUid();
    return new Promise((resolve, reject) => {
        modelsClient.methodCall('execute_kw', [db, uid, password, model, method, args, kwargs], (err, result) => {
            if (err) return reject(err);
            resolve(result);
        });
    });
};

const searchPartnerByEmail = async (email) => {
    const partners = await execute('res.partner', 'search_read', [[['email', '=', email]]], { fields: ['id', 'name', 'email', 'city', 'zip'] });
    return partners[0] || null;
};

const getTasksForPartner = async (partnerId) => {
    return await execute('project.task', 'search_read', [[['partner_id', '=', partnerId]]], {
        fields: ['id', 'name', 'date_deadline', 'description']
    });
};

const createTask = async (partnerId, projectId, name, description, dateDeadline) => {
    return await execute('project.task', 'create', [{
        partner_id: partnerId,
        project_id: projectId,
        name: name,
        description: description,
        date_deadline: dateDeadline
    }]);
};

const getProjects = async () => {
    return await execute('project.project', 'search_read', [[]], { fields: ['id', 'name'] });
};

const getProducts = async () => {
    return await execute('product.product', 'search_read', [[['sale_ok', '=', true]]], {
        fields: ['id', 'name', 'list_price', 'description_sale'],
        limit: 50
    });
};

const getPartnerHistory = async (partnerId) => {
    return await execute('project.task', 'search_read', [[['partner_id', '=', partnerId]]], {
        fields: ['id', 'name', 'description', 'create_date'],
        limit: 10,
        order: 'create_date desc'
    });
};

const searchPartnersByName = async (query) => {
    let domain = [['name', 'ilike', query]];
    
    // Si la recherche contient des espaces (Nom Prénom), on tente de l'inverser (Prénom Nom)
    const words = query.trim().split(' ');
    if (words.length > 1) {
        const invertedQuery = words.reverse().join(' ');
        domain = ['|', ['name', 'ilike', query], ['name', 'ilike', invertedQuery]];
    }

    return await execute('res.partner', 'search_read', [domain], { 
        fields: ['id', 'name', 'email', 'city', 'zip'],
        limit: 15
    });
};

const getPartnerDetails = async (partnerId) => {
    const records = await execute('res.partner', 'read', [[partnerId]], { 
        fields: ['id', 'name', 'city', 'zip', 'email'] 
    });
    return records[0] || null;
};

const getDailyTaskCount = async (projectId, dateString) => {
    const startOfDay = `${dateString} 00:00:00`;
    const endOfDay = `${dateString} 23:59:59`;
    return await execute('project.task', 'search_count', [[
        ['project_id', '=', parseInt(projectId)],
        ['date_deadline', '>=', startOfDay],
        ['date_deadline', '<=', endOfDay]
    ]]);
};

const getTasksByProject = async (projectId) => {
    return await execute('project.task', 'search_read', [[['project_id', '=', parseInt(projectId)]]], {
        fields: ['id', 'name', 'description', 'partner_id', 'date_deadline', 'create_date'],
        order: 'create_date desc',
        limit: 200
    });
};

const updateTask = async (taskId, newProjectId, newDateDeadline) => {
    return await execute('project.task', 'write', [[parseInt(taskId)], {
        project_id: parseInt(newProjectId),
        date_deadline: newDateDeadline
    }]);
};

module.exports = {
    searchPartnerByEmail,
    getTasksForPartner,
    createTask,
    getProjects,
    getProducts,
    getPartnerHistory,
    searchPartnersByName,
    getPartnerDetails,
    getDailyTaskCount,
    getTasksByProject,
    updateTask
};
