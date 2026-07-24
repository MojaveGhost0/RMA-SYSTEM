
const SUPABASE_URL = 'https://xdoomnicsgcvaazlyvdz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhkb29tbmljc2djdmFhemx5dmR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MTg5MDcsImV4cCI6MjA5OTE5NDkwN30.RNE27UapcPtJn_jXkyjB-DBzraGPaYGrrVxLuZK1dt8';

var dbClient = null;

(function initSupabase() {
    try {
        var lib = window.supabase;
        if (lib && typeof lib.createClient === 'function') {
            dbClient = lib.createClient(SUPABASE_URL, SUPABASE_KEY);
            console.log('Supabase conectado correctamente.');
        } else {
            console.error('Supabase CDN no disponible.');
        }
    } catch (e) {
        console.error('Error iniciando Supabase:', e);
    }
})();

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function hashPassword(plainText) {
    if (!plainText) return '';
    try {
        var msgUint8 = new TextEncoder().encode(plainText);
        var hashBuffer = await window.crypto.subtle.digest('SHA-256', msgUint8);
        var hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    } catch (e) {
        console.error('Error calculando Hash SHA-256:', e);
        return plainText;
    }
}


var loginFailedAttempts = 0;
var loginLockoutUntil = 0;


var currentSession = null;
try {
    var storedSession = localStorage.getItem('rma_user_session');
    if (storedSession) currentSession = JSON.parse(storedSession);
} catch (e) {
    currentSession = null;
}

var currentUser = currentSession ? currentSession.nombre : '';
var currentView = 'dashboard';
var searchQuery = '';
var rmas = [];
var users = [];

const DEFAULT_ADMIN_HASH = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';

var DEFAULT_USERS = [
    { id: 1, username: 'admin', password: DEFAULT_ADMIN_HASH, nombre: 'Administrador Principal', rol: 'admin' }
];

function getLocalUsers() {
    var stored = localStorage.getItem('rma_users_local');
    if (!stored) {
        localStorage.setItem('rma_users_local', JSON.stringify(DEFAULT_USERS));
        return DEFAULT_USERS;
    }
    try {
        var list = JSON.parse(stored);
        list.forEach(function (u) {
            if (u.username === 'admin' && u.password === 'admin123') {
                u.password = DEFAULT_ADMIN_HASH;
            }
        });
        localStorage.setItem('rma_users_local', JSON.stringify(list));
        return list;
    } catch (e) {
        return DEFAULT_USERS;
    }
}

function saveLocalUsers(list) {
    localStorage.setItem('rma_users_local', JSON.stringify(list));
}

function getLocalRMAs() {
    var stored = localStorage.getItem('rma_local_data');
    if (!stored) return [];
    try { return JSON.parse(stored); } catch (e) { return []; }
}

function saveLocalRMAs(data) {
    localStorage.setItem('rma_local_data', JSON.stringify(data));
}

// --- INICIO ---
document.addEventListener('DOMContentLoaded', function () {
    if (!currentSession) {
        showLoginModal();
    } else {
        applyUserSessionUI();
        fetchRMAs();
    }

    var fechaInput = document.getElementById('inp-fecharec');
    if (fechaInput) fechaInput.valueAsDate = new Date();

    if (dbClient) {
        dbClient.channel('public:rmas')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'rmas' }, fetchRMAs)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'trazabilidad' }, fetchRMAs)
            .subscribe();
    }
});

// --- MANEJO DE SESION Y LOGIN SEGURO ---
function showLoginModal() {
    var modal = document.getElementById('modal-login');
    if (modal) modal.classList.remove('opacity-0', 'pointer-events-none');
}

function hideLoginModal() {
    var modal = document.getElementById('modal-login');
    if (modal) modal.classList.add('opacity-0', 'pointer-events-none');
}

function applyUserSessionUI() {
    if (!currentSession) return;
    var nameEl = document.getElementById('header-operator-name');
    var userEl = document.getElementById('header-user-username');
    var badgeEl = document.getElementById('header-user-role-badge');
    var navUsers = document.getElementById('nav-users');

    if (nameEl) nameEl.innerText = currentSession.nombre;
    if (userEl) userEl.innerText = '@' + currentSession.username;

    if (badgeEl) {
        if (currentSession.rol === 'admin') {
            badgeEl.innerText = 'ADMIN';
            badgeEl.className = 'px-2.5 py-0.5 text-[10px] font-extrabold rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 uppercase tracking-wide';
        } else {
            badgeEl.innerText = 'OPERADOR';
            badgeEl.className = 'px-2.5 py-0.5 text-[10px] font-extrabold rounded-full bg-blue-50 text-blue-600 border border-blue-200 uppercase tracking-wide';
        }
    }

    if (navUsers) {
        if (currentSession.rol === 'admin') {
            navUsers.classList.remove('hide');
        } else {
            navUsers.classList.add('hide');
        }
    }
}

