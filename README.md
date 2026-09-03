# GeoCampo — Recolección de Datos

Herramienta web responsive para levantamiento georreferenciado de evidencias de campo en una tesis de Ingeniería Civil.

## v0.1

La primera versión permite probar el flujo completo de campo sin depender todavía de servicios externos:

- Captura de fotografía con cámara del dispositivo.
- Compresión previa de imagen en el navegador.
- Obtención de latitud, longitud y precisión GPS usando geolocalización de alta precisión.
- Clasificación de calidad GPS.
- Fecha y hora automáticas.
- Tipo de elemento, estado, tramo/sector, sentido y observaciones.
- Registros temporales persistentes mediante `localStorage`.
- Panel administrativo responsive.
- Búsqueda y filtrado de registros.
- Vista detallada de cada evidencia.
- Exportación CSV UTF-8 compatible con Microsoft Excel.
- Diseño responsive orientado a uso desde teléfonos.

> `localStorage` es solamente el adaptador temporal de la v0.1. Las fotografías y registros se migrarán a Firebase Storage + Firestore en la siguiente fase.

## Estructura

```text
recolecciondatos/
├── index.html
├── admin.html
├── css/
│   ├── styles.css
│   └── admin.css
├── js/
│   ├── app.js
│   ├── admin.js
│   ├── firebase.js
│   └── firebase-config.example.js
├── firestore.rules
├── storage.rules
├── firebase.json
├── vercel.json
├── .gitignore
└── README.md
```

## Desarrollo local

La geolocalización y la cámara requieren un contexto seguro. Utiliza `localhost` durante desarrollo o HTTPS en producción.

Puedes servir el proyecto con cualquier servidor estático. Por ejemplo:

```bash
npx serve .
```

## Firebase — siguiente fase

1. Crear un proyecto en Firebase Console.
2. Registrar una Web App.
3. Activar **Authentication**.
4. Activar **Cloud Firestore**.
5. Activar **Firebase Storage**.
6. Copiar `js/firebase-config.example.js` como `js/firebase-config.js`.
7. Reemplazar los valores `REEMPLAZAR` con la configuración del proyecto.
8. Implementar el adaptador Firestore/Storage en `app.js` y `admin.js`.
9. Publicar `firestore.rules` y `storage.rules` después de validar roles y estructura definitiva.

### Modelo previsto de Firestore

```text
users/{uid}
  name
  email
  role: admin | field

records/{recordId}
  userId
  imageUrl
  latitude
  longitude
  accuracy
  altitude
  heading
  speed
  capturedAt
  type
  status
  section
  direction
  observation
  createdAt
```

### Storage previsto

```text
field-records/{userId}/{YYYY-MM-DD}/{recordId}.jpg
```

## Vercel

El repositorio incluye `vercel.json` y puede desplegarse como sitio estático sin proceso de compilación. HTTPS permitirá usar cámara y geolocalización en dispositivos móviles compatibles.

## Hoja de ruta

### v0.2 — Backend real
- Firebase Authentication.
- Firestore.
- Firebase Storage.
- Roles `admin` y `field`.
- Sincronización real multiusuario.

### v0.3 — Operación de campo
- Estado offline/PWA.
- Cola de sincronización para zonas sin cobertura.
- Mayor control sobre precisión GPS antes de guardar.
- Coordenadas y metadatos impresos opcionalmente sobre una copia de la fotografía.

### v0.4 — Análisis
- Exportación XLSX nativa.
- Mapas de puntos levantados.
- Filtros por tramo, fecha, usuario, tipo y condición.
- Estadísticas por categoría y estado.

## Seguridad

Nunca subir cuentas de servicio, claves privadas ni archivos `.env` al repositorio. La configuración pública de una Web App de Firebase no sustituye las reglas de seguridad: el control real de acceso debe mantenerse en Authentication, Firestore Rules y Storage Rules.
