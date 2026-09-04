const STORAGE_KEY = 'geocampo_records_v01';

const authState = {
  user: null,
  auth: null,
  sdk: null,
  firebaseReady: false,
  firebaseError: null,
  initialized: false,
};

function loadStyles() {
  if (document.querySelector('link[data-geocampo-auth]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './css/auth.css';
  link.dataset.geocampoAuth = 'true';
  document.head.appendChild(link);
}

function initials(name = '', email = '') {
  const source = name.trim() || email.split('@')[0] || 'U';
  return source.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'U';
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[char]));
}

function createModal() {
  if (document.getElementById('authModalBackdrop')) return;
  const wrapper = document.createElement('div');
  wrapper.id = 'authModalBackdrop';
  wrapper.className = 'auth-modal-backdrop';
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.innerHTML = `
    <section class="auth-modal" role="dialog" aria-modal="true" aria-labelledby="authModalTitle">
      <div class="auth-modal-head">
        <button type="button" class="auth-modal-close" id="authModalClose" aria-label="Cerrar">×</button>
        <div class="auth-modal-mark"><svg viewBox="0 0 24 24"><path d="M12 21s7-5.2 7-12a7 7 0 1 0-14 0c0 6.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg></div>
        <h2 id="authModalTitle">Identifica tu registro</h2>
        <p>Inicia sesión antes de trabajar en campo. Cada evidencia quedará asociada a la persona que la creó.</p>
      </div>
      <div class="auth-modal-body">
        <div class="auth-reason"><strong id="authReasonTitle">Inicio de sesión requerido</strong><span id="authReasonText">Necesitamos identificar quién realiza este levantamiento.</span></div>
        <button type="button" class="google-signin-btn" id="googleSigninBtn"><span class="google-g">G</span> Continuar con Google</button>
        <p class="auth-status" id="authStatus"></p>
        <p class="auth-privacy">GeoCampo utiliza tu nombre, correo, foto y UID únicamente para asociar la autoría de los registros de campo.</p>
      </div>
    </section>`;
  document.body.appendChild(wrapper);

  wrapper.addEventListener('click', (event) => {
    if (event.target === wrapper) closeModal();
  });
  document.getElementById('authModalClose')?.addEventListener('click', closeModal);
  document.getElementById('googleSigninBtn')?.addEventListener('click', signInWithGoogle);
}

function setAuthStatus(message = '', type = '') {
  const node = document.getElementById('authStatus');
  if (!node) return;
  node.textContent = message;
  node.classList.toggle('error', type === 'error');
}

function openModal(reason = 'Necesitamos identificar quién realiza este levantamiento.') {
  createModal();
  const backdrop = document.getElementById('authModalBackdrop');
  const reasonText = document.getElementById('authReasonText');
  if (reasonText) reasonText.textContent = reason;
  if (backdrop) {
    backdrop.classList.add('open');
    backdrop.setAttribute('aria-hidden', 'false');
  }

  const btn = document.getElementById('googleSigninBtn');
  if (btn) btn.disabled = false;

  if (!authState.firebaseReady) {
    if (authState.firebaseError) {
      setAuthStatus('Firebase aún no está configurado en la web. Falta pegar la configuración del proyecto.', 'error');
    } else {
      setAuthStatus('Preparando inicio de sesión…');
    }
  } else {
    setAuthStatus('');
  }
}

function closeModal() {
  const backdrop = document.getElementById('authModalBackdrop');
  if (!backdrop) return;
  backdrop.classList.remove('open');
  backdrop.setAttribute('aria-hidden', 'true');
}

function userSnapshot(user) {
  if (!user) return null;
  return {
    uid: user.uid,
    name: user.displayName || user.email?.split('@')[0] || 'Usuario',
    email: user.email || '',
    photoURL: user.photoURL || '',
  };
}