async function handleLoginSubmit(e) {
    e.preventDefault();
    var username = document.getElementById('inp-login-username').value.trim();
    var password = document.getElementById('inp-login-password').value.trim();
    var errContainer = document.getElementById('login-error-msg');
    var errText = document.getElementById('login-error-text');

    if (errContainer) errContainer.classList.add('hidden');

    var now = Date.now();
    if (now < loginLockoutUntil) {
        var secondsLeft = Math.ceil((loginLockoutUntil - now) / 1000);
        if (errContainer) errContainer.classList.remove('hidden');
        if (errText) errText.innerText = 'Acceso bloqueado temporalmente por seguridad. Intente de nuevo en ' + secondsLeft + ' segundos.';
        return;
    }

    var hashedInputPassword = await hashPassword(password);
    var foundUser = null;

    if (dbClient) {
        try {
            var res = await dbClient
                .from('usuarios')
                .select('*')
                .eq('username', username)
                .single();

            if (res.data) {

                if (res.data.password === hashedInputPassword || res.data.password === password) {
                    foundUser = res.data;
                }
            }
        } catch (err) {
            console.warn('Verificando almacenamiento local:', err);
        }
    }

    if (!foundUser) {
        var localUsers = getLocalUsers();
        foundUser = localUsers.find(function (u) {
            var isUserMatch = u.username.toLowerCase() === username.toLowerCase();
            var isPassMatch = u.password === hashedInputPassword || u.password === password;
            return isUserMatch && isPassMatch;
        });
    }

    if (foundUser) {
        loginFailedAttempts = 0;
        loginLockoutUntil = 0;

        currentSession = {
            id: foundUser.id,
            username: foundUser.username,
            nombre: foundUser.nombre,
            rol: foundUser.rol
        };
        localStorage.setItem('rma_user_session', JSON.stringify(currentSession));
        currentUser = foundUser.nombre;

        hideLoginModal();
        applyUserSessionUI();
        fetchRMAs();
    } else {
        loginFailedAttempts++;
        if (loginFailedAttempts >= 5) {
            loginLockoutUntil = Date.now() + 60000; // 60 segundos de bloqueo
            if (errContainer) errContainer.classList.remove('hidden');
            if (errText) errText.innerText = 'Demasiados intentos fallidos. Acceso bloqueado durante 60 segundos.';
        } else {
            var remaining = 5 - loginFailedAttempts;
            if (errContainer) errContainer.classList.remove('hidden');
            if (errText) errText.innerText = 'Usuario o contraseña incorrectos. Quedan ' + remaining + ' intentos.';
        }
    }
}

function logout() {
    currentSession = null;
    localStorage.removeItem('rma_user_session');
    var navUsers = document.getElementById('nav-users');
    if (navUsers) navUsers.classList.add('hide');
    showLoginModal();
}

function openUserManagementModal() {
    if (!currentSession || currentSession.rol !== 'admin') {
        alert('Acceso restringido únicamente a Administradores.');
        return;
    }
    var modal = document.getElementById('modal-users');
    var content = document.getElementById('modal-users-content');
    modal.classList.remove('opacity-0', 'pointer-events-none');
    content.classList.remove('scale-95');
    fetchUsers();
}

function closeUserManagementModal() {
    var modal = document.getElementById('modal-users');
    var content = document.getElementById('modal-users-content');
    modal.classList.add('opacity-0', 'pointer-events-none');
    content.classList.add('scale-95');
}

