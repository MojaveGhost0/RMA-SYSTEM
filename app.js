// =============================================================
// SISTEMA RMA - ELECTRONICA.COM.VE
// =============================================================

// --- SUPABASE INIT ---
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

// --- ESTADO GLOBAL ---
var currentUser = localStorage.getItem('rma_operator') || '';
var currentView = 'dashboard';
var searchQuery = '';
var rmas = [];

// --- INICIO ---
document.addEventListener('DOMContentLoaded', function () {
    if (!currentUser) {
        var modalOp = document.getElementById('modal-operator');
        if (modalOp) modalOp.classList.remove('opacity-0', 'pointer-events-none');
    } else {
        var nameEl = document.getElementById('header-operator-name');
        if (nameEl) nameEl.innerText = 'Operador: ' + currentUser;
    }

    var fechaInput = document.getElementById('inp-fecharec');
    if (fechaInput) fechaInput.valueAsDate = new Date();

    fetchRMAs();

    if (dbClient) {
        dbClient.channel('public:rmas')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'rmas' }, fetchRMAs)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'trazabilidad' }, fetchRMAs)
            .subscribe();
    }
});

function handleOperatorSubmit(e) {
    e.preventDefault();
    var name = document.getElementById('inp-operator-name').value.trim();
    if (name) {
        currentUser = name;
        localStorage.setItem('rma_operator', name);
        document.getElementById('modal-operator').classList.add('opacity-0', 'pointer-events-none');
        var nameEl = document.getElementById('header-operator-name');
        if (nameEl) nameEl.innerText = 'Operador: ' + currentUser;
    }
}

function changeOperator() {
    document.getElementById('inp-operator-name').value = currentUser;
    document.getElementById('modal-operator').classList.remove('opacity-0', 'pointer-events-none');
}

