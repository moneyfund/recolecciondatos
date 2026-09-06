(() => {
  const nativeFetch = window.fetch.bind(window);
  const FIREBASE_HOST = 'firebasestorage.googleapis.com';
  const BUCKET_SEGMENT = '/v0/b/recolecciondedatos-388d6.firebasestorage.app/o/';

  function isGeoCampoFirebasePhoto(input) {
    try {
      const raw = typeof input === 'string' ? input : input?.url;
      if (!raw) return false;
      const url = new URL(raw, window.location.href);
      return url.protocol === 'https:'
        && url.hostname === FIREBASE_HOST
        && url.pathname.startsWith(BUCKET_SEGMENT);
    } catch {
      return false;
    }
  }

  async function proxyPhoto(input) {
    const raw = typeof input === 'string' ? input : input?.url;
    return nativeFetch('/api/photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: raw }),
      cache: 'no-store',
      credentials: 'same-origin',
    });
  }

  window.fetch = async function geocampoFetch(input, init) {
    if (!isGeoCampoFirebasePhoto(input)) {
      return nativeFetch(input, init);
    }

    // Las URL de descarga de Firebase se pueden mostrar en <img>, pero el navegador
    // puede bloquear su descarga binaria mediante fetch por CORS. Para la exportación
    // de tesis usamos un proxy same-origin de Vercel y obtenemos bytes reales.
    try {
      const direct = await nativeFetch(input, init);
      if (direct.ok) return direct;
    } catch (error) {
      console.info('GeoCampo: descarga directa bloqueada; usando proxy de fotografías.', error?.message || error);
    }

    const proxied = await proxyPhoto(input);
    if (!proxied.ok) {
      let detail = '';
      try {
        const payload = await proxied.clone().json();
        detail = payload?.error ? ` (${payload.error})` : '';
      } catch {}
      throw new Error(`No se pudo recuperar la fotografía mediante proxy: HTTP ${proxied.status}${detail}`);
    }
    return proxied;
  };
})();
