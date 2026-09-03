const STORAGE_KEY = 'geocampo_records_v01';

const state = {
  photoDataUrl: '',
  location: null,
};

const $ = (id) => document.getElementById(id);

const els = {
  photoInput: $('photoInput'),
  photoPreview: $('photoPreview'),
  cameraPlaceholder: $('cameraPlaceholder'),
  replacePhotoBtn: $('replacePhotoBtn'),
  getLocationBtn: $('getLocationBtn'),
  refreshLocationBtn: $('refreshLocationBtn'),
  latitudeValue: $('latitudeValue'),
  longitudeValue: $('longitudeValue'),
  accuracyValue: $('accuracyValue'),
  qualityValue: $('qualityValue'),
  locationState: $('locationState'),
  gpsHeroTitle: $('gpsHeroTitle'),
  gpsHeroSubtitle: $('gpsHeroSubtitle'),
  recordForm: $('recordForm'),
  recentRecords: $('recentRecords'),
  emptyState: $('emptyState'),
  dateValue: $('dateValue'),
  timeValue: $('timeValue'),
  toast: $('toast'),
  toastMessage: $('toastMessage'),
  toastIcon: $('toastIcon'),
};

function formatDateTime(date = new Date()) {
  return {
    date: new Intl.DateTimeFormat('es-NI', { dateStyle: 'medium' }).format(date),
    time: new Intl.DateTimeFormat('es-NI', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date),
    iso: date.toISOString(),
  };
}

function refreshClock() {
  const now = formatDateTime();
  els.dateValue.textContent = now.date;
  els.timeValue.textContent = now.time;
}

function showToast(message, type = 'success') {
  els.toastMessage.textContent = message;
  els.toastIcon.textContent = type === 'error' ? '!' : '✓';
  els.toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove('show'), 2800);
}

function resizeImage(file, maxWidth = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

els.photoInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    state.photoDataUrl = await resizeImage(file);
    els.photoPreview.src = state.photoDataUrl;
    els.photoPreview.hidden = false;
    els.cameraPlaceholder.hidden = true;
    els.replacePhotoBtn.hidden = false;
    showToast('Fotografía lista para registrar');
  } catch {
    showToast('No se pudo procesar la fotografía', 'error');
  }
});

els.replacePhotoBtn.addEventListener('click', (event) => {
  event.preventDefault();
  els.photoInput.click();
});

function gpsQuality(accuracy) {
  if (accuracy <= 5) return { label: 'Excelente', className: 'excellent' };
  if (accuracy <= 10) return { label: 'Buena', className: 'good' };
  if (accuracy <= 20) return { label: 'Aceptable', className: 'fair' };
  return { label: 'Baja', className: 'poor' };
}

function requestLocation() {
  if (!navigator.geolocation) {
    showToast('Este dispositivo no permite geolocalización', 'error');
    return;
  }

  els.getLocationBtn.disabled = true;
  els.getLocationBtn.textContent = 'Obteniendo señal GPS…';
  els.locationState.innerHTML = '<span class="location-orb"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg></span><div><strong>Localizando punto</strong><small>Espera unos segundos para obtener la mejor precisión disponible.</small></div>';

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude, accuracy, altitude, heading, speed } = position.coords;
      const quality = gpsQuality(accuracy);
      state.location = { latitude, longitude, accuracy, altitude, heading, speed, capturedAt: new Date().toISOString() };
      els.latitudeValue.textContent = latitude.toFixed(6);
      els.longitudeValue.textContent = longitude.toFixed(6);
      els.accuracyValue.textContent = `± ${accuracy.toFixed(1)} m`;
      els.qualityValue.textContent = quality.label;
      els.locationState.innerHTML = `<span class="location-orb"><svg viewBox="0 0 24 24"><path d="M5 12l4 4L19 6"/></svg></span><div><strong>Ubicación capturada</strong><small>${latitude.toFixed(6)}, ${longitude.toFixed(6)} · precisión ±${accuracy.toFixed(1)} m</small></div>`;
      els.gpsHeroTitle.textContent = `GPS ${quality.label.toLowerCase()}`;
      els.gpsHeroSubtitle.textContent = `Precisión estimada ±${accuracy.toFixed(1)} metros`;
      els.getLocationBtn.disabled = false;
      els.getLocationBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 21s7-5.2 7-12a7 7 0 1 0-14 0c0 6.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg> Actualizar GPS';
      showToast('Coordenadas capturadas');
    },
    (error) => {
      const message = error.code === 1 ? 'Permiso de ubicación denegado' : 'No fue posible obtener una ubicación precisa';
      els.locationState.innerHTML = `<span class="location-orb"><svg viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01"/><path d="M10.3 4.3 2.8 18a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z"/></svg></span><div><strong>Ubicación no disponible</strong><small>${message}. Revisa los permisos del navegador e intenta de nuevo.</small></div>`;
      els.getLocationBtn.disabled = false;
      els.getLocationBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 21s7-5.2 7-12a7 7 0 1 0-14 0c0 6.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg> Reintentar GPS';
      showToast(message, 'error');
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

els.getLocationBtn.addEventListener('click', requestLocation);
els.refreshLocationBtn.addEventListener('click', requestLocation);

function getRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[char]));
}

