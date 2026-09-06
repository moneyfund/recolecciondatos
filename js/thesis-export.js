import { storage } from './firebase.js';
import { getDownloadURL, ref } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';

const XL = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
const ZIP = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';

const COLORS = {
  navy: 'FF071A33',
  blue: 'FF0D3B66',
  blue2: 'FF245F96',
  teal: 'FF1A8A84',
  light: 'FFF4F8FB',
  paleBlue: 'FFEAF2F8',
  paleTeal: 'FFE8F6F3',
  paleAmber: 'FFFFF4D6',
  text: 'FF17324D',
  muted: 'FF6B7F92',
  border: 'FFD9E2EB',
  white: 'FFFFFFFF',
  good: 'FFE7F6EC',
  goodText: 'FF23653C',
  regular: 'FFFFF4D6',
  regularText: 'FF8A5A00',
  bad: 'FFFFE7E7',
  badText: 'FF9D2525',
};

const H = {
  inspection: ['ID','Progresiva','Coord. N','Coord. E','Ancho calzada (m)','Ancho carril prom. (m)','Hombro izq. (m)','Hombro der. (m)','Superficie','Estado pavimento','Drenaje','Accesos / intersecciones','Actividad peatonal','Visibilidad','Iluminación','Vegetación / obstáculos','Señalización vertical','Señalización horizontal','Riesgo preliminar','Foto ID','Fecha','Observaciones'],
  vertical: ['ID','Progresiva','Coord. N','Coord. E','Sentido','Lado','Grupo','Código señal','Descripción','Existe','Estado físico','Visibilidad','Retroreflectividad aparente','Obstruida','Soporte / poste','Ubicación / montaje','Cumplimiento preliminar','Acción requerida','Prioridad','Foto ID','Observaciones'],
  horizontal: ['ID','Prog. inicial','Prog. final','Sentido','Tipo de marca','Color','Ancho (cm)','Longitud (m)','Continuidad','Visibilidad diurna','Visibilidad nocturna','Desgaste estimado (%)','Existe','Estado general','Cumplimiento preliminar','Acción requerida','Prioridad','Foto ID','Observaciones'],
  critical: ['ID','Progresiva','Coord. N','Coord. E','Tipo de punto','Usuarios expuestos','Hallazgo / peligro','Causa probable','Exposición (1-3)','Severidad (1-3)','Probabilidad (1-3)','Puntaje','Nivel de riesgo','Evidencia / referencia','Foto ID','Recomendación preliminar','Prioridad'],
  singular: ['ID','Progresiva','Coord. N','Coord. E','Tipo','Descripción','Sentido / lado','Condición','Riesgo asociado','Usuarios afectados','Foto ID','Acción preliminar','Prioridad','Observaciones'],
};

function load(src, name) {
  if (window[name]) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => window[name] ? resolve() : reject(new Error(`No se cargó ${name}`));
    script.onerror = () => reject(new Error(`No se pudo descargar ${name}`));
    document.head.appendChild(script);
  });
}

async function libs(withZip = false) {
  await load(XL, 'ExcelJS');
  if (withZip) await load(ZIP, 'JSZip');
}

const txt = value => value == null ? '' : String(value);
const num = value => Number.isFinite(Number(value)) ? Number(value) : '';
const norm = value => txt(value).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const isType = (record, type) => norm(record.type) === norm(type);
const hasPhotoReference = record => Boolean(record.photoDataUrl || record.imagePath || record.imageUrl);