async function fetchUsers() {
    var tbody = document.getElementById('users-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    var userList = [];
    if (dbClient) {
        try {
            var res = await dbClient.from('usuarios').select('*').order('id', { ascending: true });
            if (!res.error && res.data) {
                userList = res.data;
            }
        } catch (e) {
            console.warn('Fallback a usuarios locales:', e);
        }
    }

    if (userList.length === 0) {
        userList = getLocalUsers();
    }
    users = userList;

    userList.forEach(function (u) {
        var isCurrent = currentSession && currentSession.username.toLowerCase() === u.username.toLowerCase();
        var roleBadge = u.rol === 'admin'
            ? '<span class="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 uppercase">Admin</span>'
            : '<span class="px-2.5 py-1 text-xs font-bold rounded-full bg-blue-50 text-blue-600 border border-blue-200 uppercase">Operador</span>';

        var delBtn = isCurrent
            ? '<span class="text-xs font-semibold text-slate-400 italic">Sesión actual</span>'
            : '<button onclick="deleteUser(\'' + escapeHTML(u.id) + '\', \'' + escapeHTML(u.username) + '\')" class="text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 transition-all font-semibold text-xs inline-flex items-center gap-1.5"><i class="fa-solid fa-trash"></i> Eliminar</button>';

        tbody.innerHTML += '<tr class="hover:bg-slate-50 transition-colors">'
            + '<td class="py-3.5 px-6 font-bold text-slate-800">' + escapeHTML(u.nombre) + '</td>'
            + '<td class="py-3.5 px-6 font-medium text-slate-600">@' + escapeHTML(u.username) + '</td>'
            + '<td class="py-3.5 px-6">' + roleBadge + '</td>'
            + '<td class="py-3.5 px-6 text-right">' + delBtn + '</td>'
            + '</tr>';
    });
}

async function handleCreateUserSubmit(e) {
    e.preventDefault();
    if (!currentSession || currentSession.rol !== 'admin') {
        alert('Solo los administradores pueden registrar nuevos usuarios.');
        return;
    }

    var nombre = document.getElementById('inp-user-nombre').value.trim();
    var username = document.getElementById('inp-user-username').value.trim().toLowerCase();
    var password = document.getElementById('inp-user-password').value.trim();
    var rol = document.getElementById('inp-user-rol').value;

    var exists = users.some(function (u) { return u.username.toLowerCase() === username; });
    if (exists) {
        alert('El nombre de usuario "@' + username + '" ya se encuentra registrado. Por favor elija otro.');
        return;
    }

    var hashedPassword = await hashPassword(password);

    var newUser = {
        username: username,
        password: hashedPassword,
        nombre: nombre,
        rol: rol
    };

    var savedInSupabase = false;

    if (dbClient) {
        try {
            var res = await dbClient.from('usuarios').insert([newUser]);
            if (res.error) {
                console.warn('No se pudo insertar en Supabase:', res.error);
            } else {
                savedInSupabase = true;
            }
        } catch (err) {
            console.error('Error registrando usuario:', err);
        }
    }

    if (!savedInSupabase) {
        var localList = getLocalUsers();
        newUser.id = Date.now();
        localList.push(newUser);
        saveLocalUsers(localList);
    }

    document.getElementById('form-create-user').reset();
    fetchUsers();
    alert('Usuario "@' + username + '" registrado correctamente con contraseña cifrada.');
}

async function deleteUser(id, username) {
    if (!currentSession || currentSession.rol !== 'admin') {
        alert('Solo los administradores pueden eliminar usuarios.');
        return;
    }

    if (currentSession.username.toLowerCase() === username.toLowerCase()) {
        alert('No puedes eliminar tu propia cuenta de usuario activa.');
        return;
    }

    if (!confirm('¿Seguro que deseas eliminar al usuario @' + username + '?')) return;

    var deletedInSupabase = false;
    if (dbClient && id && !isNaN(Number(id))) {
        try {
            var res = await dbClient.from('usuarios').delete().eq('id', id);
            if (!res.error) deletedInSupabase = true;
        } catch (err) {
            console.error(err);
        }
    }

    if (!deletedInSupabase) {
        var localList = getLocalUsers().filter(function (u) { return u.username.toLowerCase() !== username.toLowerCase(); });
        saveLocalUsers(localList);
    }

    fetchUsers();
}

// --- CARGAR RMAs ---
async function fetchRMAs() {
    var data = [];
    var loadedFromSupabase = false;

    if (dbClient) {
        try {
            var result = await dbClient
                .from('rmas')
                .select('*, trazabilidad(*)')
                .order('id', { ascending: true });

            if (!result.error && result.data) {
                data = result.data;
                loadedFromSupabase = true;
            } else {
                var rmasRes = await dbClient.from('rmas').select('*').order('id', { ascending: true });
                var trazRes = await dbClient.from('trazabilidad').select('*').order('id', { ascending: true });

                if (!rmasRes.error && rmasRes.data) {
                    var rmasList = rmasRes.data;
                    var trazList = (!trazRes.error && trazRes.data) ? trazRes.data : [];

                    rmasList.forEach(function (r) {
                        r.trazabilidad = trazList.filter(function (t) {
                            return String(t.rma_id) === String(r.id);
                        });
                    });
                    data = rmasList;
                    loadedFromSupabase = true;
                }
            }
        } catch (e) {
            console.error('Error cargando datos de Supabase:', e);
        }
    }

    if (!loadedFromSupabase || data.length === 0) {
        var localData = getLocalRMAs();
        if (localData.length > 0) {
            data = localData;
        }
    } else {
        saveLocalRMAs(data);
    }

    data.forEach(function (r) {
        if (!r.trazabilidad) r.trazabilidad = [];
        r.trazabilidad.sort(function (a, b) { return Number(a.id) - Number(b.id); });
    });

    rmas = data;
    updateDashboard();
    if (currentView === 'list') renderList();
    if (currentView === 'reports') updateReports();

    var openRmaId = document.getElementById('upd-rma-id') ? document.getElementById('upd-rma-id').value : '';
    var modalDetail = document.getElementById('modal-detail');
    if (openRmaId && modalDetail && !modalDetail.classList.contains('opacity-0')) {
        openDetailModal(openRmaId);
    }
}

// --- NAVEGACION ---
function switchView(view) {
    currentView = view;

    document.getElementById('view-dashboard').classList.add('hide');
    document.getElementById('view-list').classList.add('hide');
    if (document.getElementById('view-reports')) document.getElementById('view-reports').classList.add('hide');

    var navBase = 'nav-link flex items-center px-4 py-3 rounded-xl font-medium transition-all duration-200';
    var navActive = 'nav-link active flex items-center px-4 py-3 rounded-xl font-medium transition-all duration-200';

    document.getElementById('nav-dashboard').className = navBase;
    document.getElementById('nav-list').className = navBase;
    if (document.getElementById('nav-reports')) document.getElementById('nav-reports').className = navBase;
    if (document.getElementById('nav-users')) document.getElementById('nav-users').className = navBase;

    var viewEl = document.getElementById('view-' + view);
    if (viewEl) viewEl.classList.remove('hide');
    document.getElementById('nav-' + view).className = navActive;


    if (view === 'dashboard') {
        document.getElementById('page-title').innerText = 'Dashboard';
        document.getElementById('page-subtitle').innerText = 'Resumen de actividad y métricas';
        updateDashboard();
    } else if (view === 'list') {
        document.getElementById('page-title').innerText = 'Gestión de Garantías';
        document.getElementById('page-subtitle').innerText = 'Listado completo y filtros avanzados';
        searchQuery = document.getElementById('globalSearch').value;
        renderList();
    } else if (view === 'reports') {
        document.getElementById('page-title').innerText = 'Reportes e Históricos';
        document.getElementById('page-subtitle').innerText = 'Gráficos e historial de registros';
        updateReports();
    }
}

function updateDashboard() {
    var total = rmas.length;
    var activas = rmas.filter(function (r) { return r.estado === 'Activa'; }).length;
    var finalizadas = rmas.filter(function (r) { return r.estado === 'Finalizada'; }).length;
    var rechazadas = rmas.filter(function (r) { return r.estado === 'Rechazada'; }).length;

    document.getElementById('metric-total').innerText = total;
    document.getElementById('metric-active').innerText = activas;
    document.getElementById('metric-finalized').innerText = finalizadas;
    document.getElementById('metric-rejected').innerText = rechazadas;

    var tbody = document.getElementById('recent-table-body');
    tbody.innerHTML = '';

    var recent = rmas.slice().reverse().slice(0, 5);
    recent.forEach(function (rma) {
        var badge = getBadgeHTML(rma.estado);
        tbody.innerHTML += '<tr class="hover:bg-slate-50/80 transition-colors group cursor-pointer" onclick="openDetailModal(\'' + escapeHTML(rma.id) + '\')">'
            + '<td class="py-4 px-8"><p class="font-bold text-slate-800">' + escapeHTML(rma.id) + '</p><p class="text-xs font-medium text-slate-500 mt-0.5">' + escapeHTML(rma.clientenombre) + '</p></td>'
            + '<td class="py-4 px-8 text-sm font-medium text-slate-700">' + escapeHTML(rma.producto) + '</td>'
            + '<td class="py-4 px-8 text-sm font-medium text-slate-500">' + escapeHTML(rma.factura) + '</td>'
            + '<td class="py-4 px-8">' + badge + '</td>'
            + '<td class="py-4 px-8 text-right"><button class="text-slate-400 group-hover:text-primary bg-white border border-slate-200 group-hover:border-primary/30 w-8 h-8 rounded-full transition-all shadow-sm flex items-center justify-center ml-auto"><i class="fa-solid fa-chevron-right text-xs"></i></button></td>'
            + '</tr>';
    });
}

// --- BUSQUEDA ---
function handleSearch(e) {
    searchQuery = e.target.value.toLowerCase();
    if (currentView !== 'list' && searchQuery.length > 0) {
        switchView('list');
    } else if (currentView === 'list') {
        renderList();
    }
}

function renderList() {
    var statusFilter = document.getElementById('filter-status').value;
    var tbody = document.getElementById('full-table-body');
    tbody.innerHTML = '';

    var filtered = rmas.filter(function (rma) {
        var matchSearch = (rma.clienteid || '').toLowerCase().includes(searchQuery)
            || (rma.factura || '').toLowerCase().includes(searchQuery)
            || (rma.producto || '').toLowerCase().includes(searchQuery)
            || (rma.clientenombre || '').toLowerCase().includes(searchQuery);
        var matchStatus = statusFilter === 'all' || rma.estado === statusFilter;
        return matchSearch && matchStatus;
    });

    document.getElementById('list-count').innerText = filtered.length;

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="py-12 text-center text-slate-500"><div class="text-4xl mb-3 text-slate-300"><i class="fa-solid fa-box-open"></i></div><p class="font-medium">No se encontraron garantías.</p></td></tr>';
        return;
    }

    filtered.slice().reverse().forEach(function (rma) {
        var badge = getBadgeHTML(rma.estado);
        var gLabel = (rma.tipogestion || '').indexOf('Proveedor') >= 0 ? 'Proveedor' : 'Tienda';
        tbody.innerHTML += '<tr class="hover:bg-slate-50/80 transition-colors">'
            + '<td class="py-4 px-8"><p class="font-bold text-slate-800">' + escapeHTML(rma.id) + '</p><p class="text-xs font-medium text-slate-500 mt-0.5">' + escapeHTML(rma.clientenombre) + '</p><p class="text-xs text-slate-400 mt-0.5">' + escapeHTML(rma.clienteid) + '</p></td>'
            + '<td class="py-4 px-8"><p class="text-sm font-medium text-slate-700">' + escapeHTML(rma.producto) + '</p><p class="text-xs text-slate-400 mt-0.5">' + escapeHTML(rma.referencia || '-') + '</p></td>'
            + '<td class="py-4 px-8 text-sm font-medium text-slate-600">' + escapeHTML(rma.factura) + '</td>'
            + '<td class="py-4 px-8 text-sm font-medium text-slate-600">' + escapeHTML(rma.fecharecepcion) + '</td>'
            + '<td class="py-4 px-8"><span class="text-xs font-semibold px-2 py-1 bg-slate-100 text-slate-600 rounded-md border border-slate-200">' + escapeHTML(gLabel) + '</span></td>'
            + '<td class="py-4 px-8">' + badge + '</td>'
            + '<td class="py-4 px-8 text-right"><button onclick="openDetailModal(\'' + escapeHTML(rma.id) + '\')" class="text-slate-600 hover:text-primary bg-white hover:bg-accent border border-slate-200 hover:border-primary/30 px-4 py-2 rounded-xl transition-all shadow-sm font-semibold text-xs inline-flex items-center gap-2"><i class="fa-solid fa-eye"></i> Detalle</button></td>'
            + '</tr>';
    });
}