// --- CARGAR RMAs ---
async function fetchRMAs() {
    if (!dbClient) {
        console.warn('Sin base de datos. Mostrando sistema sin datos.');
        rmas = [];
        updateDashboard();
        return;
    }
    try {
        var result = await dbClient
            .from('rmas')
            .select('*, trazabilidad(*)')
            .order('id', { ascending: true });

        if (result.error) throw result.error;

        var data = result.data;
        data.forEach(function (r) {
            if (r.trazabilidad) r.trazabilidad.sort(function (a, b) { return a.id - b.id; });
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
    } catch (e) {
        console.error('Error cargando RMAs:', e);
    }
}

// --- NAVEGACION ---
function switchView(view) {
    currentView = view;

    document.getElementById('view-dashboard').classList.add('hide');
    document.getElementById('view-list').classList.add('hide');
    if (document.getElementById('view-reports')) document.getElementById('view-reports').classList.add('hide');

    var navBase = 'nav-link flex items-center px-4 py-3 text-slate-500 hover:bg-slate-50 hover:text-primary rounded-xl font-medium transition-all duration-200 group';
    var navActive = 'nav-link flex items-center px-4 py-3 bg-accent text-primary rounded-xl font-medium transition-all duration-200 group';

    document.getElementById('nav-dashboard').className = navBase;
    document.getElementById('nav-list').className = navBase;
    if (document.getElementById('nav-reports')) document.getElementById('nav-reports').className = navBase;

    var viewEl = document.getElementById('view-' + view);
    if (viewEl) viewEl.classList.remove('hide');
    document.getElementById('nav-' + view).className = navActive;

    if (view === 'dashboard') {
        document.getElementById('page-title').innerText = 'Dashboard';
        document.getElementById('page-subtitle').innerText = 'Resumen de actividad y metricas';
        updateDashboard();
    } else if (view === 'list') {
        document.getElementById('page-title').innerText = 'Gestion de Garantias';
        document.getElementById('page-subtitle').innerText = 'Listado completo y filtros avanzados';
        searchQuery = document.getElementById('globalSearch').value;
        renderList();
    } else if (view === 'reports') {
        document.getElementById('page-title').innerText = 'Reportes e Historicos';
        document.getElementById('page-subtitle').innerText = 'Graficos e historial de registros';
        updateReports();
    }
}

// --- DASHBOARD ---
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
        tbody.innerHTML += '<tr class="hover:bg-slate-50/80 transition-colors group cursor-pointer" onclick="openDetailModal(\'' + rma.id + '\')">'
            + '<td class="py-4 px-8"><p class="font-bold text-slate-800">' + rma.id + '</p><p class="text-xs font-medium text-slate-500 mt-0.5">' + rma.clientenombre + '</p></td>'
            + '<td class="py-4 px-8 text-sm font-medium text-slate-700">' + rma.producto + '</td>'
            + '<td class="py-4 px-8 text-sm font-medium text-slate-500">' + rma.factura + '</td>'
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
        tbody.innerHTML = '<tr><td colspan="7" class="py-12 text-center text-slate-500"><div class="text-4xl mb-3 text-slate-300"><i class="fa-solid fa-box-open"></i></div><p class="font-medium">No se encontraron garantias.</p></td></tr>';
        return;
    }

    filtered.slice().reverse().forEach(function (rma) {
        var badge = getBadgeHTML(rma.estado);
        var gLabel = (rma.tipogestion || '').indexOf('Proveedor') >= 0 ? 'Proveedor' : 'Tienda';
        tbody.innerHTML += '<tr class="hover:bg-slate-50/80 transition-colors">'
            + '<td class="py-4 px-8"><p class="font-bold text-slate-800">' + rma.id + '</p><p class="text-xs font-medium text-slate-500 mt-0.5">' + rma.clientenombre + '</p><p class="text-xs text-slate-400 mt-0.5">' + rma.clienteid + '</p></td>'
            + '<td class="py-4 px-8"><p class="text-sm font-medium text-slate-700">' + rma.producto + '</p><p class="text-xs text-slate-400 mt-0.5">' + (rma.referencia || '-') + '</p></td>'
            + '<td class="py-4 px-8 text-sm font-medium text-slate-600">' + rma.factura + '</td>'
            + '<td class="py-4 px-8 text-sm font-medium text-slate-600">' + rma.fecharecepcion + '</td>'
            + '<td class="py-4 px-8"><span class="text-xs font-semibold px-2 py-1 bg-slate-100 text-slate-600 rounded-md border border-slate-200">' + gLabel + '</span></td>'
            + '<td class="py-4 px-8">' + badge + '</td>'
            + '<td class="py-4 px-8 text-right"><button onclick="openDetailModal(\'' + rma.id + '\')" class="text-slate-600 hover:text-primary bg-white hover:bg-accent border border-slate-200 hover:border-primary/30 px-4 py-2 rounded-xl transition-all shadow-sm font-semibold text-xs inline-flex items-center gap-2"><i class="fa-solid fa-eye"></i> Detalle</button></td>'
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
        tbody.innerHTML += '<tr class="hover:bg-slate-50 transition-colors cursor-pointer" onclick="openDetailModal(\'' + rma.id + '\')">'
            + '<td class="py-4 px-8"><p class="font-bold text-slate-800">' + rma.id + '</p><p class="text-xs text-slate-500 mt-1">' + rma.clientenombre + '</p></td>'
            + '<td class="py-4 px-8"><p class="text-sm font-medium text-slate-700">' + rma.producto + '</p><p class="text-xs text-slate-400 mt-1">Ref: ' + (rma.referencia || '-') + '</p></td>'
            + '<td class="py-4 px-8">' + getBadgeHTML(rma.estado) + '</td>'
            + '<td class="py-4 px-8 text-sm font-medium text-slate-600">' + rma.fecharecepcion + '</td>'
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
    if (!dbClient) { alert('Sin conexion a la base de datos.'); return; }

    var newId = 'RMA-' + String(rmas.length + 1).padStart(3, '0');
    var cedula = document.getElementById('inp-cedula-pref').value + document.getElementById('inp-cedula-num').value;

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
        fecharecepcion: document.getElementById('inp-fecharec').value,
        operador: currentUser,
        tipogestion: document.getElementById('inp-gestion').value,
        sede: document.getElementById('inp-sede').value,
        fallo: document.getElementById('inp-fallo').value,
        respuesta: ''
    };

    var r1 = await dbClient.from('rmas').insert([newRma]);
    if (r1.error) { alert('Error creando RMA: ' + r1.error.message); console.error(r1.error); return; }

    await dbClient.from('trazabilidad').insert([{
        rma_id: newId,
        estado: 'Recibido',
        fecha: document.getElementById('inp-fecharec').value,
        nota: 'Recepcion inicial en ' + document.getElementById('inp-sede').value + '. Registrado por: ' + currentUser
    }]);

    closeNewRmaModal();
}

// --- ACTUALIZAR ESTADO ---
async function handleUpdateStatus(e) {
    e.preventDefault();
    if (!dbClient) return;

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

    var r1 = await dbClient.from('rmas').update(updateObj).eq('id', rmaId);
    if (r1.error) { alert('Error actualizando estado'); return; }

    await dbClient.from('trazabilidad').insert([{
        rma_id: rmaId,
        estado: nuevoEstado,
        fecha: fecha,
        nota: notaText + ' (Operador: ' + currentUser + ')'
    }]);

    document.getElementById('upd-nota').value = '';
}

// --- ELIMINAR ---
async function confirmDeleteRMA() {
    if (!dbClient) return;
    var rmaId = document.getElementById('upd-rma-id').value;
    if (!rmaId) {
        var did = document.getElementById('det-id').innerText;
        if (did && did.startsWith('RMA-')) document.getElementById('upd-rma-id').value = did;
        else return;
        rmaId = document.getElementById('upd-rma-id').value;
    }
    if (confirm('Seguro de eliminar esta garantia? Esta accion no se puede deshacer.')) {
        var r = await dbClient.from('rmas').delete().eq('id', rmaId);
        if (r.error) { alert('Error al eliminar.'); console.error(r.error); }
        else closeDetailModal();
    }
}

async function confirmDeleteTrace(id) {
    if (!dbClient) return;
    if (confirm('Seguro de eliminar este paso del historial?')) {
        var r = await dbClient.from('trazabilidad').delete().eq('id', id);
        if (r.error) { alert('Error al eliminar el paso.'); console.error(r.error); }
    }
}

// --- MODAL DETALLE ---
function openDetailModal(id) {
    var rma = rmas.find(function (r) { return r.id === id; });
    if (!rma) return;

    document.getElementById('det-id').innerText = rma.id;
    document.getElementById('det-producto').innerText = rma.producto;
    document.getElementById('det-ref').innerText = rma.referencia || '-';

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
            resTitle.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-500"></i> Resolucion de Garantia';
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

    if (rma.trazabilidad) {
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
                ? '<h5 class="font-bold text-red-600 text-sm">' + hito.estado + '</h5>'
                : '<h5 class="font-bold text-slate-800 text-sm">' + hito.estado + '</h5>';

            timeline.innerHTML += '<div class="relative z-10 pl-8 group">'
                + '<div class="absolute left-[6px] top-[22px] w-3 h-3 rounded-full ' + dot + ' border-2 border-white z-10 transition-all duration-300"></div>'
                + '<div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:border-slate-200 transition-colors">'
                + '<div class="flex justify-between items-start mb-2">'
                + titleHtml
                + '<div class="flex items-center gap-2"><span class="text-xs font-semibold text-slate-400 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">' + hito.fecha + '</span>'
                + '<button onclick="confirmDeleteTrace(\'' + hito.id + '\')" class="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-all" title="Eliminar paso"><i class="fa-solid fa-trash"></i></button>'
                + '</div></div>'
                + '<p class="text-sm font-medium text-slate-600 leading-relaxed">' + hito.nota + '</p>'
                + '</div></div>';
        });
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
    var rma = rmas.find(function(r) { return r.id === rmaId; });
    if (!rma) return;

    // Poblar la plantilla PDF
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

    // Poblar Trazabilidad
    var tbody = document.getElementById('pdf-trazabilidad-body');
    tbody.innerHTML = '';
    
    if (rma.trazabilidad && rma.trazabilidad.length > 0) {
        rma.trazabilidad.forEach(function(hito) {
            tbody.innerHTML += '<tr>'
                + '<td class="py-3 px-4 border-b border-slate-100">' + hito.fecha + '</td>'
                + '<td class="py-3 px-4 border-b border-slate-100 font-bold">' + hito.estado + '</td>'
                + '<td class="py-3 px-4 border-b border-slate-100">' + hito.nota + '</td>'
                + '</tr>';
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="3" class="py-3 px-4 text-center text-slate-400">Sin historial registrado</td></tr>';
    }

    var overlay = document.getElementById('pdf-overlay');
    var element = document.getElementById('pdf-template');
    var loading = document.getElementById('pdf-loading');
    
    // Hacemos visible el contenedor en la pantalla completa real
    overlay.classList.remove('hidden');
    loading.classList.remove('hidden');
    
    var opt = {
        margin:       [0.5, 0],
        filename:     'Comprobante_RMA_' + rma.id + '.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    
    // Retraso de medio segundo para que el navegador repinte el HTML antes de capturarlo
    setTimeout(function() {
        loading.classList.add('hidden'); // Ocultar spinner antes de capturar
        
        html2pdf().set(opt).from(element).save().then(function() {
            overlay.classList.add('hidden'); // Cerrar modal del PDF al terminar
        });
    }, 500);
}
