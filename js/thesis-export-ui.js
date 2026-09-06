import { fetchRecordsFromCloud } from './cloud-data.js';
import { exportThesisPackage, exportThesisWorkbook } from './thesis-export.js';

const STORAGE_KEY = 'geocampo_records_v01';
const excelBtn = document.getElementById('exportThesisBtn');
const packageBtn = document.getElementById('exportPackageBtn');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');
let exporting = false;

function localRecords() {
  try {
    const records = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

function showToast(message, duration = 3500) {
  if (!toast || !toastMessage) return;
  toastMessage.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), duration);
}

function authenticated() {
  return Boolean(window.GeoCampoAuth?.isAuthenticated?.());
}

async function freshRecords() {
  const cloud = await fetchRecordsFromCloud();
  const ids = new Set(cloud.map(record => record.id));
  const pending = localRecords().filter(record => !ids.has(record.id) && record.syncStatus !== 'synced');
  return [...cloud, ...pending].sort((a, b) => String(a.createdAt || a.createdAtServer || '').localeCompare(String(b.createdAt || b.createdAtServer || '')));
}

function setBusy(active, activeButton = null, text = '') {
  exporting = active;
  [excelBtn, packageBtn].forEach(button => {
    if (!button) return;
    button.disabled = active;
    button.setAttribute('aria-busy', active ? 'true' : 'false');
  });
  if (activeButton && text) activeButton.textContent = text;
}

function resetLabels() {
  if (excelBtn) excelBtn.innerHTML = '<span class="export-icon">XLSX</span><span><strong>Excel visual + fotos</strong><small>Miniaturas incrustadas y tablas de tesis</small></span>';
  if (packageBtn) packageBtn.innerHTML = '<span class="export-icon photo">ZIP</span><span><strong>Paquete completo de evidencias</strong><small>Excel visual + fotos originales verificadas</small></span>';
}

function progressHandler(button) {
  return progress => {
    if (!button) return;
    if (progress.stage === 'libraries') button.textContent = 'Preparando motor de exportación…';
    else if (progress.stage === 'photos') button.textContent = `Procesando fotografías ${progress.current}/${progress.total}…`;
    else if (progress.stage === 'workbook') button.textContent = 'Construyendo Excel visual…';
    else if (progress.stage === 'zip') button.textContent = 'Armando paquete de evidencias…';
    else if (progress.stage === 'zip-progress') button.textContent = `Comprimiendo ${Math.round(progress.percent || 0)}%…`;
  };
}

function photoSummary(result) {
  const expected = Number(result.expectedPhotos || 0);
  const included = Number(result.photos || 0);
  const missing = Number(result.missingPhotos || 0);
  if (!expected) return ' No había fotografías asociadas a los registros.';
  if (!missing && included === expected) return ` Fotografías verificadas: ${included}/${expected}.`;
  return ` Fotografías verificadas: ${included}/${expected}; ${missing} no pudieron recuperarse.`;
}

async function beginExport(mode) {
  if (exporting) return;
  if (!authenticated()) {
    window.GeoCampoAuth?.openLogin?.('Inicia sesión para exportar la base completa de registros del equipo.');
    return;
  }

  const button = mode === 'package' ? packageBtn : excelBtn;
  setBusy(true, button, 'Actualizando base desde Firebase…');

  try {
    const records = await freshRecords();
    if (!records.length) {
      showToast('No hay registros disponibles para exportar');
      return;
    }

    if (mode === 'package') {
      const result = await exportThesisPackage(records, { onProgress: progressHandler(button) });
      showToast(`Paquete completo generado con ${result.records} registros.${photoSummary(result)}`, 7000);
    } else {
      const result = await exportThesisWorkbook(records, { onProgress: progressHandler(button) });
      showToast(`Excel visual generado con ${result.records} registros y miniaturas incrustadas.${photoSummary(result)}`, 6500);
    }
  } catch (error) {
    console.error('GeoCampo: error en exportación de tesis', error);
    const message = error?.message === 'NO_RECORDS'
      ? 'No hay registros para exportar.'
      : error?.code === 'permission-denied'
        ? 'Firebase no permitió consultar todos los registros. Revisa las reglas publicadas.'
        : 'No se pudo generar la exportación. Abre la consola del navegador para ver el detalle y vuelve a intentarlo.';
    showToast(message, 6000);
  } finally {
    setBusy(false);
    resetLabels();
  }
}

excelBtn?.addEventListener('click', () => beginExport('excel'));
packageBtn?.addEventListener('click', () => beginExport('package'));
resetLabels();