// --- REPORTES ---
var chartStatusObj = null;
var chartProductsObj = null;

function handleReportSearch(e) {
    var val = e.target.value.toLowerCase();
    var filtered = rmas.filter(function (r) { return (r.referencia || '').toLowerCase().includes(val); });
    renderReportTable(filtered);
}

function updateReports() {
    var statusCounts = { Activa: 0, Finalizada: 0, Rechazada: 0 };
    var productCounts = {};

    rmas.forEach(function (r) {
        if (statusCounts[r.estado] !== undefined) statusCounts[r.estado]++;
        productCounts[r.producto] = (productCounts[r.producto] || 0) + 1;
    });

    var topProducts = Object.entries(productCounts).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);

    var ctxStatus = document.getElementById('chartStatus').getContext('2d');
    if (chartStatusObj) chartStatusObj.destroy();
    chartStatusObj = new Chart(ctxStatus, {
        type: 'doughnut',
        data: { labels: ['Activa', 'Aprobada', 'Rechazada'], datasets: [{ data: [statusCounts.Activa, statusCounts.Finalizada, statusCounts.Rechazada], backgroundColor: ['#f59e0b', '#10b981', '#ef4444'] }] },
        options: { cutout: '60%' }
    });

    var ctxProducts = document.getElementById('chartProducts').getContext('2d');
    if (chartProductsObj) chartProductsObj.destroy();
    chartProductsObj = new Chart(ctxProducts, {
        type: 'bar',
        data: { labels: topProducts.map(function (p) { return p[0]; }), datasets: [{ label: 'Cantidad', data: topProducts.map(function (p) { return p[1]; }), backgroundColor: '#1e3a8a', borderRadius: 4 }] },
        options: { scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });

    renderReportTable(rmas);
}

