const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const dotenv = require('dotenv');

const fs = require('fs');

// Charger dotenv seulement si le fichier existe (local), sinon utiliser process.env (Render)
if (fs.existsSync(path.join(__dirname, '../.env'))) {
    dotenv.config({ path: path.join(__dirname, '../.env') });
} else {
    dotenv.config();
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

console.log(`[SUPABASE] Initialisation avec URL: ${supabaseUrl ? 'OK' : 'MANQUANT'}`);

if (!supabaseUrl || !supabaseKey) {
    console.error('[SUPABASE] ERREUR : SUPABASE_URL ou SUPABASE_KEY manquant !');
}

const supabase = createClient(supabaseUrl, supabaseKey);

const supabaseService = {
    // Gestion des emails en attente
    async getPendingEmails() {
        const { data, error } = await supabase
            .from('emails_pending')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return data.map(item => ({ ...item.data, id: item.id, status: item.status }));
    },

    async addPendingEmail(id, emailData) {
        const { error } = await supabase
            .from('emails_pending')
            .insert([{ id, email_uid: emailData.emailUid?.toString(), data: emailData, status: 'pending' }]);
        
        if (error) throw error;
    },

    async updateEmailStatus(id, status) {
        const { error } = await supabase
            .from('emails_pending')
            .update({ status })
            .eq('id', id);
        
        if (error) throw error;
    },

    // Gestion du dispatch (dépannages)
    async getDispatchPending() {
        const { data, error } = await supabase
            .from('dispatch_pending')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return data.map(item => ({ ...item.data, id: item.id, status: item.status }));
    },

    async addDispatchItem(item) {
        const { error } = await supabase
            .from('dispatch_pending')
            .insert([{ id: item.id, task_id: item.taskId.toString(), data: item, status: 'pending' }]);
        
        if (error) throw error;
    },

    async updateDispatchStatus(id, status) {
        const { error } = await supabase
            .from('dispatch_pending')
            .update({ status })
            .eq('id', id);
        
        if (error) throw error;
    },

    // Gestion de l'historique
    async getHistory() {
        const { data, error } = await supabase
            .from('history')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
        
        if (error) throw error;
        return data.map(item => ({ ...item.data, id: item.id }));
    },

    async addToHistory(item) {
        const { error } = await supabase
            .from('history')
            .insert([{ id: item.id, data: item }]);
        
        if (error) throw error;
    },

    async isDuplicate(emailUid, messageId) {
        // Vérifier dans emails_pending
        const { data: pending, error: err1 } = await supabase
            .from('emails_pending')
            .select('id')
            .or(`email_uid.eq.${emailUid},data->>messageId.eq.${messageId}`)
            .limit(1);
        
        if (pending && pending.length > 0) return true;

        // Vérifier dans history
        const { data: historical, error: err2 } = await supabase
            .from('history')
            .select('id')
            .or(`data->>emailUid.eq.${emailUid},data->>messageId.eq.${messageId}`)
            .limit(1);

        return historical && historical.length > 0;
    },

    async isDispatchDuplicate(taskId) {
        const { data, error } = await supabase
            .from('dispatch_pending')
            .select('id')
            .eq('task_id', taskId.toString())
            .limit(1);
        
        return data && data.length > 0;
    },

    async getEmailById(id) {
        const { data, error } = await supabase
            .from('emails_pending')
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) return null;
        return { ...data.data, id: data.id, status: data.status };
    },

    async getDispatchById(id) {
        const { data, error } = await supabase
            .from('dispatch_pending')
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) return null;
        return { ...data.data, id: data.id, status: data.status };
    },

    async findPendingByClient(partnerId, email) {
        let query = supabase
            .from('emails_pending')
            .select('*')
            .eq('status', 'pending');
        
        if (partnerId) {
            query = query.eq('data->partner->>id', partnerId.toString());
        } else {
            query = query.eq('data->email->>from', email);
        }

        const { data, error } = await query.limit(1);
        if (error || !data || data.length === 0) return null;
        return { ...data[0].data, id: data[0].id, status: data[0].status };
    },

    async updatePendingEmail(id, emailData) {
        const { error } = await supabase
            .from('emails_pending')
            .update({ data: emailData })
            .eq('id', id);
        
        if (error) throw error;
    }
};

module.exports = supabaseService;