function gpsAccuracy(record) {
  const value = Number(record.gpsAccuracy ?? record.accuracy);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function gpsQuality(value) {
  if (!value) return 'Sin dato';
  if (value <= 5) return 'Excelente';
  if (value <= 10) return 'Buena';
  if (value <= 20) return 'Aceptable';
  return 'Baja';
}

function locationMethod(record) {
  return record.locationMethod === 'manual' ? 'Ajuste manual' : 'GPS automático';
}

function photoId(record) {
  const clean = txt(record.id || 'SIN-ID').replace(/[^A-Za-z0-9_-]/g, '').replace(/^GC-?/i, '') || 'SIN-ID';
  return `FOTO-${clean}`;
}

function metadataNote(record) {
  return [
    record.id ? `GeoCampo ID: ${record.id}` : '',
    record.userName || record.userEmail ? `Registrado por: ${record.userName || record.userEmail}` : '',
    record.locationMethod ? `Ubicación: ${locationMethod(record)}` : '',
    gpsAccuracy(record) ? `Precisión GPS: ±${gpsAccuracy(record).toFixed(1)} m` : '',
  ].filter(Boolean).join(' · ');
}

function photoBaseName(record) {
  return txt(record.id || 'registro').replace(/[^A-Za-z0-9_-]/g, '_');
}

function mimeExtension(mime = '') {
  const value = mime.toLowerCase();
  if (value.includes('png')) return 'png';
  if (value.includes('webp')) return 'webp';
  if (value.includes('gif')) return 'gif';
  return 'jpg';
}

function dataUrlToBytes(dataUrl) {
  const [meta, encoded] = txt(dataUrl).split(',');
  if (!meta || !encoded) throw new Error('Fotografía local inválida');
  const mime = meta.match(/data:(.*?);base64/i)?.[1] || 'image/jpeg';
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { bytes, mime };
}

async function resolvePhotoUrl(record) {
  if (record.imagePath) {
    try {
      return await getDownloadURL(ref(storage, record.imagePath));
    } catch (error) {
      console.warn('GeoCampo: no se pudo resolver imagePath', record.id, error);
    }
  }
  return record.imageUrl || '';
}

async function fetchPhotoBytes(record) {
  if (record.photoDataUrl) {
    const local = dataUrlToBytes(record.photoDataUrl);
    if (!local.bytes.byteLength) throw new Error('Fotografía local vacía');
    return { ...local, sourceUrl: '' };
  }

  const url = await resolvePhotoUrl(record);
  if (!url) throw new Error('Sin referencia de fotografía');

  const response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  if (!contentType.toLowerCase().startsWith('image/')) throw new Error(`Respuesta no fotográfica: ${contentType}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 128) throw new Error('Archivo fotográfico vacío o incompleto');
  return { bytes, mime: contentType, sourceUrl: url };
}

async function blobToThumbnailBase64(bytes, mime) {
  const blob = new Blob([bytes], { type: mime || 'image/jpeg' });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo decodificar la fotografía'));
      img.src = objectUrl;
    });

    const maxWidth = 520;
    const maxHeight = 360;
    const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.76);
    return { base64: dataUrl, width, height };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function preparePhotos(records, onProgress = () => {}) {
  const assets = new Map();
  const failed = [];
  const candidates = records.filter(hasPhotoReference);

  for (let i = 0; i < candidates.length; i += 1) {
    const record = candidates[i];
    onProgress({ stage: 'photos', current: i + 1, total: candidates.length });
    try {
      const source = await fetchPhotoBytes(record);
      const thumb = await blobToThumbnailBase64(source.bytes, source.mime);
      assets.set(record.id, {
        recordId: record.id,
        bytes: source.bytes,
        mime: source.mime,
        extension: mimeExtension(source.mime),
        sourceUrl: source.sourceUrl || record.imageUrl || '',
        thumbnailBase64: thumb.base64,
        thumbnailWidth: thumb.width,
        thumbnailHeight: thumb.height,
      });
    } catch (error) {
      failed.push({
        id: record.id || 'SIN-ID',
        error: error?.message || 'Error desconocido',
        imagePath: record.imagePath || '',
        imageUrl: record.imageUrl || '',
      });
    }
  }

  return { assets, failed, expected: candidates.length };
}

function themedRows(records) {
  return {
    inspection: records.filter(r => isType(r, 'Condición de vía')).map(r => [
      r.id || '', r.section || '', num(r.latitude), num(r.longitude), '', '', '', '', '', r.status || '', '', '', '', '', '', '', '', '', '', photoId(r), r.date || '', [r.observation || '', metadataNote(r)].filter(Boolean).join(' | ')
    ]),
    vertical: records.filter(r => isType(r, 'Señal vertical')).map(r => [
      r.id || '', r.section || '', num(r.latitude), num(r.longitude), r.direction || '', '', '', '', r.observation || '', 'Sí', r.status || '', '', '', '', '', '', '', '', '', photoId(r), metadataNote(r)
    ]),
    horizontal: records.filter(r => isType(r, 'Señal horizontal')).map(r => [
      r.id || '', r.section || '', '', r.direction || '', '', '', '', '', '', '', '', '', 'Sí', r.status || '', '', '', '', photoId(r), [r.observation || '', metadataNote(r)].filter(Boolean).join(' | ')
    ]),
    critical: records.filter(r => norm(r.status) === 'critico').map(r => [
      r.id || '', r.section || '', num(r.latitude), num(r.longitude), r.type || '', '', r.observation || '', '', '', '', '', '', '', `GeoCampo ${r.id || ''}`, photoId(r), '', ''
    ]),
    singular: records.filter(r => ['dispositivo de seguridad','interseccion','acceso','obra de drenaje','otro'].includes(norm(r.type))).map(r => [
      r.id || '', r.section || '', num(r.latitude), num(r.longitude), r.type || '', r.observation || '', r.direction || '', r.status || '', '', '', photoId(r), '', '', metadataNote(r)
    ]),
  };
}

function styleTitle(ws, title, lastColumn, subtitle = '') {
  ws.mergeCells(1, 1, 1, lastColumn);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { name: 'Arial', size: 15, bold: true, color: { argb: COLORS.white } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navy } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getRow(1).height = 30;

  if (subtitle) {
    ws.mergeCells(2, 1, 2, lastColumn);
    const sub = ws.getCell(2, 1);
    sub.value = subtitle;
    sub.font = { name: 'Arial', size: 9.5, italic: true, color: { argb: COLORS.muted } };
    sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.light } };
    sub.alignment = { vertical: 'middle', wrapText: true };
    ws.getRow(2).height = 29;
  }
}

function headerStyle(cell) {
  cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: COLORS.white } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.blue2 } };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.border = {
    top: { style: 'thin', color: { argb: COLORS.blue2 } },
    bottom: { style: 'thin', color: { argb: COLORS.blue2 } },
    left: { style: 'thin', color: { argb: COLORS.white } },
    right: { style: 'thin', color: { argb: COLORS.white } },
  };
}

function bodyStyle(cell, rowIndex) {
  cell.font = { name: 'Arial', size: 9.5, color: { argb: COLORS.text } };
  cell.alignment = { vertical: 'top', wrapText: true };
  cell.fill = {
    type: 'pattern', pattern: 'solid',
    fgColor: { argb: rowIndex % 2 === 0 ? COLORS.white : COLORS.light }
  };
  cell.border = { bottom: { style: 'hair', color: { argb: COLORS.border } } };
}

function applyStatusColor(cell) {
  const value = norm(cell.value);
  if (!value) return;
  if (['bueno','excelente','cumple','bajo'].includes(value)) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.good } };
    cell.font = { ...cell.font, bold: true, color: { argb: COLORS.goodText } };
  } else if (['regular','aceptable','medio','en obra'].includes(value)) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.regular } };
    cell.font = { ...cell.font, bold: true, color: { argb: COLORS.regularText } };
  } else if (['malo','critico','crítico','alto','no cumple'].includes(value)) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.bad } };
    cell.font = { ...cell.font, bold: true, color: { argb: COLORS.badText } };
  }
}

function setColumnWidths(ws, headers, overrides = {}) {
  headers.forEach((header, index) => {
    const defaultWidth = Math.min(34, Math.max(11, header.length + 2));
    ws.getColumn(index + 1).width = overrides[index + 1] || defaultWidth;
  });
}

function buildTableSheet(wb, name, title, headers, data, note = '', options = {}) {
  const headerRow = note ? 3 : 2;
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: headerRow }] });
  styleTitle(ws, title, headers.length, note);
  ws.addRow(headers);
  data.forEach(row => ws.addRow(row));
  ws.getRow(headerRow).height = 34;
  ws.getRow(headerRow).eachCell(headerStyle);
  setColumnWidths(ws, headers, options.widths || {});

  for (let rowIndex = headerRow + 1; rowIndex <= ws.rowCount; rowIndex += 1) {
    const row = ws.getRow(rowIndex);
    row.eachCell({ includeEmpty: true }, cell => bodyStyle(cell, rowIndex));
    for (const column of options.statusColumns || []) applyStatusColor(ws.getCell(rowIndex, column));
  }

  if (ws.rowCount > headerRow) {
    ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: ws.rowCount, column: headers.length } };
  }
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  return { ws, headerRow };
}

function addImageToSheet(wb, ws, asset, rowNumber, columnNumber, width = 112, height = 78) {
  if (!asset?.thumbnailBase64) return null;
  if (!asset.imageId) {
    asset.imageId = wb.addImage({ base64: asset.thumbnailBase64, extension: 'jpeg' });
  }
  ws.addImage(asset.imageId, {
    tl: { col: columnNumber - 1 + 0.08, row: rowNumber - 1 + 0.08 },
    ext: { width, height },
    editAs: 'oneCell',
  });
  return asset.imageId;
}

function addSummarySheet(wb, records, themed, photoStats) {
  const ws = wb.addWorksheet('00_Resumen_Exportacion', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [{ width: 28 }, { width: 18 }, { width: 28 }, { width: 18 }, { width: 21 }, { width: 21 }];
  ws.mergeCells('A1:F1');
  ws.getCell('A1').value = 'GeoCampo — Paquete técnico para Libro Maestro de Tesis';
  ws.getCell('A1').font = { name: 'Arial', size: 17, bold: true, color: { argb: COLORS.white } };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navy } };
  ws.getCell('A1').alignment = { vertical: 'middle' };
  ws.getRow(1).height = 34;

  ws.mergeCells('A3:F4');
  ws.getCell('A3').value = 'Exportación visual preparada para revisión de tesis. Las fotografías recuperadas se incrustan como miniaturas dentro del Excel y, en el paquete ZIP, se conservan además como archivos originales. Los campos no capturados por GeoCampo permanecen vacíos; no se inventan resultados técnicos.';
  ws.getCell('A3').alignment = { wrapText: true, vertical: 'middle' };
  ws.getCell('A3').font = { name: 'Arial', size: 10, color: { argb: COLORS.text } };
  ws.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.paleTeal } };

  const accuracies = records.map(gpsAccuracy).filter(Boolean);
  const avg = accuracies.length ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length : null;
  const metrics = [
    ['Total de registros', records.length, 'Fotografías incrustadas', photoStats.loaded, 'Fotos esperadas', photoStats.expected],
    ['Precisión GPS promedio', avg ? `±${avg.toFixed(1)} m` : 'Sin dato', 'Fotos no recuperadas', photoStats.failed, 'Sincronizados', records.filter(r => r.syncStatus === 'synced').length],
    ['Condición de vía', themed.inspection.length, 'Señales verticales', themed.vertical.length, 'Señales horizontales', themed.horizontal.length],
    ['Puntos críticos candidatos', themed.critical.length, 'Puntos singulares', themed.singular.length, 'Usuarios / evidencias', records.length],
  ];

  let startRow = 6;
  metrics.forEach((rowValues, offset) => {
    const row = ws.getRow(startRow + offset);
    row.values = rowValues;
    for (let c = 1; c <= 6; c += 2) {
      const label = row.getCell(c);
      const value = row.getCell(c + 1);
      label.font = { name: 'Arial', size: 9, bold: true, color: { argb: COLORS.muted } };
      label.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.light } };
      value.font = { name: 'Arial', size: 13, bold: true, color: { argb: COLORS.blue } };
      value.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.white } };
      label.alignment = value.alignment = { vertical: 'middle', wrapText: true };
      label.border = value.border = { bottom: { style: 'thin', color: { argb: COLORS.border } } };
    }
    row.height = 30;
  });

  ws.mergeCells('A12:F12');
  ws.getCell('A12').value = 'HOJAS GENERADAS';
  ws.getCell('A12').font = { name: 'Arial', size: 10, bold: true, color: { argb: COLORS.white } };
  ws.getCell('A12').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.blue2 } };
  const sheets = [
    ['01_Registros_Campo', 'Base consolidada con miniatura y trazabilidad'],
    ['02_Inspeccion_100m', 'Registros de condición de vía preparados para el instrumento'],
    ['03_Senales_Vert', 'Señales verticales'],
    ['04_Senales_Horiz', 'Señalización horizontal'],
    ['05_Puntos_Criticos', 'Candidatos marcados como críticos'],
    ['06_Registro_Fotos', 'Galería fotográfica incrustada y georreferenciada'],
    ['15_Puntos_Singulares', 'Accesos, intersecciones y otros puntos singulares'],
  ];
  sheets.forEach((item, index) => {
    const row = 13 + index;
    ws.getCell(row, 1).value = item[0];
    ws.getCell(row, 2).value = item[1];
    ws.mergeCells(row, 2, row, 6);
    ws.getCell(row, 1).font = { name: 'Arial', size: 9.5, bold: true, color: { argb: COLORS.blue } };
    ws.getCell(row, 2).font = { name: 'Arial', size: 9.5, color: { argb: COLORS.text } };
    ws.getCell(row, 1).border = ws.getCell(row, 2).border = { bottom: { style: 'hair', color: { argb: COLORS.border } } };
  });
}

function buildWorkbook(records, photoResult) {
  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'GeoCampo';
  wb.company = 'Tesis de Ingeniería Civil — El Carrizal';
  wb.title = 'GeoCampo — Libro Maestro con evidencia fotográfica';
  wb.subject = 'Registros de campo georreferenciados para estudio de seguridad vial';
  wb.created = new Date();

  const themed = themedRows(records);
  const photoStats = { expected: photoResult.expected, loaded: photoResult.assets.size, failed: photoResult.failed.length };
  addSummarySheet(wb, records, themed, photoStats);

  const generalHeaders = [
    'Vista previa','ID','Fecha','Hora','Fecha_hora_ISO','Usuario_UID','Usuario_Nombre','Usuario_Email',
    'Latitud_Final','Longitud_Final','Metodo_Ubicacion','GPS_Latitud_Original','GPS_Longitud_Original',
    'Precision_GPS_m','Calidad_GPS','Ajuste_Manual_m','Capa_Mapa','Tipo','Estado','Tramo_Progresiva','Sentido',
    'Observacion','Estado_Sincronizacion','URL_Fotografia','Foto_ID'
  ];
  const generalRows = records.map(r => {
    const accuracy = gpsAccuracy(r);
    const asset = photoResult.assets.get(r.id);
    return [
      asset ? 'FOTO' : 'Sin foto', r.id || '', r.date || '', r.time || '', r.createdAt || r.createdAtServer || '',
      r.userId || '', r.userName || '', r.userEmail || '', num(r.latitude), num(r.longitude), locationMethod(r),
      num(r.gpsLatitude), num(r.gpsLongitude), accuracy ?? '', gpsQuality(accuracy), num(r.manualOffsetMeters),
      r.mapLayer === 'street' ? 'Calles' : 'Satélite', r.type || '', r.status || '', r.section || '', r.direction || '',
      r.observation || '', r.syncStatus || '', asset?.sourceUrl || r.imageUrl || '', photoId(r)
    ];
  });
  const general = buildTableSheet(
    wb, '01_Registros_Campo', 'BASE CONSOLIDADA DE REGISTROS GEORREFERENCIADOS — GEOCAMPO', generalHeaders, generalRows,
    'La primera columna muestra una miniatura real cuando la fotografía pudo recuperarse. La URL se conserva como respaldo de trazabilidad.',
    { widths: { 1: 18, 2: 20, 18: 22, 19: 14, 20: 18, 21: 20, 22: 38, 24: 42 }, statusColumns: [15, 19, 23] }
  );
  for (let i = 0; i < records.length; i += 1) {
    const rowNumber = general.headerRow + 1 + i;
    const asset = photoResult.assets.get(records[i].id);
    general.ws.getRow(rowNumber).height = asset ? 66 : 24;
    general.ws.getCell(rowNumber, 1).alignment = { horizontal: 'center', vertical: 'middle' };
    if (asset) {
      general.ws.getCell(rowNumber, 1).value = '';
      addImageToSheet(wb, general.ws, asset, rowNumber, 1, 88, 58);
    }
    const urlCell = general.ws.getCell(rowNumber, 24);
    if (urlCell.value) {
      urlCell.value = { text: 'Abrir foto original', hyperlink: txt(urlCell.value), tooltip: 'Abrir fotografía original en Firebase Storage' };
      urlCell.font = { name: 'Arial', size: 9, color: { argb: 'FF0563C1' }, underline: true };
    }
  }

  buildTableSheet(wb, '02_Inspeccion_100m', 'FICHA DE INSPECCIÓN DEL TRAMO CADA 100 m', H.inspection, themed.inspection,
    'GeoCampo transfiere únicamente datos realmente capturados. Las variables técnicas restantes deben completarse con el instrumento específico.',
    { statusColumns: [10, 19], widths: { 22: 40 } });
  buildTableSheet(wb, '03_Senales_Vert', 'INVENTARIO Y EVALUACIÓN DE SEÑALIZACIÓN VERTICAL', H.vertical, themed.vertical,
    'Se transfieren ubicación, sentido, estado, evidencia y observación. Código, visibilidad, montaje, cumplimiento y prioridad requieren evaluación técnica.',
    { statusColumns: [11, 17, 19], widths: { 9: 34, 21: 38 } });
  buildTableSheet(wb, '04_Senales_Horiz', 'INVENTARIO Y EVALUACIÓN DE SEÑALIZACIÓN HORIZONTAL', H.horizontal, themed.horizontal,
    'Se transfieren progresiva, sentido, estado y fotografía. Dimensiones, desgaste, visibilidad y cumplimiento requieren verificación específica.',
    { statusColumns: [14, 15, 17], widths: { 19: 38 } });
  buildTableSheet(wb, '05_Puntos_Criticos', 'MATRIZ DE PUNTOS CRÍTICOS Y RIESGOS VIALES', H.critical, themed.critical,
    'Solo se preparan candidatos cuyo estado fue marcado Crítico. Exposición, severidad, probabilidad y nivel de riesgo quedan vacíos hasta aplicar la metodología aprobada.',
    { statusColumns: [13, 17], widths: { 7: 34, 8: 28, 14: 28, 16: 34 } });

  const photoHeaders = ['Fotografía','Foto ID','Archivo original','Fecha','Hora','Progresiva','Coord. N','Coord. E','Sentido / orientación','Componente','Descripción de evidencia','ID relacionado','Usuario','Precisión GPS','URL original','Observaciones'];
  const photoRows = records.map(r => {
    const asset = photoResult.assets.get(r.id);
    const accuracy = gpsAccuracy(r);
    return [
      asset ? '' : 'SIN FOTO', photoId(r), asset ? `${photoBaseName(r)}.${asset.extension}` : '', r.date || '', r.time || '', r.section || '',
      num(r.latitude), num(r.longitude), r.direction || '', r.type || '', r.observation || '', r.id || '', r.userName || r.userEmail || '',
      accuracy ? `±${accuracy.toFixed(1)} m` : '', asset?.sourceUrl || r.imageUrl || '', metadataNote(r)
    ];
  });
  const photos = buildTableSheet(wb, '06_Registro_Fotos', 'REGISTRO FOTOGRÁFICO GEOREFERENCIADO — GALERÍA DE EVIDENCIAS', photoHeaders, photoRows,
    'Las fotografías mostradas son miniaturas incrustadas dentro del archivo Excel. El paquete ZIP conserva además las imágenes originales en la carpeta fotos_originales/.',
    { widths: { 1: 24, 2: 20, 3: 24, 6: 18, 9: 20, 10: 22, 11: 42, 13: 24, 15: 24, 16: 42 } }
  );
  for (let i = 0; i < records.length; i += 1) {
    const rowNumber = photos.headerRow + 1 + i;
    const asset = photoResult.assets.get(records[i].id);
    photos.ws.getRow(rowNumber).height = asset ? 94 : 28;
    photos.ws.getCell(rowNumber, 1).alignment = { horizontal: 'center', vertical: 'middle' };
    if (asset) addImageToSheet(wb, photos.ws, asset, rowNumber, 1, 132, 86);
    const urlCell = photos.ws.getCell(rowNumber, 15);
    if (urlCell.value) {
      urlCell.value = { text: 'Abrir original', hyperlink: txt(urlCell.value), tooltip: 'Abrir fotografía original' };
      urlCell.font = { name: 'Arial', size: 9, color: { argb: 'FF0563C1' }, underline: true };
    }
  }

  buildTableSheet(wb, '15_Puntos_Singulares', 'INVENTARIO DE PUNTOS SINGULARES DEL TRAMO', H.singular, themed.singular,
    'Incluye accesos, intersecciones, obras de drenaje, dispositivos de seguridad y registros clasificados como Otro. Riesgo, acción y prioridad requieren análisis posterior.',
    { statusColumns: [8, 13], widths: { 6: 36, 14: 38 } });

  return wb;
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function csvCell(value) {
  return `"${txt(value).replace(/"/g, '""')}"`;
}