function renderReportTable(data) {
    var tbody = document.getElementById('report-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    data.slice().reverse().forEach(function (rma) {
        tbody.innerHTML += '<tr class="hover:bg-slate-50 transition-colors cursor-pointer" onclick="openDetailModal(\'' + escapeHTML(rma.id) + '\')">'
            + '<td class="py-4 px-8"><p class="font-bold text-slate-800">' + escapeHTML(rma.id) + '</p><p class="text-xs text-slate-500 mt-1">' + escapeHTML(rma.clientenombre) + '</p></td>'
            + '<td class="py-4 px-8"><p class="text-sm font-medium text-slate-700">' + escapeHTML(rma.producto) + '</p><p class="text-xs text-slate-400 mt-1">Ref: ' + escapeHTML(rma.referencia || '-') + '</p></td>'
            + '<td class="py-4 px-8">' + getBadgeHTML(rma.estado) + '</td>'
            + '<td class="py-4 px-8 text-sm font-medium text-slate-600">' + escapeHTML(rma.fecharecepcion) + '</td>'
            + '</tr>';
    });
}

// --- HELPERS ---
function getBadgeHTML(estado) {
    if (estado === 'Activa') return '<span class="px-3 py-1 text-xs font-bold rounded-full bg-amber-50 text-amber-600 border border-amber-200 uppercase tracking-wide inline-flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> Activa</span>';
    if (estado === 'Rechazada') return '<span class="px-3 py-1 text-xs font-bold rounded-full bg-red-50 text-red-600 border border-red-200 uppercase tracking-wide inline-flex items-center gap-1.5"><i class="fa-solid fa-xmark text-[10px]"></i> Rechazada</span>';
    return '<span class="px-3 py-1 text-xs font-bold rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 uppercase tracking-wide inline-flex items-center gap-1.5"><i class="fa-solid fa-check text-[10px]"></i> Aprobada</span>';
}

function getTodayString() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// --- MODAL NUEVA GARANTIA ---
function openNewRmaModal() {
    var modal = document.getElementById('modal-new-rma');
    var content = document.getElementById('modal-new-content');
    modal.classList.remove('opacity-0', 'pointer-events-none');
    content.classList.remove('scale-95');
}

function closeNewRmaModal() {
    var modal = document.getElementById('modal-new-rma');
    var content = document.getElementById('modal-new-content');
    modal.classList.add('opacity-0', 'pointer-events-none');
    content.classList.add('scale-95');
    setTimeout(function () {
        document.getElementById('form-new-rma').reset();
        document.getElementById('inp-fecharec').valueAsDate = new Date();
    }, 300);
}

