import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mail, RefreshCw, ChevronRight, Send, Zap, Plus, X, Search, AlertTriangle, CheckCircle
} from 'lucide-react';

const API_BASE = '/api';

const App = () => {
    const [activeTab, setActiveTab] = useState('emails'); // 'emails' | 'dispatch'
    const [pending, setPending] = useState([]);
    const [scanning, setScanning] = useState(false);
    const [selected, setSelected] = useState(null);
    const [projects, setProjects] = useState([]);
    
    // States for Dispatch
    const [dispatchPending, setDispatchPending] = useState([]);
    const [dispatchScanning, setDispatchScanning] = useState(false);
    const [selectedDispatch, setSelectedDispatch] = useState(null);

    // Global Error State
    const [creditError, setCreditError] = useState(false);

    // States for Capacity
    const [capacity, setCapacity] = useState(0);
    const [modDate, setModDate] = useState('');
    const [modProject, setModProject] = useState('');
    const [modResponse, setModResponse] = useState('');

    // States for Partner Search
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [manualPartner, setManualPartner] = useState(null);

    // Manual Task Modal
    const [showManual, setShowManual] = useState(false);
    const [manualTask, setManualTask] = useState({ partnerId: '', projectId: '', name: '', description: '', dateDeadline: '' });

    useEffect(() => {
        fetchPending();
        fetchProjects();
        fetchDispatchPending();
    }, []);

    const fetchDispatchPending = async () => {
        try {
            const res = await axios.get(`${API_BASE}/dispatch/pending`);
            setDispatchPending(res.data);
        } catch (err) {
            console.error('Fetch dispatch error:', err);
        }
    };

    const fetchPending = async () => {
        try {
            const res = await axios.get(`${API_BASE}/pending`);
            setPending(res.data);
        } catch (err) {
            console.error('Fetch error:', err);
        }
    };

    const fetchProjects = async () => {
        try {
            const res = await axios.get(`${API_BASE}/projects`);
            setProjects(res.data);
        } catch (err) {
            console.error('Projects error:', err);
        }
    };

    const fetchCapacity = async (projectId, dateStr) => {
        if (!projectId || !dateStr) return;
        try {
            const res = await axios.get(`${API_BASE}/capacity?projectId=${projectId}&date=${dateStr}`);
            setCapacity(res.data.count);
        } catch (err) {
            console.error('Capacity error:', err);
        }
    };

    // Watch for date/project changes to update capacity
    useEffect(() => {
        if (selected && selected.ai.needsTask) {
            fetchCapacity(modProject, modDate);
        }
    }, [modProject, modDate, selected]);

    const handleScan = async () => {
        setScanning(true);
        setCreditError(false);
        try {
            await axios.post(`${API_BASE}/scan`);
            await fetchPending();
        } catch (err) {
            if (err.response?.status === 402) {
                setCreditError(true);
            } else {
                console.error(err);
            }
        } finally {
            setScanning(false);
        }
    };

    const handleDispatchScan = async () => {
        setDispatchScanning(true);
        setCreditError(false);
        try {
            await axios.post(`${API_BASE}/dispatch/scan`);
            await fetchDispatchPending();
        } catch (err) {
            if (err.response?.status === 402) {
                setCreditError(true);
            } else {
                console.error(err);
            }
        } finally {
            setDispatchScanning(false);
        }
    };

    const searchPartner = async (q) => {
        setSearchQuery(q);
        if (q.length > 2) {
            const res = await axios.get(`${API_BASE}/partners/search?q=${q}`);
            setSearchResults(res.data);
        } else {
            setSearchResults([]);
        }
    };

    const handleApprove = async () => {
        const finalPartnerId = manualPartner ? manualPartner.id : (selected.partner ? selected.partner.id : null);
        const data = {
            modifiedResponse: modResponse,
            modifiedDate: modDate ? modDate.replace('T', ' ') : null,
            projectId: modProject,
            partnerId: finalPartnerId,
            modifiedTitle: selected.ai.taskTitle
        };

        try {
            await axios.post(`${API_BASE}/approve/${selected.id}`, data);
            setSelected(null);
            fetchPending();
        } catch (err) {
            alert('Erreur lors de l\'envoi : ' + err.message);
        }
    };

    const handleDispatchApprove = async () => {
        const data = {
            projectId: modProject,
            dateDeadline: modDate ? modDate.replace('T', ' ') : null,
        };

        try {
            await axios.post(`${API_BASE}/dispatch/approve/${selectedDispatch.id}`, data);
            setSelectedDispatch(null);
            fetchDispatchPending();
        } catch (err) {
            alert('Erreur: ' + err.message);
        }
    };

    const handleMarkSeen = async (id, folder, emailUid) => {
        try {
            await axios.post(`${API_BASE}/emails/mark-seen`, { id, folder, emailUid });
            setSelected(null);
            fetchPending();
        } catch (err) {
            alert('Erreur lors du marquage : ' + err.message);
        }
    };

    const handleManualTaskSubmit = async (e) => {
        e.preventDefault();
        try {
            const data = { ...manualTask, partnerId: manualPartner?.id };
            await axios.post(`${API_BASE}/manual-task`, data);
            setShowManual(false);
            alert('Tâche créée avec succès dans Odoo !');
        } catch (err) {
            alert('Erreur : ' + err.message);
        }
    };

    const openModal = (item) => {
        setSelected(item);
        setModDate(item.ai.proposedDate ? item.ai.proposedDate.replace(' ', 'T').slice(0, 16) : '');
        setModProject(item.ai.suggestedProjectId || (projects.length > 0 ? projects[0].id : ''));
        setModResponse(item.ai.emailResponse || '');
        setManualPartner(item.partner);
        setSearchQuery('');
        setSearchResults([]);
    };

    const openDispatchModal = (item) => {
        setSelectedDispatch(item);
        setModDate(item.ai.proposedDate ? item.ai.proposedDate.replace(' ', 'T').slice(0, 16) : '');
        setModProject(item.ai.suggestedProjectId || (projects.length > 0 ? projects[0].id : ''));
    };

    return (
        <div className="app-container">
            {creditError && (
                <motion.div 
                    initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                    style={{ 
                        background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', 
                        color: '#fca5a5', padding: '16px', borderRadius: '12px', 
                        marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '12px',
                        justifyContent: 'space-between'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <AlertTriangle size={20} />
                        <div>
                            <strong style={{ display: 'block' }}>Crédits OpenAI épuisés</strong>
                            <span style={{ fontSize: '0.85rem' }}>Votre quota API a été atteint. Merci de recharger votre compte OpenAI pour continuer l'analyse.</span>
                        </div>
                    </div>
                    <a href="https://platform.openai.com/settings/organization/billing/overview" target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '8px 16px' }}>Recharger</a>
                </motion.div>
            )}

            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '48px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ background: 'var(--accent-color)', padding: '10px', borderRadius: '12px' }}>
                        <Zap size={28} color="#020617" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.5rem' }}>Agreen Logistics</h1>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Gestion du planning par IA</p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <div className="tabs-container">
                        <button 
                            className={`tab ${activeTab === 'emails' ? 'active' : ''}`} 
                            onClick={() => setActiveTab('emails')}
                        >
                            <Mail size={18} /> Emails
                        </button>
                        <button 
                            className={`tab ${activeTab === 'dispatch' ? 'active' : ''}`} 
                            onClick={() => setActiveTab('dispatch')}
                        >
                            <Zap size={18} /> Dépannages
                        </button>
                    </div>

                    <button title="Planification Libre" className="btn btn-secondary" style={{ padding: '12px' }} onClick={() => {
                        setShowManual(true);
                        setManualPartner(null);
                        setSearchQuery('');
                    }}>
                        <Plus size={20} />
                    </button>
                    
                    {activeTab === 'emails' ? (
                        <button 
                            className="btn btn-primary"
                            onClick={handleScan}
                            disabled={scanning}
                        >
                            <RefreshCw className={scanning ? "pulse" : ""} size={18} />
                            {scanning ? 'Scan...' : 'Scanner les emails'}
                        </button>
                    ) : (
                        <button 
                            className="btn btn-primary scan-btn"
                            onClick={handleDispatchScan}
                            disabled={dispatchScanning}
                        >
                            <Zap className={dispatchScanning ? "pulse" : ""} size={18} />
                            {dispatchScanning ? 'Scan...' : 'Scanner Odoo'}
                        </button>
                    )}
                </div>
            </header>

            {/* List */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                <AnimatePresence>
                    {/* EMAILS LIST */}
                    {activeTab === 'emails' && pending.length === 0 && !scanning && (
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            style={{ textAlign: 'center', padding: '100px', color: 'var(--text-secondary)' }}
                        >
                            <Mail size={48} style={{ marginBottom: '16px', opacity: 0.5, margin: '0 auto' }} />
                            <p>Aucun email en attente. Tout est sous contrôle !</p>
                        </motion.div>
                    )}

                    {activeTab === 'emails' && pending.map((item) => (
                        <motion.div 
                            key={item.id}
                            layout
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="glass item-card urgent"
                            onClick={() => openModal(item)}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                <div style={{ 
                                    width: '48px', height: '48px', 
                                    background: item.ai.needsTask ? 'var(--accent-glow)' : 'rgba(255,255,255,0.05)',
                                    borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: item.ai.needsTask ? 'var(--accent-color)' : 'var(--text-secondary)'
                                }}>
                                    {item.ai.needsTask ? <Zap size={22} /> : <Mail size={22} />}
                                </div>
                                <div>
                                    <h3 style={{ marginBottom: '4px', fontSize: '1.1rem' }}>{(item.partner && item.partner.name) ? item.partner.name : (item.email.fromName || item.email.from)}</h3>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span className="badge badge-new" style={{ fontSize: '0.65rem' }}>{new Date(item.email.date).toLocaleDateString('fr-FR')}</span>
                                        {item.email.subject}
                                    </p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{ textAlign: 'right' }}>
                                    <span style={{ 
                                        display: 'block', fontSize: '0.9rem', fontWeight: '800', color: 'var(--accent-color)'
                                    }}>
                                        {item.ai.proposedDate ? new Date(item.ai.proposedDate).toLocaleDateString('fr-FR') : 'Date...'}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>
                                        {item.ai.suggestedProjectId === 17 ? 'Arlon' : item.ai.suggestedProjectId === 1 ? 'Bastogne' : item.ai.suggestedProjectId === 3 ? 'Libramont' : 'À dispatcher'}
                                    </span>
                                </div>
                                <ChevronRight size={20} style={{ opacity: 0.3 }} />
                            </div>
                        </motion.div>
                    ))}

                    {/* DISPATCH LIST */}
                    {activeTab === 'dispatch' && dispatchPending.length === 0 && !dispatchScanning && (
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            style={{ textAlign: 'center', padding: '100px', color: 'var(--text-secondary)' }}
                        >
                            <Zap size={48} style={{ marginBottom: '16px', opacity: 0.5, margin: '0 auto' }} />
                            <p>Aucune tâche en attente de dispatch dans Odoo.</p>
                        </motion.div>
                    )}

                    {activeTab === 'dispatch' && dispatchPending.map((item) => (
                        <motion.div 
                            key={item.id}
                            layout
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="glass item-card urgent"
                            onClick={() => openDispatchModal(item)}
                        >
                            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                                <div style={{ 
                                    width: '48px', height: '48px', background: 'var(--accent-glow)',
                                    borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'var(--accent-color)'
                                }}>
                                    <Zap size={22} />
                                </div>
                                <div>
                                    <h3 style={{ marginBottom: '4px', fontSize: '1.1rem' }}>{item.taskName}</h3>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                        {item.partner.name} {item.partner.city ? `(${item.partner.zip} ${item.partner.city})` : '(Adresse inconnue)'}
                                    </p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{ textAlign: 'right' }}>
                                    <span style={{ 
                                        display: 'block', fontSize: '0.9rem', fontWeight: '800', color: 'var(--accent-color)'
                                    }}>
                                        {item.ai.proposedDate ? new Date(item.ai.proposedDate).toLocaleDateString('fr-FR') : 'À planifier'}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>
                                        {item.ai.suggestedProjectId === 17 ? 'Arlon' : item.ai.suggestedProjectId === 1 ? 'Bastogne' : item.ai.suggestedProjectId === 3 ? 'Libramont' : 'Générique'}
                                    </span>
                                </div>
                                <ChevronRight size={20} style={{ opacity: 0.3 }} />
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Email Revision Modal */}
            {selected && (
                <div style={{ 
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
                    background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
                    zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
                }}>
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        className="glass"
                        style={{ width: '90%', maxWidth: '1000px', maxHeight: '90vh', overflowY: 'auto', padding: '40px' }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                            <h2 style={{ fontSize: '1.4rem' }}>Révision et Planification</h2>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button className="btn btn-secondary" style={{ color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }} onClick={() => handleMarkSeen(selected.id, selected.email.folder, selected.email.uid)}>
                                    Ignorer & Lu
                                </button>
                                <button className="btn btn-secondary" style={{ padding: '10px' }} onClick={() => setSelected(null)}><X size={20}/></button>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>CLIENT ODOO</label>
                                <div style={{ marginBottom: '24px' }}>
                                    {!manualPartner ? (
                                        <div style={{ position: 'relative' }}>
                                            <Search size={16} style={{ position: 'absolute', left: 12, top: 14, opacity: 0.5 }} />
                                            <input 
                                                type="text" className="input-field" 
                                                placeholder="Rechercher par nom..." value={searchQuery}
                                                onChange={(e) => searchPartner(e.target.value)}
                                                style={{ paddingLeft: '40px' }}
                                            />
                                            {searchResults.length > 0 && (
                                                <div className="glass" style={{ 
                                                    position: 'absolute', width: '100%', zIndex: 10, marginTop: '4px', 
                                                    maxHeight: '200px', overflowY: 'auto', 
                                                    background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)',
                                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                                                }}>
                                                    {searchResults.map(p => (
                                                        <div key={p.id} style={{ padding: '12px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }} onClick={() => { setManualPartner(p); setSearchResults([]); }}>
                                                            {p.name} <span style={{ opacity: 0.5 }}>- {p.city}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="glass" style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontWeight: '800', fontSize: '1.1rem' }}>{manualPartner.name}</div>
                                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                    {manualPartner.zip} {manualPartner.city}
                                                </div>
                                            </div>
                                            <button onClick={() => setManualPartner(null)} style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', fontWeight: '600' }}>Modifier</button>
                                        </div>
                                    )}
                                </div>

                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>EMAIL ORIGINAL</label>
                                <div className="glass" style={{ padding: '16px', fontSize: '0.9rem', marginBottom: '24px', whiteSpace: 'pre-wrap', maxHeight: '250px', overflowY: 'auto' }}>
                                    {selected.email.body}
                                </div>

                                {selected.ai.needsTask && (
                                    <>
                                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>LOGIQUE IA</label>
                                        <div style={{ fontSize: '0.9rem', color: 'var(--accent-color)', marginBottom: '24px', paddingLeft: '12px', borderLeft: '3px solid var(--accent-color)' }}>
                                            {selected.ai.reasoning}
                                        </div>
                                    </>
                                )}
                            </div>

                            <div>
                                {selected.ai.needsTask && (
                                    <>
                                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>PROJET ODOO (ROUTAGE)</label>
                                        <select className="input-field" value={modProject} onChange={(e) => setModProject(e.target.value)}>
                                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>

                                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px', marginTop: '24px' }}>DATE D'INTERVENTION</label>
                                        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                                            <input 
                                                type="datetime-local" className="input-field" 
                                                value={modDate} onChange={(e) => setModDate(e.target.value)}
                                            />
                                            {capacity >= 7 ? (
                                                <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <AlertTriangle size={18}/> {capacity} / 8 prévues
                                                </div>
                                            ) : (
                                                <div style={{ background: 'rgba(168, 85, 247, 0.1)', color: 'var(--accent-color)', padding: '12px', borderRadius: '8px' }}>
                                                    {capacity} / 8 prévues
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}

                                <label className="field-label">Réponse Email (Optimisée par l'IA)</label>
                                <textarea 
                                    className="input-field" style={{ height: '220px', fontFamily: 'monospace', fontSize: '0.9rem' }}
                                    value={modResponse} onChange={(e) => setModResponse(e.target.value)}
                                ></textarea>

                                <button className="btn btn-primary" style={{ width: '100%', height: '56px', fontSize: '1.1rem', marginTop: '24px' }} onClick={handleApprove}>
                                    <Send size={20} /> Valider & Envoyer
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}

            {selectedDispatch && (
                <div style={{ 
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
                    background: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(12px)',
                    zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
                }}>
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass" style={{ width: '90%', maxWidth: '900px', padding: '40px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                            <h2 style={{ fontSize: '1.4rem' }}>Optimisation du Dispatching</h2>
                            <button className="btn btn-secondary" style={{ padding: '10px' }} onClick={() => setSelectedDispatch(null)}><X size={20}/></button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
                            <div>
                                <label className="field-label">Informations Client</label>
                                <div className="glass" style={{ padding: '16px', marginBottom: '24px' }}>
                                    <div style={{ fontWeight: '800', fontSize: '1.1rem' }}>{selectedDispatch.partner.name}</div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                        {selectedDispatch.partner.zip} {selectedDispatch.partner.city || 'Ville inconnue'}
                                    </div>
                                </div>

                                <label className="field-label">Tâche Odoo d'origine</label>
                                <div style={{ marginBottom: '24px' }}>
                                    <div style={{ fontWeight: '700', marginBottom: '8px', fontSize: '1rem' }}>{selectedDispatch.taskName}</div>
                                    <div className="glass" style={{ padding: '16px', fontSize: '0.9rem', whiteSpace: 'pre-wrap', maxHeight: '200px', overflowY: 'auto' }}>
                                        {selectedDispatch.taskDescription || 'Aucune description.'}
                                    </div>
                                </div>

                                <label className="field-label">Analyse du Routing</label>
                                <div style={{ fontSize: '0.9rem', color: 'var(--accent-color)', paddingLeft: '12px', borderLeft: '3px solid var(--accent-color)' }}>
                                    {selectedDispatch.ai.reasoning}
                                </div>
                            </div>

                            <div>
                                <label className="field-label">Secteur Cible (IA)</label>
                                <select className="input-field" value={modProject} onChange={(e) => setModProject(e.target.value)} style={{ marginBottom: '24px' }}>
                                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>

                                <label className="field-label">Date suggérée</label>
                                <input 
                                    type="datetime-local" className="input-field" 
                                    value={modDate} onChange={(e) => setModDate(e.target.value)}
                                    style={{ marginBottom: '24px' }}
                                />

                                <button className="btn btn-primary" style={{ width: '100%', height: '56px', fontSize: '1.1rem' }} onClick={handleDispatchApprove}>
                                    <CheckCircle size={20} /> Valider le Dispatching
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Manual Task Modal */}
            {showManual && (
                <div style={{ 
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
                    background: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(12px)',
                    zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
                }}>
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass" style={{ width: '100%', maxWidth: '600px', padding: '40px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                            <h2 style={{ fontSize: '1.4rem' }}>Planification Manuelle</h2>
                            <button className="btn btn-secondary" style={{ padding: '10px' }} onClick={() => setShowManual(false)}><X size={20}/></button>
                        </div>
                        <form onSubmit={handleManualTaskSubmit}>
                            <div style={{ marginBottom: '24px' }}>
                                <label className="field-label">Rechercher un Client</label>
                                {!manualPartner ? (
                                    <div style={{ position: 'relative' }}>
                                        <Search size={16} style={{ position: 'absolute', left: 12, top: 14, opacity: 0.5 }} />
                                        <input 
                                            type="text" className="input-field" placeholder="Nom ou email..." 
                                            value={searchQuery} onChange={(e) => searchPartner(e.target.value)}
                                            style={{ paddingLeft: '40px' }}
                                        />
                                        {searchResults.length > 0 && (
                                            <div className="glass" style={{ position: 'absolute', width: '100%', zIndex: 10, marginTop: '4px', maxHeight: '150px', overflowY: 'auto', background: 'var(--bg-card)' }}>
                                                {searchResults.map(p => (
                                                    <div key={p.id} style={{ padding: '12px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)' }} onClick={() => { setManualPartner(p); setSearchResults([]); }}>
                                                        {p.name} <span style={{ opacity: 0.5 }}>- {p.city}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="glass" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: '700' }}>{manualPartner.name}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{manualPartner.city}</div>
                                        </div>
                                        <button type="button" onClick={() => setManualPartner(null)} style={{ background: 'none', border: 'none', color: 'var(--accent-color)', fontWeight: '600', cursor: 'pointer' }}>Changer</button>
                                    </div>
                                )}
                            </div>

                            <label className="field-label">Détails de l'intervention</label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                                <div>
                                    <select className="input-field" required value={manualTask.projectId} onChange={(e) => setManualTask({...manualTask, projectId: e.target.value})}>
                                        <option value="">Projet...</option>
                                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <input type="datetime-local" className="input-field" required value={manualTask.dateDeadline} onChange={(e) => setManualTask({...manualTask, dateDeadline: e.target.value.replace('T', ' ')})} />
                                </div>
                            </div>

                            <div style={{ marginBottom: '20px' }}>
                                <input type="text" className="input-field" placeholder="Objet de la tâche..." required value={manualTask.name} onChange={(e) => setManualTask({...manualTask, name: e.target.value})} />
                            </div>

                            <div style={{ marginBottom: '32px' }}>
                                <textarea className="input-field" placeholder="Description détaillée..." style={{ height: '100px' }} value={manualTask.description} onChange={(e) => setManualTask({...manualTask, description: e.target.value})}></textarea>
                            </div>

                            <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '56px' }} disabled={!manualPartner || !manualTask.projectId}>
                                <Plus size={20} /> Enregistrer dans Odoo
                            </button>
                        </form>
                    </motion.div>
                </div>
            )}
        </div>
    );
};

export default App;
