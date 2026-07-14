const SUPABASE_URL = 'https://ixmoqsfoilnpmlpgstxm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_MA_zm77TgThlb0awcaGIUg_Pm5bFw4w';
const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let currentProfile = null;

async function initAuth() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        currentUser = session.user;
        await _loadProfile();
        _showApp();
    } else {
        _showLogin();
    }

    _supabase.auth.onAuthStateChange(async (event, session) => {
        if (session) {
            currentUser = session.user;
            await _loadProfile();
            _showApp();
        } else {
            currentUser = null;
            currentProfile = null;
            _showLogin();
        }
    });
}

async function _loadProfile() {
    const { data } = await _supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();
    currentProfile = data;
    if (!data) return;
    document.getElementById('userLabel').textContent = data.depot_id;
    document.getElementById('adminPanelBtn').style.display =
        data.role === 'admin' ? 'inline-block' : 'none';
}

function _showLogin() {
    document.getElementById('loginOverlay').style.display = 'flex';
    document.getElementById('appContent').style.display = 'none';
}

function _showApp() {
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('appContent').style.display = 'flex';
    setTimeout(() => {
        if (typeof map !== 'undefined') map.invalidateSize();
    }, 100);
    if (typeof renderSavedSessions === 'function') renderSavedSessions();
}

window.doLogin = async function () {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn');
    const err = document.getElementById('loginError');
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Signing in...';
    const { error } = await _supabase.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    btn.textContent = 'Sign In';
    if (error) err.textContent = 'Email or password incorrect.';
};

window.doLogout = async function () {
    await _supabase.auth.signOut();
};

// ===== CLOUD SESSION CRUD =====

window.saveSessionCloud = async function (name, depotConfigId, stops, movedStops, hiddenRoutes) {
    const { error } = await _supabase.from('sessions').insert({
        user_id: currentUser.id,
        depot_id: currentProfile.depot_id,
        depot_config: depotConfigId,
        name,
        stops,
        moved_stops: movedStops,
        hidden_routes: hiddenRoutes
    });
    if (error) throw error;
};

window.getSessionsCloud = async function () {
    const { data, error } = await _supabase
        .from('sessions')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
};

window.deleteSessionCloud = async function (sessionId) {
    const { error } = await _supabase.from('sessions').delete().eq('id', sessionId);
    if (error) throw error;
};

// ===== ADMIN PANEL =====

window.toggleAdminPanel = async function () {
    const panel = document.getElementById('adminPanel');
    const visible = panel.style.display === 'flex';
    panel.style.display = visible ? 'none' : 'flex';
    if (!visible) {
        await _renderAdminSessions('all');
        await _renderAdminUsers();
    }
};

window.onAdminFilterChange = async function (value) {
    await _renderAdminSessions(value);
};

async function _renderAdminSessions(filter) {
    const el = document.getElementById('adminSessionsList');
    el.innerHTML = '<div style="color:#6b7280;font-size:13px;">Loading...</div>';
    try {
        let sessions = await getSessionsCloud();
        if (filter !== 'all') sessions = sessions.filter(s => s.depot_id === filter);
        if (!sessions.length) {
            el.innerHTML = '<div style="color:#6b7280;font-size:13px;">No sessions found.</div>';
            return;
        }
        el.innerHTML = sessions.map(s => `
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:8px;">
                <div style="font-weight:600;font-size:14px;">${s.name}</div>
                <div style="font-size:12px;color:#6b7280;margin-top:3px;">
                    <span style="background:#e0e7ff;color:#4338ca;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">${s.depot_id}</span>
                    &nbsp;${new Date(s.created_at).toLocaleString()}
                    &nbsp;&middot; ${Array.isArray(s.stops) ? s.stops.length : 0} stops
                </div>
                <button onclick="adminDeleteSession('${s.id}')"
                    style="margin-top:8px;padding:4px 12px;background:#dc2626;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;">
                    Delete
                </button>
            </div>
        `).join('');
    } catch (e) {
        el.innerHTML = '<div style="color:#dc2626;">Error loading sessions.</div>';
    }
}

async function _renderAdminUsers() {
    const el = document.getElementById('adminUsersList');
    el.innerHTML = '<div style="color:#6b7280;font-size:13px;">Loading...</div>';
    try {
        const { data } = await _supabase.from('profiles').select('*').order('depot_id');
        if (!data || !data.length) {
            el.innerHTML = '<div style="color:#6b7280;font-size:13px;">No users found.</div>';
            return;
        }
        el.innerHTML = data.map(p => `
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <span style="font-weight:600;">${p.depot_id}</span>
                    <span style="font-size:11px;margin-left:8px;padding:2px 8px;border-radius:10px;background:${p.role === 'admin' ? '#fef9c3' : '#f3f4f6'};color:${p.role === 'admin' ? '#854d0e' : '#6b7280'};">
                        ${p.role}
                    </span>
                </div>
            </div>
        `).join('');
    } catch (e) {
        el.innerHTML = '<div style="color:#dc2626;">Error loading users.</div>';
    }
}

window.adminDeleteSession = async function (id) {
    if (!confirm('Delete this session?')) return;
    await deleteSessionCloud(id);
    await _renderAdminSessions(document.getElementById('adminDepotFilter').value);
};

document.addEventListener('DOMContentLoaded', initAuth);
