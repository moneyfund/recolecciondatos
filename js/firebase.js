// Integración Firebase preparada para la siguiente etapa.
// La aplicación funciona actualmente con localStorage para permitir probar UI,
// cámara, GPS y exportación antes de configurar credenciales.
//
// Próximo paso:
// 1. Crear proyecto Firebase.
// 2. Activar Authentication, Firestore y Storage.
// 3. Copiar firebase-config.example.js como firebase-config.js.
// 4. Completar los valores del proyecto.
// 5. Sustituir el adaptador local por las funciones de este módulo.

import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';

const BRAND_VERSION = '20260905-1';
const BRAND_LOGO = `/geocampo1.png?v=${BRAND_VERSION}`;
const BRAND_ICON = `/geocampo2.png?v=${BRAND_VERSION}`;

function installBrandAssets() {
  // Favicon principal y accesos directos del navegador.
  document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').forEach((node) => node.remove());

  const favicon = document.createElement('link');
  favicon.rel = 'icon';
  favicon.type = 'image/png';
  favicon.href = BRAND_ICON;
  document.head.appendChild(favicon);

  const shortcut = document.createElement('link');
  shortcut.rel = 'shortcut icon';
  shortcut.type = 'image/png';
  shortcut.href = BRAND_ICON;
  document.head.appendChild(shortcut);

  const appleTouch = document.createElement('link');
  appleTouch.rel = 'apple-touch-icon';
  appleTouch.href = BRAND_ICON;
  document.head.appendChild(appleTouch);

  // Logo principal en la barra superior y en el panel administrativo.
  document.querySelectorAll('.brand').forEach((brand) => {
    if (brand.querySelector('.geocampo-brand-logo')) return;

    const logo = document.createElement('img');
    logo.className = 'geocampo-brand-logo';
    logo.src = BRAND_LOGO;
    logo.alt = 'GeoCampo';
    logo.decoding = 'async';
    logo.loading = 'eager';
    logo.style.display = 'block';
    logo.style.objectFit = 'contain';
    logo.style.maxWidth = '100%';
    logo.style.filter = 'drop-shadow(0 5px 10px rgba(7,26,51,.12))';

    if (brand.classList.contains('sidebar-brand')) {
      logo.style.width = '128px';
      logo.style.height = '88px';
    } else {
      logo.style.width = '108px';
      logo.style.height = '72px';
    }

    brand.replaceChildren(logo);
    brand.style.gap = '0';
    brand.style.minWidth = '0';
  });

  // El mismo símbolo se usa en el cuadro de autenticación para mantener identidad visual.
  const modalMark = document.querySelector('.auth-modal-mark');
  if (modalMark && !modalMark.querySelector('.geocampo-auth-icon')) {
    const icon = document.createElement('img');
    icon.className = 'geocampo-auth-icon';
    icon.src = BRAND_ICON;
    icon.alt = '';
    icon.setAttribute('aria-hidden', 'true');
    icon.style.width = '42px';
    icon.style.height = '42px';
    icon.style.objectFit = 'contain';
    modalMark.replaceChildren(icon);
  }
}

installBrandAssets();

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