async function handleNewRma(e) {
    e.preventDefault();

    var activeOperatorName = currentSession ? currentSession.nombre : 'Operador';
    var newId = 'RMA-' + String(rmas.length + 1).padStart(3, '0');
    var cedula = document.getElementById('inp-cedula-pref').value + document.getElementById('inp-cedula-num').value;
    var fechaRec = document.getElementById('inp-fecharec').value;
    var sede = document.getElementById('inp-sede').value;

    var newRma = {
        id: newId,
        estado: 'Activa',
        clienteid: cedula,
        clientenombre: document.getElementById('inp-nombre').value,
        telefono: document.getElementById('inp-telefono').value,
        producto: document.getElementById('inp-producto').value,
        referencia: document.getElementById('inp-ref').value,
        factura: document.getElementById('inp-factura').value,
        fechafactura: document.getElementById('inp-fechafact').value,
        fecharecepcion: fechaRec,
        operador: activeOperatorName,
        tipogestion: document.getElementById('inp-gestion').value,
        sede: sede,
        fallo: document.getElementById('inp-fallo').value,
        respuesta: ''
    };

    var initialTrace = {
        rma_id: newId,
        estado: 'Recibido',
        fecha: fechaRec,
        nota: 'Recepción inicial en ' + sede + '. Registrado por: ' + activeOperatorName
    };

    var savedInSupabase = false;

    if (dbClient) {
        try {
            var r1 = await dbClient.from('rmas').insert([newRma]);
            if (r1.error) {
                console.error('Error insertando RMA en Supabase:', r1.error);
                alert('Error al registrar la garantía en Supabase: ' + r1.error.message);
            } else {
                var r2 = await dbClient.from('trazabilidad').insert([initialTrace]);
                if (r2.error) {
                    console.error('Error insertando trazabilidad en Supabase:', r2.error);
                    alert('Garantía guardada pero la trazabilidad tuvo un detalle: ' + r2.error.message);
                }
                savedInSupabase = true;
            }
        } catch (err) {
            console.error('Error enviando datos a Supabase:', err);
        }
    }

    if (!savedInSupabase) {
        var localData = getLocalRMAs();
        initialTrace.id = Date.now();
        newRma.trazabilidad = [initialTrace];
        localData.push(newRma);
        saveLocalRMAs(localData);
    }

    closeNewRmaModal();
    await fetchRMAs();
}

// --- ACTUALIZAR ESTADO ---
async function handleUpdateStatus(e) {
    e.preventDefault();

    var activeOperatorName = currentSession ? currentSession.nombre : 'Operador';
    var rmaId = document.getElementById('upd-rma-id').value;
    var rma = rmas.find(function (r) { return r.id === rmaId; });
    if (!rma) return;

    var nuevoEstado = document.getElementById('upd-estado').value;
    var notaText = document.getElementById('upd-nota').value;
    var fecha = getTodayString();

    var isFin = nuevoEstado.indexOf('Completada') >= 0;
    var isRej = nuevoEstado.indexOf('Rechazada') >= 0;
    var estadoFinal = isFin ? 'Finalizada' : (isRej ? 'Rechazada' : 'Activa');

    var updateObj = { estado: estadoFinal };
    if (isFin || isRej) updateObj.respuesta = notaText;

    var traceObj = {
        rma_id: rmaId,
        estado: nuevoEstado,
        fecha: fecha,
        nota: notaText + ' (Operador: ' + activeOperatorName + ')'
    };

    var updatedInSupabase = false;

    if (dbClient) {
        try {
            var r1 = await dbClient.from('rmas').update(updateObj).eq('id', rmaId);
            var r2 = await dbClient.from('trazabilidad').insert([traceObj]);

            if (r1.error || r2.error) {
                console.error('Error en Supabase:', r1.error || r2.error);
            } else {
                updatedInSupabase = true;
            }
        } catch (err) {
            console.error('Error actualizando estado:', err);
        }
    }

    if (!updatedInSupabase) {
        rma.estado = estadoFinal;
        if (isFin || isRej) rma.respuesta = notaText;
        if (!rma.trazabilidad) rma.trazabilidad = [];
        traceObj.id = Date.now();
        rma.trazabilidad.push(traceObj);
        saveLocalRMAs(rmas);
    }

    document.getElementById('upd-nota').value = '';
    await fetchRMAs();
}

// --- ELIMINAR (RESTRINGIDO A ADMINS) ---
async function confirmDeleteRMA() {
    if (!currentSession || currentSession.rol !== 'admin') {
        alert('Acceso Denegado: Solo los usuarios con rol Administrador pueden eliminar garantías.');
        return;
    }

    var rmaId = document.getElementById('upd-rma-id').value;
    if (!rmaId) {
        var did = document.getElementById('det-id').innerText;
        if (did && did.startsWith('RMA-')) document.getElementById('upd-rma-id').value = did;
        else return;
        rmaId = document.getElementById('upd-rma-id').value;
    }

    if (confirm('¿Seguro de eliminar esta garantía? Esta acción no se puede deshacer.')) {
        var deletedInSupabase = false;
        if (dbClient) {
            try {
                var r = await dbClient.from('rmas').delete().eq('id', rmaId);
                if (!r.error) deletedInSupabase = true;
            } catch (err) { console.error(err); }
        }

        if (!deletedInSupabase) {
            rmas = rmas.filter(function (r) { return r.id !== rmaId; });
            saveLocalRMAs(rmas);
        }

        closeDetailModal();
        await fetchRMAs();
    }
}

