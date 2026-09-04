import { currentAuthor, saveRecordToCloud } from './cloud-data.js';

const STORAGE_KEY = 'geocampo_records_v01';
const NICARAGUA_CENTER = [12.8654, -85.2072];
const GPS_SAMPLE_MS = 12000;

const state = {
  photoDataUrl: '',
  location: null,
};

const mapState = {
  map: null,
  marker: null,
  accuracyCircle: null,
  layers: {},
  currentLayer: 'satellite',
  manualMode: false,
  gpsFix: null,
  watchId: null,
  sampleTimer: null,
  bestPosition: null,
  samples: 0,
  startedAt: 0,
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
  gpsProgress: $('gpsProgress'),
  fieldMap: $('fieldMap'),
  mapStatus: $('mapStatus'),
  mapStatusTitle: $('mapStatusTitle'),
  mapStatusText: $('mapStatusText'),
  manualModeBtn: $('manualModeBtn'),
  restoreGpsBtn: $('restoreGpsBtn'),
  manualHelp: $('manualHelp'),
  satelliteLayerBtn: $('satelliteLayerBtn'),
  streetLayerBtn: $('streetLayerBtn'),
  recordForm: $('recordForm'),
  recentRecords: $('recentRecords'),
  emptyState: $('emptyState'),
  dateValue: $('dateValue'),
  timeValue: $('timeValue'),
  toast: $('toast'),
  toastMessage: $('toastMessage'),
  toastIcon: $('toastIcon'),
  saveBtn: $('saveBtn'),
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
  const value = Number(accuracy);
  if (!Number.isFinite(value) || value <= 0) return { label: 'Sin dato', className: 'unknown' };
  if (value <= 5) return { label: 'Excelente', className: 'excellent' };
  if (value <= 10) return { label: 'Buena', className: 'good' };
  if (value <= 20) return { label: 'Aceptable', className: 'fair' };
  return { label: 'Baja', className: 'poor' };
}

function setGpsButton(label, disabled = false) {
  els.getLocationBtn.disabled = disabled;
  els.getLocationBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 21s7-5.2 7-12a7 7 0 1 0-14 0c0 6.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg> ${label}`;
}

function setLocationState(title, text, type = 'default') {
  const icon = type === 'success'
    ? '<path d="M5 12l4 4L19 6"/>'
    : type === 'error'
      ? '<path d="M12 9v4M12 17h.01"/><path d="M10.3 4.3 2.8 18a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z"/>'
      : '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>';
  els.locationState.innerHTML = `<span class="location-orb"><svg viewBox="0 0 24 24">${icon}</svg></span><div><strong>${title}</strong><small>${text}</small></div>`;
}

function setMapStatus(title, text, mode = 'idle') {
  els.mapStatusTitle.textContent = title;
  els.mapStatusText.textContent = text;
  els.mapStatus.classList.toggle('has-gps', mode === 'gps');
  els.mapStatus.classList.toggle('manual', mode === 'manual');
}

function markerIcon(manual = false) {
  if (!window.L) return null;
  return window.L.divIcon({
    className: 'geocampo-marker-wrap',
    html: `<div class="geocampo-marker${manual ? ' manual' : ''}"></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 31],
  });
}

function initMap() {
  if (!window.L || !els.fieldMap) {
    setMapStatus('Mapa no disponible', 'No se pudo cargar el motor cartográfico. El GPS seguirá funcionando.', 'idle');
    return;
  }

  const L = window.L;
  mapState.map = L.map(els.fieldMap, {
    center: NICARAGUA_CENTER,
    zoom: 7,
    zoomControl: false,
    preferCanvas: true,
  });

  L.control.zoom({ position: 'bottomright' }).addTo(mapState.map);

  mapState.layers.satellite = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 21,
      attribution: 'Tiles © Esri · Sources: Esri, Maxar, Earthstar Geographics, GIS User Community',
    }
  );

  mapState.layers.street = L.tileLayer(
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      maxNativeZoom: 19,
      maxZoom: 21,
      attribution: '© OpenStreetMap contributors',
    }
  );

  mapState.layers.satellite.addTo(mapState.map);
  els.manualModeBtn.disabled = false;

  mapState.map.on('click', (event) => {
    if (!mapState.manualMode) return;
    applyManualLocation(event.latlng, false);
  });

  window.setTimeout(() => mapState.map.invalidateSize(), 250);
}

function switchMapLayer(name) {
  if (!mapState.map || !mapState.layers[name] || mapState.currentLayer === name) return;
  mapState.map.removeLayer(mapState.layers[mapState.currentLayer]);
  mapState.layers[name].addTo(mapState.map);
  mapState.currentLayer = name;
  els.satelliteLayerBtn.classList.toggle('active', name === 'satellite');
  els.streetLayerBtn.classList.toggle('active', name === 'street');
}