function photoManifest(records, photoResult) {
  const headers = ['ID_Registro','Foto_ID','Archivo','Fecha','Hora','Progresiva','Latitud','Longitud','Tipo','Estado','Sentido','Usuario','Precision_GPS_m','URL_Original','Estado_Recuperacion'];
  const rows = records.map(record => {
    const asset = photoResult.assets.get(record.id);
    return [
      record.id || '', photoId(record), asset ? `${photoBaseName(record)}.${asset.extension}` : '', record.date || '', record.time || '', record.section || '',
      record.latitude ?? '', record.longitude ?? '', record.type || '', record.status || '', record.direction || '', record.userName || record.userEmail || '',
      gpsAccuracy(record) ?? '', asset?.sourceUrl || record.imageUrl || '', asset ? 'Incluida' : (hasPhotoReference(record) ? 'No recuperada' : 'Sin fotografía')
    ];
  });
  return '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
}

export async function exportThesisWorkbook(records, { onProgress = () => {} } = {}) {
  if (!records?.length) throw new Error('NO_RECORDS');
  onProgress({ stage: 'libraries' });
  await libs();
  const photoResult = await preparePhotos(records, onProgress);
  onProgress({ stage: 'workbook' });
  const wb = buildWorkbook(records, photoResult);
  const buffer = await wb.xlsx.writeBuffer();
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `GeoCampo_Tesis_Visual_${date}.xlsx`);
  return {
    records: records.length,
    photos: photoResult.assets.size,
    expectedPhotos: photoResult.expected,
    missingPhotos: photoResult.failed.length,
  };
}

