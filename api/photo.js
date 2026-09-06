const ALLOWED_HOST = 'firebasestorage.googleapis.com';
const ALLOWED_BUCKET = 'recolecciondedatos-388d6.firebasestorage.app';
const MAX_BYTES = 20 * 1024 * 1024;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const rawUrl = String(body.url || '').trim();
    if (!rawUrl) return res.status(400).json({ error: 'MISSING_URL' });

    let target;
    try {
      target = new URL(rawUrl);
    } catch {
      return res.status(400).json({ error: 'INVALID_URL' });
    }

    if (target.protocol !== 'https:' || target.hostname !== ALLOWED_HOST) {
      return res.status(400).json({ error: 'UNSUPPORTED_HOST' });
    }

    const expectedBucketSegment = `/v0/b/${ALLOWED_BUCKET}/o/`;
    if (!target.pathname.startsWith(expectedBucketSegment)) {
      return res.status(400).json({ error: 'UNSUPPORTED_BUCKET' });
    }

    const upstream = await fetch(target.toString(), {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'GeoCampo-Thesis-Exporter/1.0' },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: 'UPSTREAM_ERROR', status: upstream.status });
    }

    const contentType = upstream.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return res.status(415).json({ error: 'NOT_AN_IMAGE', contentType });
    }

    const declaredLength = Number(upstream.headers.get('content-length') || 0);
    if (declaredLength > MAX_BYTES) {
      return res.status(413).json({ error: 'IMAGE_TOO_LARGE' });
    }

    const arrayBuffer = await upstream.arrayBuffer();
    if (!arrayBuffer.byteLength || arrayBuffer.byteLength > MAX_BYTES) {
      return res.status(arrayBuffer.byteLength ? 413 : 502).json({ error: arrayBuffer.byteLength ? 'IMAGE_TOO_LARGE' : 'EMPTY_IMAGE' });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(arrayBuffer.byteLength));
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error('GeoCampo photo proxy error', error);
    return res.status(500).json({ error: 'PHOTO_PROXY_FAILED' });
  }
};