els.satelliteLayerBtn.addEventListener('click', () => switchMapLayer('satellite'));
els.streetLayerBtn.addEventListener('click', () => switchMapLayer('street'));

function ensureMarker(lat, lng, manual = false) {
  if (!mapState.map || !window.L) return;
  const L = window.L;
  if (!mapState.marker) {
    mapState.marker = L.marker([lat, lng], {
      icon: markerIcon(manual),
      draggable: false,
      autoPan: true,
      title: 'Punto de levantamiento',
    }).addTo(mapState.map);

    mapState.marker.on('drag', (event) => {
      if (mapState.manualMode) applyManualLocation(event.target.getLatLng(), true);
    });
    mapState.marker.on('dragend', (event) => {
      if (mapState.manualMode) applyManualLocation(event.target.getLatLng(), false);
    });
  } else {
    mapState.marker.setLatLng([lat, lng]);
    mapState.marker.setIcon(markerIcon(manual));
  }

  if (mapState.manualMode) mapState.marker.dragging.enable();
  else mapState.marker.dragging.disable();
}

function updateAccuracyCircle(lat, lng, accuracy) {
  if (!mapState.map || !window.L) return;
  const radius = Number(accuracy);
  if (!Number.isFinite(radius) || radius <= 0) {
    if (mapState.accuracyCircle) {
      mapState.map.removeLayer(mapState.accuracyCircle);
      mapState.accuracyCircle = null;
    }
    return;
  }

  if (!mapState.accuracyCircle) {
    mapState.accuracyCircle = window.L.circle([lat, lng], {
      radius,
      color: '#245f96',
      weight: 1.5,
      opacity: 0.75,
      fillColor: '#4f89bd',
      fillOpacity: 0.12,
      interactive: false,
    }).addTo(mapState.map);
  } else {
    mapState.accuracyCircle.setLatLng([lat, lng]);
    mapState.accuracyCircle.setRadius(radius);
  }
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (value) => value * Math.PI / 180;
  const R = 6371008.8;
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dp = toRad(lat2 - lat1);
  const dl = toRad(lon2 - lon1);
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function updateCoordinateDisplay(location) {
  els.latitudeValue.textContent = Number(location.latitude).toFixed(6);
  els.longitudeValue.textContent = Number(location.longitude).toFixed(6);
  els.accuracyValue.textContent = Number.isFinite(Number(location.gpsAccuracy))
    ? `± ${Number(location.gpsAccuracy).toFixed(1)} m`
    : 'Sin lectura GPS';

  if (location.locationMethod === 'manual') {
    els.qualityValue.textContent = Number.isFinite(Number(location.manualOffsetMeters))
      ? `Manual · ${Number(location.manualOffsetMeters).toFixed(1)} m`
      : 'Manual';
  } else {
    els.qualityValue.textContent = `GPS · ${gpsQuality(location.gpsAccuracy).label}`;
  }
}

function normalizeGpsFix(position) {
  const { latitude, longitude, accuracy, altitude, heading, speed } = position.coords;
  return {
    latitude,
    longitude,
    accuracy,
    altitude,
    heading,
    speed,
    capturedAt: new Date().toISOString(),
  };
}

function previewGpsPosition(position) {
  const fix = normalizeGpsFix(position);
  const quality = gpsQuality(fix.accuracy);
  els.latitudeValue.textContent = fix.latitude.toFixed(6);
  els.longitudeValue.textContent = fix.longitude.toFixed(6);
  els.accuracyValue.textContent = `± ${fix.accuracy.toFixed(1)} m`;
  els.qualityValue.textContent = `Midiendo · ${quality.label}`;
  ensureMarker(fix.latitude, fix.longitude, false);
  updateAccuracyCircle(fix.latitude, fix.longitude, fix.accuracy);
  if (mapState.map) mapState.map.setView([fix.latitude, fix.longitude], Math.max(mapState.map.getZoom(), 18), { animate: true });
  setLocationState('Mejorando precisión GPS', `Mejor lectura: ±${fix.accuracy.toFixed(1)} m · muestra ${mapState.samples}.`, 'default');
  setMapStatus('GPS en tiempo real', `Muestra ${mapState.samples} · mejor precisión ±${fix.accuracy.toFixed(1)} m`, 'gps');
}

function applyGpsFix(fix, fly = true) {
  const quality = gpsQuality(fix.accuracy);
  mapState.gpsFix = { ...fix };
  state.location = {
    latitude: fix.latitude,
    longitude: fix.longitude,
    accuracy: fix.accuracy,
    gpsAccuracy: fix.accuracy,
    altitude: fix.altitude,
    heading: fix.heading,
    speed: fix.speed,
    capturedAt: fix.capturedAt || new Date().toISOString(),
    locationMethod: 'gps',
    manualAdjusted: false,
    gpsLatitude: fix.latitude,
    gpsLongitude: fix.longitude,
    manualOffsetMeters: 0,
  };

  setManualMode(false, true);
  updateCoordinateDisplay(state.location);
  ensureMarker(fix.latitude, fix.longitude, false);
  updateAccuracyCircle(fix.latitude, fix.longitude, fix.accuracy);

  if (mapState.map && fly) {
    mapState.map.flyTo([fix.latitude, fix.longitude], Math.max(mapState.map.getZoom(), 19), { duration: 0.8 });
  }

  setLocationState('Ubicación GPS fijada', `${fix.latitude.toFixed(6)}, ${fix.longitude.toFixed(6)} · precisión ±${fix.accuracy.toFixed(1)} m.`, 'success');
  setMapStatus('Punto GPS automático', `Círculo azul: precisión reportada ±${fix.accuracy.toFixed(1)} m`, 'gps');
  els.gpsHeroTitle.textContent = `GPS ${quality.label.toLowerCase()}`;
  els.gpsHeroSubtitle.textContent = `Precisión estimada ±${fix.accuracy.toFixed(1)} metros`;
  els.restoreGpsBtn.disabled = true;
  els.manualModeBtn.disabled = false;
}

function applyManualLocation(latlng, live = false) {
  const latitude = Number(latlng.lat);
  const longitude = Number(latlng.lng);
  let offset = null;

  if (mapState.gpsFix) {
    offset = haversineMeters(
      mapState.gpsFix.latitude,
      mapState.gpsFix.longitude,
      latitude,
      longitude
    );
  }

  state.location = {
    ...(state.location || {}),
    latitude,
    longitude,
    accuracy: mapState.gpsFix?.accuracy ?? null,
    gpsAccuracy: mapState.gpsFix?.accuracy ?? null,
    altitude: mapState.gpsFix?.altitude ?? null,
    heading: mapState.gpsFix?.heading ?? null,
    speed: mapState.gpsFix?.speed ?? null,
    capturedAt: state.location?.capturedAt || new Date().toISOString(),
    manualAdjustedAt: new Date().toISOString(),
    locationMethod: 'manual',
    manualAdjusted: true,
    gpsLatitude: mapState.gpsFix?.latitude ?? null,
    gpsLongitude: mapState.gpsFix?.longitude ?? null,
    manualOffsetMeters: offset,
  };

  ensureMarker(latitude, longitude, true);
  updateCoordinateDisplay(state.location);
  const offsetText = Number.isFinite(offset) ? ` · desplazamiento ${offset.toFixed(1)} m desde GPS` : '';
  setLocationState('Punto ajustado manualmente', `${latitude.toFixed(6)}, ${longitude.toFixed(6)}${offsetText}.`, 'success');
  setMapStatus('Ajuste manual activo', Number.isFinite(offset) ? `Separación respecto al GPS: ${offset.toFixed(1)} m` : 'Punto colocado manualmente sin lectura GPS previa.', 'manual');
  els.gpsHeroTitle.textContent = 'Ubicación ajustada manualmente';
  els.gpsHeroSubtitle.textContent = Number.isFinite(offset) ? `Ajuste de ${offset.toFixed(1)} m respecto al GPS` : 'Punto definido sobre el mapa';
  els.restoreGpsBtn.disabled = !mapState.gpsFix;

  if (!live) showToast('Posición manual actualizada');
}

function setManualMode(enabled, silent = false) {
  mapState.manualMode = Boolean(enabled);
  els.fieldMap.classList.toggle('manual-adjust', mapState.manualMode);
  els.manualHelp.hidden = !mapState.manualMode;
  els.manualModeBtn.textContent = mapState.manualMode ? 'Finalizar ajuste' : 'Ajustar manualmente';

  if (mapState.marker) {
    if (mapState.manualMode) mapState.marker.dragging.enable();
    else mapState.marker.dragging.disable();
  }

  if (mapState.manualMode) {
    setMapStatus(
      'Modo manual activo',
      mapState.marker ? 'Arrastra el marcador o toca el mapa para moverlo.' : 'Toca el mapa para colocar el punto y luego podrás arrastrarlo.',
      'manual'
    );
    if (!silent) showToast('Ajuste manual activado');
  } else if (!silent && state.location?.locationMethod === 'manual') {
    showToast('Ajuste manual finalizado');
  }
}

els.manualModeBtn.addEventListener('click', () => setManualMode(!mapState.manualMode));

els.restoreGpsBtn.addEventListener('click', () => {
  if (!mapState.gpsFix) return;
  applyGpsFix(mapState.gpsFix, true);
  showToast('Se restauró la posición GPS automática');
});

function clearGpsWatch() {
  if (mapState.watchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(mapState.watchId);
  }
  mapState.watchId = null;
  if (mapState.sampleTimer) window.clearTimeout(mapState.sampleTimer);
  mapState.sampleTimer = null;
  els.gpsProgress.classList.remove('active');
}

function finishGpsAcquisition() {
  const best = mapState.bestPosition;
  clearGpsWatch();
  els.refreshLocationBtn.disabled = false;
  setGpsButton('Actualizar GPS de alta precisión', false);

  if (!best) {
    setLocationState('Ubicación no disponible', 'No se obtuvo una lectura GPS válida. Revisa permisos, señal y cielo abierto.', 'error');
    setMapStatus('Sin lectura GPS', 'Puedes reintentar o definir el punto manualmente sobre el mapa.', 'idle');
    showToast('No fue posible obtener una ubicación GPS', 'error');
    return;
  }

  const fix = normalizeGpsFix(best);
  applyGpsFix(fix, true);
  showToast(`GPS fijado con precisión ±${fix.accuracy.toFixed(1)} m`);
}

function handleGpsSample(position) {
  mapState.samples += 1;
  if (!mapState.bestPosition || position.coords.accuracy < mapState.bestPosition.coords.accuracy) {
    mapState.bestPosition = position;
  }
  previewGpsPosition(mapState.bestPosition);

  const elapsed = Date.now() - mapState.startedAt;
  if (mapState.bestPosition.coords.accuracy <= 3 && elapsed >= 4000) {
    finishGpsAcquisition();
  }
}

function handleGpsError(error) {
  if (error.code === 1) {
    clearGpsWatch();
    els.refreshLocationBtn.disabled = false;
    setGpsButton('Reintentar GPS', false);
    setLocationState('Permiso de ubicación denegado', 'Habilita la ubicación en el navegador o utiliza el ajuste manual del mapa.', 'error');
    setMapStatus('GPS bloqueado', 'El mapa sigue disponible para ubicar el punto manualmente.', 'idle');
    showToast('Permiso de ubicación denegado', 'error');
  }
}

function requestLocation() {
  if (!navigator.geolocation) {
    showToast('Este dispositivo no permite geolocalización', 'error');
    return;
  }

  clearGpsWatch();
  setManualMode(false, true);
  mapState.bestPosition = null;
  mapState.samples = 0;
  mapState.startedAt = Date.now();
  setGpsButton('Midiendo GPS…', true);
  els.refreshLocationBtn.disabled = true;
  setLocationState('Buscando la mejor señal', 'Durante unos segundos se compararán varias lecturas y se conservará la más precisa.', 'default');
  setMapStatus('Adquiriendo GPS', 'El marcador seguirá en tiempo real la mejor lectura disponible.', 'gps');
  els.gpsProgress.classList.remove('active');
  void els.gpsProgress.offsetWidth;
  els.gpsProgress.classList.add('active');

  mapState.watchId = navigator.geolocation.watchPosition(
    handleGpsSample,
    handleGpsError,
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );

  mapState.sampleTimer = window.setTimeout(finishGpsAcquisition, GPS_SAMPLE_MS);
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
  return String(value).replace(/[&<>'\"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '\"':'&quot;' }[char]));
}

function renderRecentRecords() {
  const records = getRecords().slice().reverse().slice(0, 4);
  els.recentRecords.innerHTML = '';
  els.emptyState.hidden = records.length > 0;

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
        <strong>${escapeHtml(record.type)}</strong>
        <p>${escapeHtml(record.observation || 'Sin observaciones adicionales')}</p>
        <div class="record-meta">
          <span class="meta-chip">${Number(record.latitude).toFixed(6)}, ${Number(record.longitude).toFixed(6)}</span>
          <span class="meta-chip">${accuracyText}</span>
          <span class="meta-chip">${methodText}</span>
          <span class="meta-chip">${escapeHtml(record.date)}</span>
          ${record.userName ? `<span class="meta-chip">Por ${escapeHtml(record.userName)}</span>` : ''}
        </div>
      </div>
      <span class="record-id">${escapeHtml(record.id)}</span>`;
    els.recentRecords.appendChild(article);
  });
}

function resetLocationAfterSave() {
  clearGpsWatch();
  state.location = null;
  mapState.gpsFix = null;
  mapState.bestPosition = null;
  setManualMode(false, true);

  if (mapState.map && mapState.marker) {
    mapState.map.removeLayer(mapState.marker);
    mapState.marker = null;
  }
  if (mapState.map && mapState.accuracyCircle) {
    mapState.map.removeLayer(mapState.accuracyCircle);
    mapState.accuracyCircle = null;
  }

  els.latitudeValue.textContent = '—';
  els.longitudeValue.textContent = '—';
  els.accuracyValue.textContent = '—';
  els.qualityValue.textContent = '—';
  els.restoreGpsBtn.disabled = true;
  els.manualModeBtn.disabled = !mapState.map;
  setGpsButton('Obtener GPS de alta precisión', false);
  setLocationState('Esperando ubicación', 'Obtén la señal GPS cuando estés frente al punto que documentas.', 'default');
  setMapStatus('Mapa listo', 'Obtén el GPS para centrar el punto automáticamente.', 'idle');
  els.gpsHeroTitle.textContent = 'GPS listo para iniciar';
  els.gpsHeroSubtitle.textContent = 'Activa la ubicación al crear un registro';
}

function resetFormAfterSave() {
  els.recordForm.reset();
  state.photoDataUrl = '';
  els.photoPreview.hidden = true;
  els.photoPreview.src = '';
  els.cameraPlaceholder.hidden = false;
  els.replacePhotoBtn.hidden = true;
  els.photoInput.value = '';
  resetLocationAfterSave();
  renderRecentRecords();
  refreshClock();
}

function setSavingState(saving) {
  if (!els.saveBtn) return;
  els.saveBtn.disabled = saving;
  els.saveBtn.innerHTML = saving
    ? '<span class="save-spinner" aria-hidden="true"></span> Guardando en Firebase…'
    : '<svg viewBox="0 0 24 24"><path d="M5 12l4 4L19 6"/></svg> Guardar registro';
}

els.recordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.photoDataUrl) {
    showToast('Debes tomar una fotografía antes de guardar', 'error');
    return;
  }
  if (!state.location) {
    showToast('Debes capturar o definir la ubicación antes de guardar', 'error');
    return;
  }

  const author = currentAuthor();
  if (!author) {
    window.GeoCampoAuth?.openLogin?.('Debes iniciar sesión antes de guardar para identificar quién realizó el registro.');
    return;
  }

  const now = formatDateTime();
  const record = {
    id: `GC-${Date.now().toString().slice(-8)}`,
    ...state.location,
    ...author,
    type: $('type').value,
    status: $('status').value,
    section: $('section').value.trim(),
    direction: $('direction').value,
    observation: $('observation').value.trim(),
    date: now.date,
    time: now.time,
    createdAt: now.iso,
    mapLayer: mapState.currentLayer,
    syncStatus: 'syncing',
  };

  setSavingState(true);

  try {
    // Camino principal: la fotografía va directamente a Firebase Storage y
    // Firestore. localStorage recibe únicamente metadatos + imageUrl.
    const cloudRecord = await saveRecordToCloud(record, state.photoDataUrl);
    const records = getRecords().filter(item => item.id !== record.id);
    records.push({ ...record, ...cloudRecord, syncStatus: 'synced' });
    saveRecords(records);
    resetFormAfterSave();
    showToast('Registro guardado en Firebase correctamente');
  } catch (cloudError) {
    console.warn('GeoCampo: guardado directo en Firebase no disponible; usando respaldo local.', cloudError);

    // Respaldo temporal para pérdida de conectividad. Solo la evidencia pendiente
    // conserva base64; en cuanto sincroniza, cloud-sync.js la elimina automáticamente.
    const pendingRecord = {
      ...record,
      photoDataUrl: state.photoDataUrl,
      syncStatus: 'local',
      syncError: cloudError?.code || cloudError?.message || 'Pendiente de sincronización'
    };

    try {
      const records = getRecords();
      records.push(pendingRecord);
      saveRecords(records);
      resetFormAfterSave();
      window.GeoCampoCloud?.sync?.();
      showToast('Registro guardado temporalmente. Se sincronizará al recuperar conexión.');
    } catch (localError) {
      console.error('GeoCampo: no se pudo crear respaldo local.', localError);
      showToast('No hay conexión con Firebase y el respaldo local está lleno. Conéctate a internet y vuelve a guardar.', 'error');
    }
  } finally {
    setSavingState(false);
  }
});

window.addEventListener('beforeunload', clearGpsWatch);

refreshClock();
setInterval(refreshClock, 1000);
initMap();
renderRecentRecords();
