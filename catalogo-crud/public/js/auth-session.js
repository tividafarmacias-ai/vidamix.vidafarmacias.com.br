const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function clearLegacyImageCaches(cacheStorage) {
  try {
    if (!cacheStorage) return;
    const names = await cacheStorage.keys();
    await Promise.allSettled(names.filter((name) => name.startsWith('vidamix-images-')).map((name) => cacheStorage.delete(name)));
  } catch {
    // Restricted browser storage must not prevent the server-side logout.
  }
}

export function loginUrl(location) {
  const next = `${location.pathname || '/'}${location.search || ''}`;
  return `/login?next=${encodeURIComponent(next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/')}`;
}

// Keep credentials in the HttpOnly session cookie. Only the CSRF token is held
// in memory, shared by the header and every authenticated API request.
export function createAuthClient({ fetch: fetcher, location, root, offline = false, onLogout = async () => {} }) {
  let session = null;
  let redirected = false;
  const setState = (state) => {
    if (!root) return;
    root.dataset.authState = state;
    root.dataset.userRole = session?.user.role || '';
  };
  const redirectToLogin = () => {
    session = null;
    setState('anonymous');
    if (!offline && !redirected && location.pathname !== '/login') {
      redirected = true;
      location.replace(loginUrl(location));
    }
  };
  const ready = (async () => {
    setState(offline ? 'offline' : 'loading');
    if (offline) return null;
    try {
      const response = await fetcher('/api/auth/session', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (response.status === 401) {
        redirectToLogin();
        return null;
      }
      if (!response.ok) throw new Error('Não foi possível verificar sua sessão.');
      const data = await response.json();
      if (!['admin', 'cliente'].includes(data.user?.role) || typeof data.csrfToken !== 'string' || !data.csrfToken) {
        throw new Error('Sessão inválida.');
      }
      session = data;
      setState('authenticated');
      return session;
    } catch {
      setState('error');
      return null;
    }
  })();

  const authFetch = async (url, options = {}) => {
    await ready;
    if (!session) throw new Error('Não foi possível verificar sua sessão. Entre novamente para continuar.');
    const target = new URL(url, location.href);
    if (target.origin !== location.origin) throw new Error('A requisição deve usar o endereço desta aplicação.');
    const method = (options.method || 'GET').toUpperCase();
    const headers = new Headers(options.headers);
    if (!SAFE_METHODS.has(method)) headers.set('X-CSRF-Token', session.csrfToken);
    const response = await fetcher(url, { ...options, method, headers, credentials: 'same-origin' });
    if (response.status === 401) redirectToLogin();
    return response;
  };

  const logout = async () => {
    const response = await authFetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!response.ok && response.status !== 401) throw new Error('Não foi possível sair. Tente novamente.');
    session = null;
    setState('anonymous');
    try { await onLogout(); } catch { /* Logout remains valid if browser storage is unavailable. */ }
    location.replace('/login');
  };

  return { ready, authFetch, logout, getSession: () => session, invalidate() { session = null; setState('anonymous'); } };
}

const browser = typeof window !== 'undefined' && typeof document !== 'undefined';
let logoutChannel;
if (browser && typeof BroadcastChannel !== 'undefined') {
  try { logoutChannel = new BroadcastChannel('vidamix-auth'); } catch { /* Optional cross-tab notification. */ }
}
const client = browser ? createAuthClient({
  fetch: window.fetch.bind(window),
  location: window.location,
  root: document.documentElement,
  offline: document.body?.classList.contains('offline-page') || window.location.pathname === '/offline.html',
  onLogout: async () => {
    try { logoutChannel?.postMessage({ type: 'logout' }); } catch { /* Optional cross-tab notification. */ }
    let timer;
    try {
      // Do not delay navigation indefinitely if the browser's cache store stalls.
      await Promise.race([
        clearLegacyImageCaches(window.caches),
        new Promise((resolve) => { timer = window.setTimeout(resolve, 1500); }),
      ]);
    } finally { window.clearTimeout(timer); }
  },
}) : null;

export const sessionReady = client?.ready || Promise.resolve(null);
export const getSession = () => client?.getSession() || null;
export const isAdmin = () => getSession()?.user.role === 'admin';
export const authFetch = (url, options) => client.authFetch(url, options);
export const logout = () => client.logout();

if (browser) {
  logoutChannel?.addEventListener('message', (event) => {
    if (event.data?.type !== 'logout' || document.body.classList.contains('offline-page')) return;
    client.invalidate();
    window.location.replace('/login');
  });
  // A restored tab must verify its cookie again after logout or an account switch.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && !document.body.classList.contains('offline-page')) window.location.reload();
  });
}
