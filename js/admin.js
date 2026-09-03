const STORAGE_KEY = 'geocampo_records_v01';
const $ = (id) => document.getElementById(id);

const els = {
  totalRecords: $('totalRecords'),
  avgAccuracy: $('avgAccuracy'),
  todayRecords: $('todayRecords'),
  pendingRecords: $('pendingRecords'),
  recordsTable: $('recordsTable'),
  adminEmpty: $('adminEmpty'),
  searchInput: $('searchInput'),
  typeFilter: $('typeFilter'),
  exportBtn: $('exportBtn'),
  detailDialog: $('detailDialog'),
  dialogContent: $('dialogContent'),
  closeDialog: $('closeDialog'),
  toast: $('toast'),
  toastMessage: $('toastMessage'),
};

function getRecords() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[char]));
}

function showToast(message) {
  els.toastMessage.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove('show'), 2500);
}

function updateStats(records) {
  els.totalRecords.textContent = records.length;
  els.pendingRecords.textContent = records.filter(r => r.syncStatus !== 'synced').length;
  els.avgAccuracy.textContent = records.length ? `±${(records.reduce((sum,r)=>sum+(Number(r.accuracy)||0),0)/records.length).toFixed(1)} m` : '—';
  const today = new Date().toISOString().slice(0,10);
  els.todayRecords.textContent = records.filter(r => String(r.createdAt || '').slice(0,10) === today).length;
}

function populateTypes(records) {
  const types = [...new Set(records.map(r => r.type).filter(Boolean))].sort();
  const current = els.typeFilter.value;
  els.typeFilter.innerHTML = '<option value="">Todos los tipos</option>' + types.map(t => `<option>${escapeHtml(t)}</option>`).join('');
  els.typeFilter.value = current;
}

function qualityLabel(accuracy) {
  if (accuracy <= 5) return 'Excelente';
  if (accuracy <= 10) return 'Buena';
  if (accuracy <= 20) return 'Aceptable';
  return 'Baja';
}

function filteredRecords() {
  const search = els.searchInput.value.trim().toLowerCase();
  const type = els.typeFilter.value;
  return getRecords().filter(record => {
    const haystack = `${record.type} ${record.section} ${record.observation} ${record.status} ${record.id}`.toLowerCase();
    return (!search || haystack.includes(search)) && (!type || record.type === type);
  }).reverse();
}

function renderTable() {
  const all = getRecords();
  updateStats(all);
  populateTypes(all);
  const records = filteredRecords();
  els.recordsTable.innerHTML = '';
  els.adminEmpty.hidden = records.length > 0;

  records.forEach(record => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><img class="table-thumb" src="${record.photoDataUrl}" alt="Evidencia ${escapeHtml(record.id)}" /></td>
      <td><span class="record-title">${escapeHtml(record.type)}</span><span class="record-sub">${escapeHtml(record.id)} · ${escapeHtml(record.section || 'Sin tramo')}</span></td>
      <td><span class="coord">${Number(record.latitude).toFixed(6)}</span><br><span class="coord">${Number(record.longitude).toFixed(6)}</span></td>
      <td><span class="quality-badge">±${Number(record.accuracy).toFixed(1)} m · ${qualityLabel(Number(record.accuracy))}</span></td>
      <td><span class="state-badge">${escapeHtml(record.status || 'No evaluado')}</span></td>
      <td>${escapeHtml(record.date)}<br><span class="record-sub">${escapeHtml(record.time)}</span></td>
      <td><button class="view-btn" data-id="${escapeHtml(record.id)}">Ver detalle</button></td>`;
    els.recordsTable.appendChild(tr);
  });

  document.querySelectorAll('.view-btn').forEach(btn => btn.addEventListener('click', () => openDetail(btn.dataset.id)));
}

function openDetail(id) {
  const record = getRecords().find(r => r.id === id);
  if (!record) return;
  els.dialogContent.innerHTML = `
    <img class="detail-image" src="${record.photoDataUrl}" alt="Evidencia ${escapeHtml(record.id)}" />
    <div class="detail-body">
      <span class="eyebrow">${escapeHtml(record.id)}</span>
      <h3>${escapeHtml(record.type)}</h3>
      <p>${escapeHtml(record.observation || 'Sin observaciones adicionales.')}</p>
      <div class="detail-grid">
        <div><span>LATITUD</span><strong>${Number(record.latitude).toFixed(6)}</strong></div>
        <div><span>LONGITUD</span><strong>${Number(record.longitude).toFixed(6)}</strong></div>
        <div><span>PRECISIÓN</span><strong>±${Number(record.accuracy).toFixed(1)} m · ${qualityLabel(Number(record.accuracy))}</strong></div>
        <div><span>ESTADO</span><strong>${escapeHtml(record.status || 'No evaluado')}</strong></div>
        <div><span>TRAMO / SECTOR</span><strong>${escapeHtml(record.section || 'No indicado')}</strong></div>
        <div><span>SENTIDO</span><strong>${escapeHtml(record.direction || 'No indicado')}</strong></div>
        <div><span>FECHA</span><strong>${escapeHtml(record.date)}</strong></div>
        <div><span>HORA</span><strong>${escapeHtml(record.time)}</strong></div>
      </div>
    </div>`;
  els.detailDialog.showModal();
}

els.closeDialog.addEventListener('click', () => els.detailDialog.close());
els.detailDialog.addEventListener('click', event => { if (event.target === els.detailDialog) els.detailDialog.close(); });
els.searchInput.addEventListener('input', renderTable);
els.typeFilter.addEventListener('change', renderTable);

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

els.exportBtn.addEventListener('click', () => {
  const records = filteredRecords();
  if (!records.length) { showToast('No hay registros para exportar'); return; }
  const headers = ['ID','Fecha','Hora','Latitud','Longitud','Precision_m','Calidad_GPS','Tipo','Estado','Tramo_Sector','Sentido','Observacion','Estado_Sincronizacion'];
  const rows = records.map(r => [r.id,r.date,r.time,r.latitude,r.longitude,r.accuracy,qualityLabel(Number(r.accuracy)),r.type,r.status,r.section,r.direction,r.observation,r.syncStatus]);
  const csv = '\uFEFF' + [headers,...rows].map(row => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `geocampo_registros_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  showToast('Archivo compatible con Excel exportado');
});

renderTable();