function renderUserControls() {
  document.querySelectorAll('[data-auth-control]').forEach(node => node.remove());
  const host = document.querySelector('.topbar-actions') || document.querySelector('.header-actions');
  if (!host) return;

  const user = userSnapshot(authState.user);
  if (!user) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.authControl = 'login';
    button.className = 'auth-login-btn';
    button.innerHTML = '<svg viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg><span>Ingresar</span>';
    button.addEventListener('click', () => openModal('Inicia sesión para que tus registros queden identificados.'));
    host.prepend(button);
    return;
  }

  const chip = document.createElement('div');
  chip.dataset.authControl = 'user';
  chip.className = 'auth-user-chip';
  const avatar = user.photoURL
    ? `<img class="auth-user-avatar" src="${escapeHtml(user.photoURL)}" alt="" referrerpolicy="no-referrer">`
    : `<span class="auth-user-avatar auth-user-avatar-fallback">${escapeHtml(initials(user.name, user.email))}</span>`;
  chip.innerHTML = `${avatar}<span class="auth-user-copy"><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)}</small></span><button type="button" class="auth-signout-btn" title="Cerrar sesión" aria-label="Cerrar sesión"><svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg></button>`;
  chip.querySelector('.auth-signout-btn')?.addEventListener('click', signOutUser);
  host.prepend(chip);
}

async function initializeFirebaseAuth() {
  try {
    const firebase = await import('./firebase.js');
    const sdk = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js');
    authState.auth = firebase.auth;
    authState.sdk = sdk;
    authState.firebaseReady = true;
    authState.firebaseError = null;

    sdk.onAuthStateChanged(firebase.auth, (user) => {
      authState.user = user || null;
      window.GeoCampoAuth.currentUser = userSnapshot(authState.user);
      renderUserControls();
      if (user) {
        closeModal();
        document.dispatchEvent(new CustomEvent('geocampo:authchange', { detail: userSnapshot(user) }));
      }
    });
  } catch (error) {
    authState.firebaseReady = false;
    authState.firebaseError = error;
    renderUserControls();
    console.warn('GeoCampo: Firebase Auth pendiente de configuración.', error);
  }
}