function renderRecentRecords() {
  const records = getRecords().slice().reverse().slice(0, 4);
  els.recentRecords.innerHTML = '';
  els.emptyState.hidden = records.length > 0;

  records.forEach((record) => {
    const article = document.createElement('article');
    article.className = 'record-item';
    article.innerHTML = `
      <img class="record-thumb" src="${record.photoDataUrl}" alt="Evidencia del registro ${escapeHtml(record.id)}" />
      <div class="record-main">
        <strong>${escapeHtml(record.type)}</strong>
        <p>${escapeHtml(record.observation || 'Sin observaciones adicionales')}</p>
        <div class="record-meta">
          <span class="meta-chip">${record.latitude.toFixed(6)}, ${record.longitude.toFixed(6)}</span>
          <span class="meta-chip">±${record.accuracy.toFixed(1)} m</span>
          <span class="meta-chip">${escapeHtml(record.date)}</span>
        </div>
      </div>
      <span class="record-id">${escapeHtml(record.id)}</span>`;
    els.recentRecords.appendChild(article);
  });
}

els.recordForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!state.photoDataUrl) {
    showToast('Debes tomar una fotografía antes de guardar', 'error');
    return;
  }
  if (!state.location) {
    showToast('Debes capturar la ubicación GPS antes de guardar', 'error');
    return;
  }

  const now = formatDateTime();
  const record = {
    id: `GC-${Date.now().toString().slice(-8)}`,
    photoDataUrl: state.photoDataUrl,
    ...state.location,
    type: $('type').value,
    status: $('status').value,
    section: $('section').value.trim(),
    direction: $('direction').value,
    observation: $('observation').value.trim(),
    date: now.date,
    time: now.time,
    createdAt: now.iso,
    syncStatus: 'local',
  };

  const records = getRecords();
  records.push(record);
  try {
    saveRecords(records);
  } catch {
    showToast('El almacenamiento local está lleno. Con Firebase este límite desaparecerá.', 'error');
    return;
  }

  els.recordForm.reset();
  state.photoDataUrl = '';
  state.location = null;
  els.photoPreview.hidden = true;
  els.photoPreview.src = '';
  els.cameraPlaceholder.hidden = false;
  els.replacePhotoBtn.hidden = true;
  els.latitudeValue.textContent = '—';
  els.longitudeValue.textContent = '—';
  els.accuracyValue.textContent = '—';
  els.qualityValue.textContent = '—';
  els.locationState.innerHTML = '<span class="location-orb"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></svg></span><div><strong>Esperando ubicación</strong><small>Presiona “Obtener GPS” para registrar las coordenadas.</small></div>';
  els.gpsHeroTitle.textContent = 'GPS listo para iniciar';
  els.gpsHeroSubtitle.textContent = 'Activa la ubicación al crear un registro';
  els.photoInput.value = '';
  renderRecentRecords();
  refreshClock();
  showToast('Registro guardado correctamente');
});

refreshClock();
setInterval(refreshClock, 1000);
renderRecentRecords();