async function confirmDeleteTrace(id) {
    if (!currentSession || currentSession.rol !== 'admin') {
        alert('Acceso Denegado: Solo los usuarios con rol Administrador pueden borrar registros de la línea de tiempo.');
        return;
    }

    if (confirm('¿Seguro de eliminar este paso del historial?')) {
        var deletedInSupabase = false;
        if (dbClient && id && !isNaN(Number(id))) {
            try {
                var r = await dbClient.from('trazabilidad').delete().eq('id', id);
                if (!r.error) deletedInSupabase = true;
                else alert('Error al eliminar paso en Supabase: ' + r.error.message);
            } catch (err) { console.error(err); }
        }

        if (!deletedInSupabase) {
            rmas.forEach(function (rma) {
                if (rma.trazabilidad) {
                    rma.trazabilidad = rma.trazabilidad.filter(function (t) { return String(t.id) !== String(id); });
                }
            });
            saveLocalRMAs(rmas);
        }

        await fetchRMAs();
    }
}

// --- MODAL DETALLE 
function openDetailModal(id) {
    var rma = rmas.find(function (r) { return r.id === id; });
    if (!rma) return;

    var isAdmin = currentSession && currentSession.rol === 'admin';

    document.getElementById('det-id').innerText = rma.id;
    document.getElementById('det-producto').innerText = rma.producto;
    document.getElementById('det-ref').innerText = rma.referencia || '-';

    var btnDelRma = document.getElementById('btn-delete-rma');
    if (btnDelRma) {
        if (isAdmin) btnDelRma.classList.remove('hidden');
        else btnDelRma.classList.add('hidden');
    }

    var badge = document.getElementById('det-status-badge');
    if (rma.estado === 'Activa') {
        badge.className = 'px-3 py-1.5 text-xs font-bold rounded-full bg-amber-50 text-amber-600 border-amber-200 border uppercase tracking-wide inline-flex items-center gap-1.5';
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span> Activa';
    } else if (rma.estado === 'Rechazada') {
        badge.className = 'px-3 py-1.5 text-xs font-bold rounded-full bg-red-50 text-red-600 border-red-200 border uppercase tracking-wide inline-flex items-center gap-1.5';
        badge.innerHTML = '<i class="fa-solid fa-xmark"></i> Rechazada';
    } else {
        badge.className = 'px-3 py-1.5 text-xs font-bold rounded-full bg-emerald-50 text-emerald-600 border-emerald-200 border uppercase tracking-wide inline-flex items-center gap-1.5';
        badge.innerHTML = '<i class="fa-solid fa-check"></i> Aprobada';
    }

    document.getElementById('det-cliente').innerText = rma.clientenombre;
    document.getElementById('det-cedula').innerText = rma.clienteid;
    document.getElementById('det-telefono').innerText = rma.telefono;
    document.getElementById('det-factura').innerText = rma.factura;
    document.getElementById('det-fechafact').innerText = rma.fechafactura;
    document.getElementById('det-sede').innerText = rma.sede;
    document.getElementById('det-fecharec').innerText = rma.fecharecepcion;
    document.getElementById('det-fallo').innerText = rma.fallo;
    document.getElementById('det-operador').innerText = rma.operador || 'No registrado';
    document.getElementById('det-gestion').innerText = rma.tipogestion || 'Directo en Tienda';
    document.getElementById('upd-rma-id').value = rma.id;

    var resContainer = document.getElementById('resolucion-container');
    var resTitle = document.getElementById('res-title');
    var detRespuesta = document.getElementById('det-respuesta');

    if (rma.respuesta) {
        resContainer.classList.remove('hidden');
        detRespuesta.innerText = rma.respuesta;
        if (rma.estado === 'Rechazada') {
            resTitle.className = 'text-xs font-bold text-red-600 uppercase tracking-wider mb-2 flex items-center gap-2';
            resTitle.innerHTML = '<i class="fa-solid fa-circle-xmark text-red-500"></i> Motivo de Rechazo';
            detRespuesta.className = 'text-sm text-red-800 bg-red-50 border border-red-100 p-4 rounded-xl leading-relaxed font-medium';
        } else {
            resTitle.className = 'text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2 flex items-center gap-2';
            resTitle.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-500"></i> Resolución de Garantía';
            detRespuesta.className = 'text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 p-4 rounded-xl leading-relaxed font-medium';
        }
    } else {
        resContainer.classList.add('hidden');
    }

    var updateSection = document.getElementById('update-status-section');
    if (rma.estado === 'Activa') updateSection.classList.remove('hidden');
    else updateSection.classList.add('hidden');

    var timeline = document.getElementById('timeline-container');
    timeline.innerHTML = '<div class="absolute left-[11px] top-6 bottom-4 w-0.5 bg-slate-200 z-0"></div>';

    if (rma.trazabilidad && rma.trazabilidad.length > 0) {
        rma.trazabilidad.forEach(function (hito, index) {
            var isLast = index === rma.trazabilidad.length - 1;
            var dot = 'bg-slate-300';
            if (isLast) {
                if (rma.estado === 'Finalizada') dot = 'bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.2)]';
                else if (rma.estado === 'Rechazada') dot = 'bg-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.2)]';
                else dot = 'bg-primary shadow-[0_0_0_4px_rgba(30,58,138,0.2)]';
            }
            var isRej = (hito.estado || '').indexOf('Rechazada') >= 0;
            var titleHtml = isRej
                ? '<h5 class="font-bold text-red-600 text-sm">' + escapeHTML(hito.estado) + '</h5>'
                : '<h5 class="font-bold text-slate-800 text-sm">' + escapeHTML(hito.estado) + '</h5>';

            var deleteTraceBtnHtml = isAdmin
                ? '<button onclick="confirmDeleteTrace(\'' + escapeHTML(hito.id) + '\')" class="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-all" title="Eliminar paso"><i class="fa-solid fa-trash"></i></button>'
                : '';

            timeline.innerHTML += '<div class="relative z-10 pl-8 group">'
                + '<div class="absolute left-[6px] top-[22px] w-3 h-3 rounded-full ' + dot + ' border-2 border-white z-10 transition-all duration-300"></div>'
                + '<div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:border-slate-200 transition-colors">'
                + '<div class="flex justify-between items-start mb-2">'
                + titleHtml
                + '<div class="flex items-center gap-2"><span class="text-xs font-semibold text-slate-400 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">' + escapeHTML(hito.fecha) + '</span>'
                + deleteTraceBtnHtml
                + '</div></div>'
                + '<p class="text-sm font-medium text-slate-600 leading-relaxed">' + escapeHTML(hito.nota) + '</p>'
                + '</div></div>';
        });
    } else {
        timeline.innerHTML += '<div class="relative z-10 pl-8 py-4 text-slate-400 text-sm font-medium">Sin eventos de trazabilidad registrados.</div>';
    }

    var modal = document.getElementById('modal-detail');
    var content = document.getElementById('modal-detail-content');
    modal.classList.remove('opacity-0', 'pointer-events-none');
    content.classList.remove('scale-95');
}