async function signInWithGoogle() {
  if (!authState.firebaseReady || !authState.auth || !authState.sdk) {
    setAuthStatus('Falta la configuración web de Firebase. Pega apiKey, authDomain, projectId y demás valores para activar Google.', 'error');
    return;
  }

  const button = document.getElementById('googleSigninBtn');
  if (button) button.disabled = true;
  setAuthStatus('Abriendo Google…');

  try {
    const provider = new authState.sdk.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await authState.sdk.signInWithPopup(authState.auth, provider);
    authState.user = result.user;
    window.GeoCampoAuth.currentUser = userSnapshot(result.user);
    renderUserControls();
    closeModal();
    document.dispatchEvent(new CustomEvent('geocampo:authchange', { detail: userSnapshot(result.user) }));
  } catch (error) {
    const message = error?.code === 'auth/popup-closed-by-user'
      ? 'Inicio de sesión cancelado.'
      : error?.code === 'auth/unauthorized-domain'
        ? 'Este dominio de Vercel no está autorizado en Firebase Authentication.'
        : 'No se pudo iniciar sesión con Google. Revisa la configuración de Authentication.';
    setAuthStatus(message, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function signOutUser() {
  if (!authState.firebaseReady || !authState.auth || !authState.sdk) return;
  try {
    await authState.sdk.signOut(authState.auth);
    authState.user = null;
    window.GeoCampoAuth.currentUser = null;
    renderUserControls();
  } catch (error) {
    console.warn('No se pudo cerrar sesión', error);
  }
}

function isAuthenticated() {
  return Boolean(authState.user);
}

function requireAuth(reason) {
  if (isAuthenticated()) return true;
  openModal(reason);
  return false;
}

function installInteractionGate() {
  const selector = [
    '#capture .camera-zone',
    '#capture input',
    '#capture select',
    '#capture textarea',
    '#capture button',
    '#fieldMap'
  ].join(',');

  const blockPointer = (event) => {
    const target = event.target.closest?.(selector);
    if (!target || isAuthenticated()) return;
    if (target.closest('#authModalBackdrop')) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openModal('Inicia sesión antes de capturar fotografías, usar el GPS, ajustar el mapa o completar la ficha.');
  };

  document.addEventListener('pointerdown', blockPointer, true);
  document.addEventListener('click', blockPointer, true);
  document.addEventListener('submit', (event) => {
    if (!event.target.matches?.('#recordForm') || isAuthenticated()) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openModal('Debes iniciar sesión antes de guardar para identificar quién creó el registro.');
  }, true);
  document.addEventListener('focusin', (event) => {
    const target = event.target.closest?.('#capture input, #capture select, #capture textarea');
    if (!target || isAuthenticated()) return;
    target.blur?.();
    openModal('Inicia sesión para comenzar a completar la ficha de campo.');
  }, true);
}

function installRecordAuthorInjection() {
  if (window.__geoCampoStoragePatched) return;
  window.__geoCampoStoragePatched = true;
  const originalSetItem = Storage.prototype.setItem;

  Storage.prototype.setItem = function(key, value) {
    if (this === window.localStorage && key === STORAGE_KEY && authState.user) {
      try {
        const nextRecords = JSON.parse(value);
        const previousRecords = JSON.parse(originalSetItem === Storage.prototype.setItem ? '[]' : (window.localStorage.getItem(key) || '[]'));
        const previousIds = new Set(Array.isArray(previousRecords) ? previousRecords.map(record => record?.id).filter(Boolean) : []);
        const user = userSnapshot(authState.user);
        if (Array.isArray(nextRecords) && user) {
          nextRecords.forEach(record => {
            if (!record?.id || previousIds.has(record.id) || record.userId) return;
            record.userId = user.uid;
            record.userName = user.name;
            record.userEmail = user.email;
            record.userPhoto = user.photoURL;
          });
          value = JSON.stringify(nextRecords);
        }
      } catch (error) {
        console.warn('GeoCampo: no se pudo añadir autoría al registro local.', error);
      }
    }
    return originalSetItem.call(this, key, value);
  };
}

function installAdminAuthorDecorator() {
  const table = document.getElementById('recordsTable');
  if (!table) return;

  const decorate = () => {
    let records = [];
    try { records = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch {}
    const byId = new Map(records.map(record => [record.id, record]));

    table.querySelectorAll('tr').forEach(row => {
      if (row.querySelector('.record-author')) return;
      const sub = row.querySelector('.record-sub');
      const id = sub?.textContent?.split('·')[0]?.trim();
      const record = byId.get(id);
      if (!record) return;
      const author = document.createElement('div');
      author.className = 'record-author';
      const label = record.userName || record.userEmail || 'Registro anterior sin autor';
      const avatar = record.userPhoto
        ? `<img src="${escapeHtml(record.userPhoto)}" alt="" referrerpolicy="no-referrer">`
        : `<span class="author-fallback">${escapeHtml(initials(record.userName, record.userEmail))}</span>`;
      author.innerHTML = `${avatar}<span>Por <strong>${escapeHtml(label)}</strong></span>`;
      sub?.parentElement?.appendChild(author);
    });
  };

  const observer = new MutationObserver(decorate);
  observer.observe(table, { childList: true, subtree: true });
  decorate();

  const detail = document.getElementById('dialogContent');
  if (detail) {
    const detailObserver = new MutationObserver(() => {
      const id = detail.querySelector('.eyebrow')?.textContent?.trim();
      if (!id || detail.querySelector('.detail-author')) return;
      let records = [];
      try { records = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch {}
      const record = records.find(item => item.id === id);
      const grid = detail.querySelector('.detail-grid');
      if (!record || !grid) return;
      const box = document.createElement('div');
      box.className = 'detail-author';
      const label = record.userName || record.userEmail || 'Registro anterior sin autor';
      const avatar = record.userPhoto
        ? `<img src="${escapeHtml(record.userPhoto)}" alt="" referrerpolicy="no-referrer">`
        : `<span class="author-fallback">${escapeHtml(initials(record.userName, record.userEmail))}</span>`;
      box.innerHTML = `${avatar}<span><span>REGISTRADO POR</span><strong>${escapeHtml(label)}</strong></span>`;
      grid.appendChild(box);
    });
    detailObserver.observe(detail, { childList: true, subtree: true });
  }
}

window.GeoCampoAuth = {
  currentUser: null,
  requireAuth,
  isAuthenticated,
  openLogin: openModal,
};

loadStyles();
createModal();
installInteractionGate();
installRecordAuthorInjection();
installAdminAuthorDecorator();
renderUserControls();
initializeFirebaseAuth();
authState.initialized = true;
