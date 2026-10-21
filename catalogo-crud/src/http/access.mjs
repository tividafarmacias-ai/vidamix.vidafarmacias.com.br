import { HttpError } from './errors.mjs';

export function canonicalRequestPath(pathname) {
  let path;
  try { path = decodeURIComponent(pathname); }
  catch { throw new HttpError(400, 'Caminho inválido.'); }
  // Never let a second decode or Windows path rules bypass authorization.
  if (/[\\%\u0000-\u001f\u007f]/.test(path) || path.split('/').some((part) => part === '.' || part === '..' || part.startsWith('.'))) {
    throw new HttpError(400, 'Caminho inválido.');
  }
  return path.replace(/\/+/g, '/').replace(/\/+$/, '') || '/';
}

export function isPublicResource(pathname) {
  return /^\/(?:[a-z0-9-]+\.(?:css|js)|js\/[a-z0-9_./-]+\.js|fonts\/[a-z0-9-]+\.woff2|(?:branding|pwa-icons|icons)\/[a-z0-9-]+\.png)$/i.test(pathname);
}

const clientePages = new Set(['index.html', 'catalogo.html', 'stories.html', 'feed.html', 'indoor-h.html']);
export function canAccessPage(role, filename) {
  return role === 'admin' || (role === 'cliente' && clientePages.has(filename));
}

export function canAccessApi(role, method, pathname) {
  if (role === 'admin') return true;
  if (role !== 'cliente' || !['GET', 'HEAD'].includes(method)) return false;
  return /^\/api\/(?:health|summary|categories|story-backgrounds|feed-backgrounds|indoor-backgrounds|products(?:\/(?:\d+|by-ean\/[^/]+))?)$/.test(pathname);
}
