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

const BACKEND = 'https://joybuy-route-planner-dev.onrender.com';

async function _getToken() {
    const { data: { session } } = await _supabase.auth.getSession();
    return session?.access_token || '';
}

async function _renderAdminUsers() {
    const el = document.getElementById('adminUsersList');
    el.innerHTML = '<div style="color:#6b7280;font-size:13px;">Loading...</div>';
    try {
        const token = await _getToken();
        const r = await fetch(`${BACKEND}/admin/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await r.json();
        const users = data.users || [];

        el.innerHTML = `
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;margin-bottom:14px;">
                <div style="font-weight:700;margin-bottom:10px;color:#166534;font-size:13px;">+ Create New User</div>
                <input id="newUserEmail" type="email" placeholder="email@joybuy.com"
                    style="display:block;width:100%;padding:8px;margin-bottom:7px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;">
                <input id="newUserPassword" type="password" placeholder="Password"
                    style="display:block;width:100%;padding:8px;margin-bottom:7px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;">
                <div style="display:flex;gap:7px;margin-bottom:8px;">
                    <select id="newUserDepot" style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
                        <option value="LE11">Leicester (LE11)</option>
                        <option value="B66">Birmingham (B66)</option>
                        <option value="LTN">Luton (LTN)</option>
                        <option value="CVY">Coventry (CVY)</option>
                        <option value="admin">Admin</option>
                    </select>
                    <select id="newUserRole" style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
                        <option value="depot">depot</option>
                        <option value="admin">admin</option>
                    </select>
                </div>
                <div id="createUserError" style="color:#dc2626;font-size:12px;min-height:16px;margin-bottom:6px;"></div>
                <button onclick="adminCreateUser()"
                    style="width:100%;padding:8px;background:#16a34a;color:white;border:none;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px;">
                    Create User
                </button>
            </div>
            <div id="usersListInner">
                ${users.map(u => _userCard(u)).join('')}
            </div>
        `;
    } catch (e) {
        el.innerHTML = '<div style="color:#dc2626;">Error loading users.</div>';
        console.error(e);
    }
}

function _userCard(u) {
    const depotId = u.user_metadata?.depot_id || '?';
    const role = u.user_metadata?.role || 'depot';
    const id = u.id;
    return `
        <div id="userCard_${id}" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div>
                    <div style="font-weight:600;font-size:13px;">${u.email}</div>
                    <div style="margin-top:4px;">
                        <span style="background:#e0e7ff;color:#4338ca;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">${depotId}</span>
                        <span style="margin-left:4px;background:${role==='admin'?'#fef9c3':'#f3f4f6'};color:${role==='admin'?'#854d0e':'#6b7280'};padding:2px 8px;border-radius:10px;font-size:11px;">${role}</span>
                    </div>
                </div>
                <div style="display:flex;gap:5px;flex-shrink:0;">
                    <button onclick="adminToggleEdit('${id}')"
                        style="padding:4px 10px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;">Edit</button>
                    <button onclick="adminDeleteUser('${id}','${u.email}')"
                        style="padding:4px 10px;background:#dc2626;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;">Delete</button>
                </div>
            </div>
            <div id="editForm_${id}" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid #e5e7eb;">
                <input id="editPassword_${id}" type="password" placeholder="New password (leave blank to keep)"
                    style="display:block;width:100%;padding:7px;margin-bottom:6px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;">
                <div style="display:flex;gap:6px;margin-bottom:8px;">
                    <select id="editDepot_${id}" style="flex:1;padding:7px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
                        <option value="LE11" ${depotId==='LE11'?'selected':''}>Leicester (LE11)</option>
                        <option value="B66" ${depotId==='B66'?'selected':''}>Birmingham (B66)</option>
                        <option value="LTN" ${depotId==='LTN'?'selected':''}>Luton (LTN)</option>
                        <option value="CVY" ${depotId==='CVY'?'selected':''}>Coventry (CVY)</option>
                        <option value="admin" ${depotId==='admin'?'selected':''}>Admin</option>
                    </select>
                    <select id="editRole_${id}" style="flex:1;padding:7px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
                        <option value="depot" ${role==='depot'?'selected':''}>depot</option>
                        <option value="admin" ${role==='admin'?'selected':''}>admin</option>
                    </select>
                </div>
                <div style="display:flex;gap:6px;">
                    <button onclick="adminSaveUser('${id}')"
                        style="flex:1;padding:7px;background:#16a34a;color:white;border:none;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px;">Save</button>
                    <button onclick="adminToggleEdit('${id}')"
                        style="padding:7px 12px;background:#6b7280;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;">Cancel</button>
                </div>
            </div>
        </div>
    `;
}

window.adminToggleEdit = function(id) {
    const f = document.getElementById(`editForm_${id}`);
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
};

window.adminSaveUser = async function(userId) {
    const password = document.getElementById(`editPassword_${userId}`).value;
    const depotId  = document.getElementById(`editDepot_${userId}`).value;
    const role     = document.getElementById(`editRole_${userId}`).value;
    const token    = await _getToken();
    const body     = { depot_id: depotId, role };
    if (password) body.password = password;
    try {
        const r = await fetch(`${BACKEND}/admin/users/${userId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!r.ok) throw new Error();
        await _renderAdminUsers();
    } catch { alert('Error saving user.'); }
};

window.adminCreateUser = async function() {
    const email    = document.getElementById('newUserEmail').value.trim();
    const password = document.getElementById('newUserPassword').value;
    const depotId  = document.getElementById('newUserDepot').value;
    const role     = document.getElementById('newUserRole').value;
    const errEl    = document.getElementById('createUserError');
    errEl.textContent = '';
    if (!email || !password) { errEl.textContent = 'Email and password required.'; return; }
    const token = await _getToken();
    try {
        const r = await fetch(`${BACKEND}/admin/users`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, depot_id: depotId, role })
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.detail || 'Error');
        await _renderAdminUsers();
    } catch (e) { errEl.textContent = e.message || 'Error creating user.'; }
};

window.adminDeleteUser = async function(userId, email) {
    if (!confirm(`Delete user ${email}?`)) return;
    const token = await _getToken();
    try {
        await fetch(`${BACKEND}/admin/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        await _renderAdminUsers();
    } catch { alert('Error deleting user.'); }
};

window.adminDeleteSession = async function (id) {
    if (!confirm('Delete this session?')) return;
    await deleteSessionCloud(id);
    await _renderAdminSessions(document.getElementById('adminDepotFilter').value);
};

document.addEventListener('DOMContentLoaded', initAuth);
