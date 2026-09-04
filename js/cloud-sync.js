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

function compactRecord(record) {
  if (!record || typeof record !== 'object') return record;

  // Una vez que Firebase confirma el registro y existe una URL remota,
  // la fotografía base64 deja de almacenarse en localStorage. Esto evita
  // llenar el límite del navegador después de unas pocas evidencias.
  if (record.syncStatus === 'synced' && record.imageUrl) {
    const { photoDataUrl, ...compact } = record;
    return compact;
  }

  return record;
}

function compactRecords(records) {
  return (Array.isArray(records) ? records : []).map(compactRecord);
}

function writeLocalRecords(records) {
  internalWrite = true;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(compactRecords(records)));
  } finally {
    internalWrite = false;
  }
}

function recoverLocalStorageSpace() {
  const records = readLocalRecords();
  if (!records.length) return;

  const compacted = compactRecords(records);
  const before = JSON.stringify(records).length;
  const after = JSON.stringify(compacted).length;

  if (after < before) {
    try {
      internalWrite = true;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(compacted));
      console.info(`GeoCampo: almacenamiento local optimizado (${Math.round((before - after) / 1024)} KB liberados).`);
    } catch (error) {
      console.warn('GeoCampo: no se pudo compactar el almacenamiento local.', error);
    } finally {
      internalWrite = false;
    }
  }
}

function prepareCloudUi() {
  const hint = document.querySelector('.form-hint');
  if (hint) hint.textContent = 'Las fotos se guardan en Firebase; el dispositivo conserva solo una copia temporal durante la sincronización.';

  const sidebarSmall = document.querySelector('.sidebar-foot small');
  if (sidebarSmall) sidebarSmall.textContent = 'Firestore + Storage conectados';

  const statusMini = document.querySelector('.status-mini');
  if (statusMini) {
    const dot = statusMini.querySelector('i');
    statusMini.textContent = '';
    if (dot) statusMini.appendChild(dot);
    statusMini.appendChild(document.createTextNode(' Nube activa'));
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
  return String(value).replace(/[&<>'\"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '\"':'&quot;' }[char]));
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
    const image = record.imageUrl || record.photoDataUrl || '';
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
    const pending = localRecords.filter(record =>
      !cloudIds.has(record.id)
      && record.syncStatus !== 'synced'
      && (!record.userId || record.userId === author.userId)
    );
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
      records = readLocalRecords().map(item => {
        if (item.id !== record.id) return item;
        const { photoDataUrl, ...withoutLocalPhoto } = item;
        return {
          ...withoutLocalPhoto,
          ...cloudRecord,
          syncStatus: 'synced',
          syncError: ''
        };
      });
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
    if (this !== window.localStorage || key !== STORAGE_KEY || internalWrite) {
      return previousSetItem.call(this, key, value);
    }

    try {
      const result = previousSetItem.call(this, key, value);
      queueMicrotask(syncPendingRecords);
      return result;
    } catch (error) {
      // Si el navegador alcanza su cuota, eliminamos inmediatamente las
      // copias base64 de registros que ya están seguros en Firebase y reintentamos.
      if (error?.name !== 'QuotaExceededError' && error?.name !== 'NS_ERROR_DOM_QUOTA_REACHED') throw error;

      recoverLocalStorageSpace();

      try {
        const incoming = JSON.parse(value);
        const compactedValue = JSON.stringify(compactRecords(incoming));
        const result = previousSetItem.call(this, key, compactedValue);
        queueMicrotask(syncPendingRecords);
        return result;
      } catch (retryError) {
        throw retryError;
      }
    }
  };
}

recoverLocalStorageSpace();
prepareCloudUi();
patchLocalStorage();

document.addEventListener('geocampo:authchange', async () => {
  recoverLocalStorageSpace();
  prepareCloudUi();
  await hydrateFromCloud();
  await syncPendingRecords();
  recoverLocalStorageSpace();
});

window.addEventListener('online', syncPendingRecords);

window.GeoCampoCloud = {
  hydrate: hydrateFromCloud,
  sync: syncPendingRecords,
  compact: recoverLocalStorageSpace
};