export async function exportThesisPackage(records, { onProgress = () => {} } = {}) {
  if (!records?.length) throw new Error('NO_RECORDS');
  onProgress({ stage: 'libraries' });
  await libs(true);

  const photoResult = await preparePhotos(records, onProgress);
  onProgress({ stage: 'workbook' });
  const wb = buildWorkbook(records, photoResult);
  const workbookBuffer = await wb.xlsx.writeBuffer();

  const zip = new window.JSZip();
  const folder = zip.folder('fotos_originales');
  let verifiedPhotos = 0;

  for (const record of records) {
    const asset = photoResult.assets.get(record.id);
    if (!asset?.bytes?.byteLength) continue;
    const fileName = `${photoBaseName(record)}.${asset.extension}`;
    folder.file(fileName, asset.bytes, { binary: true });
    verifiedPhotos += 1;
  }

  const date = new Date().toISOString().slice(0, 10);
  zip.file(`GeoCampo_Tesis_Visual_${date}.xlsx`, workbookBuffer);
  zip.file('manifest_fotografico.csv', photoManifest(records, photoResult));
  zip.file('README_Exportacion.txt', [
    'GEOCAMPO — PAQUETE TÉCNICO DE TESIS',
    '',
    `Registros: ${records.length}`,
    `Fotografías esperadas: ${photoResult.expected}`,
    `Fotografías verificadas e incluidas: ${verifiedPhotos}`,
    `Fotografías no recuperadas: ${photoResult.failed.length}`,
    '',
    'Contenido:',
    `- GeoCampo_Tesis_Visual_${date}.xlsx: Excel con miniaturas incrustadas y hojas para Libro Maestro.`,
    '- fotos_originales/: archivos fotográficos originales realmente recuperados.',
    '- manifest_fotografico.csv: relación entre registro, foto, progresiva, coordenadas y nombre de archivo.',
    '- fotos_no_recuperadas.txt: se genera únicamente cuando alguna fotografía no pudo descargarse.',
    '',
    'Criterio de control: una fotografía solo se contabiliza como incluida cuando sus bytes fueron descargados y agregados al ZIP.',
  ].join('\n'));

  if (photoResult.failed.length) {
    zip.file('fotos_no_recuperadas.txt', photoResult.failed.map(item => [item.id, item.error, item.imagePath, item.imageUrl].join('\t')).join('\n'));
  }

  onProgress({ stage: 'zip' });
  const blob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 }, streamFiles: true },
    metadata => onProgress({ stage: 'zip-progress', percent: metadata.percent })
  );
  downloadBlob(blob, `GeoCampo_Paquete_Tesis_TOP_${date}.zip`);

  return {
    records: records.length,
    photos: verifiedPhotos,
    expectedPhotos: photoResult.expected,
    missingPhotos: photoResult.failed.length,
  };
}
