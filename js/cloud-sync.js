import {
  currentAuthor,
  fetchRecordsFromCloud,
  saveRecordToCloud
} from './cloud-data.js';

const STORAGE_KEY = 'geocampo_records_v01';
let internalWrite = false;
let syncing = false;

function readLocalRecords() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeLocalRecords(records) {
  internalWrite = true;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } finally {
    internalWrite = false;
  }
}

function updateConnection(text, state = 'ready') {
  const pill = document.getElementById('connectionStatus');
  if (!pill) return;
  const dot = pill.querySelector('span');
  const label = document.createTextNode(` ${text}`);
  [...pill.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).forEach(node => node.remove());
  pill.appendChild(label);
  pill.dataset.state = state;
  if (dot) {
    dot.style.background = state === 'error' ? '#d65a5a' : state === 'syncing' ? '#eeb83c' : '#2e9a6d';
  }
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[char]));
}

function renderRecentFromLocal() {
  const host = document.getElementById('recentRecords');
  const empty = document.getElementById('emptyState');
  if (!host || !empty) return;

  const records = readLocalRecords().slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 4);
  host.innerHTML = '';
  empty.hidden = records.length > 0;

  records.forEach((record) => {
    const accuracy = Number(record.gpsAccuracy ?? record.accuracy);
    const accuracyText = Number.isFinite(accuracy) && accuracy > 0 ? `±${accuracy.toFixed(1)} m GPS` : 'Sin precisión GPS';
    const methodText = record.locationMethod === 'manual' ? 'Ajuste manual' : 'GPS automático';
    const image = record.photoDataUrl || record.imageUrl || '';
    const article = document.createElement('article');
    article.className = 'record-item';
    article.innerHTML = `
      <img class="record-thumb" src="${escapeHtml(image)}" alt="Evidencia del registro ${escapeHtml(record.id)}" />
      <div class="record-main">
        <strong>${escapeHtml(record.type || 'Registro')}</strong>
        <p>${escapeHtml(record.observation || 'Sin observaciones adicionales')}</p>
        <div class="record-meta">
          <span class="meta-chip">${Number(record.latitude).toFixed(6)}, ${Number(record.longitude).toFixed(6)}</span>
          <span class="meta-chip">${accuracyText}</span>
          <span class="meta-chip">${methodText}</span>
          ${record.userName ? `<span class="meta-chip">Por ${escapeHtml(record.userName)}</span>` : ''}
        </div>
      </div>
      <span class="record-id">${escapeHtml(record.id)}</span>`;
    host.appendChild(article);
  });
}

function refreshViews() {
  renderRecentFromLocal();
  const search = document.getElementById('searchInput');
  if (search) search.dispatchEvent(new Event('input', { bubbles: true }));
}

async function hydrateFromCloud() {
  const author = currentAuthor();
  if (!author) return;

  try {
    updateConnection('Firebase conectado', 'ready');
    const cloudRecords = await fetchRecordsFromCloud();
    const localRecords = readLocalRecords();
    const cloudIds = new Set(cloudRecords.map(record => record.id));
    const pending = localRecords.filter(record => !cloudIds.has(record.id) && record.syncStatus !== 'synced');
    writeLocalRecords([...cloudRecords, ...pending]);
    refreshViews();
  } catch (error) {
    console.warn('GeoCampo: no se pudieron cargar los registros de Firestore.', error);
    updateConnection('Error de nube', 'error');
  }
}

async function syncPendingRecords() {
  if (syncing) return;
  const author = currentAuthor();
  if (!author) return;

  const candidates = readLocalRecords().filter(record =>
    record.userId === author.userId &&
    record.syncStatus !== 'synced' &&
    record.photoDataUrl
  );
  if (!candidates.length) return;

  syncing = true;
  updateConnection('Sincronizando…', 'syncing');

  for (const record of candidates) {
    try {
      let records = readLocalRecords();
      records = records.map(item => item.id === record.id ? { ...item, syncStatus: 'syncing' } : item);
      writeLocalRecords(records);

      const cloudRecord = await saveRecordToCloud({ ...record, syncStatus: 'synced' }, record.photoDataUrl);
      records = readLocalRecords().map(item => item.id === record.id
        ? { ...item, ...cloudRecord, photoDataUrl: item.photoDataUrl, syncStatus: 'synced', syncError: '' }
        : item
      );
      writeLocalRecords(records);
      refreshViews();
    } catch (error) {
      console.error('GeoCampo: error sincronizando registro', record.id, error);
      const records = readLocalRecords().map(item => item.id === record.id
        ? { ...item, syncStatus: 'error', syncError: error?.code || error?.message || 'Error de sincronización' }
        : item
      );
      writeLocalRecords(records);
      updateConnection('Error de sincronización', 'error');
    }
  }

  syncing = false;
  if (!readLocalRecords().some(record => record.syncStatus === 'error')) {
    updateConnection('Firebase conectado', 'ready');
  }
}

function patchLocalStorage() {
  if (window.__geoCampoCloudSyncPatched) return;
  window.__geoCampoCloudSyncPatched = true;
  const previousSetItem = Storage.prototype.setItem;

  Storage.prototype.setItem = function(key, value) {
    const result = previousSetItem.call(this, key, value);
    if (!internalWrite && this === window.localStorage && key === STORAGE_KEY) {
      queueMicrotask(syncPendingRecords);
    }
    return result;
  };
}

patchLocalStorage();

document.addEventListener('geocampo:authchange', async () => {
  await hydrateFromCloud();
  await syncPendingRecords();
});

window.addEventListener('online', syncPendingRecords);

window.GeoCampoCloud = {
  hydrate: hydrateFromCloud,
  sync: syncPendingRecords
};