function closeDetailModal() {
    var modal = document.getElementById('modal-detail');
    var content = document.getElementById('modal-detail-content');
    modal.classList.add('opacity-0', 'pointer-events-none');
    content.classList.add('scale-95');
}

function exportPDF() {
    var rmaId = document.getElementById('upd-rma-id').value;
    var rma = rmas.find(function (r) { return r.id === rmaId; });
    if (!rma) return;

    document.getElementById('pdf-id').innerText = rma.id;
    document.getElementById('pdf-cliente').innerText = rma.clientenombre;
    document.getElementById('pdf-cedula').innerText = rma.clienteid;
    document.getElementById('pdf-telefono').innerText = rma.telefono;

    document.getElementById('pdf-producto').innerText = rma.producto;
    document.getElementById('pdf-ref').innerText = rma.referencia || '-';
    document.getElementById('pdf-factura').innerText = rma.factura;
    document.getElementById('pdf-fechafact').innerText = rma.fechafactura;

    document.getElementById('pdf-fecharec').innerText = rma.fecharecepcion;
    document.getElementById('pdf-operador').innerText = rma.operador || 'No registrado';
    document.getElementById('pdf-sede').innerText = rma.sede;

    document.getElementById('pdf-fallo').innerText = rma.fallo;

    var d = new Date();
    document.getElementById('pdf-fecha-gen').innerText = d.toLocaleDateString() + ' ' + d.toLocaleTimeString();

    var tbody = document.getElementById('pdf-trazabilidad-body');
    tbody.innerHTML = '';

    if (rma.trazabilidad && rma.trazabilidad.length > 0) {
        rma.trazabilidad.forEach(function (hito) {
            tbody.innerHTML += '<tr>'
                + '<td class="py-3 px-4 border-b border-slate-100">' + escapeHTML(hito.fecha) + '</td>'
                + '<td class="py-3 px-4 border-b border-slate-100 font-bold">' + escapeHTML(hito.estado) + '</td>'
                + '<td class="py-3 px-4 border-b border-slate-100">' + escapeHTML(hito.nota) + '</td>'
                + '</tr>';
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="3" class="py-3 px-4 text-center text-slate-400">Sin historial registrado</td></tr>';
    }

    var overlay = document.getElementById('pdf-overlay');
    var element = document.getElementById('pdf-template');
    var loading = document.getElementById('pdf-loading');

    overlay.classList.remove('hidden');
    loading.classList.remove('hidden');

    var opt = {
        margin: [0.5, 0],
        filename: 'Comprobante_RMA_' + rma.id + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    setTimeout(function () {
        loading.classList.add('hidden');

        html2pdf().set(opt).from(element).save().then(function () {
            overlay.classList.add('hidden');
        });
    }, 500);
}
