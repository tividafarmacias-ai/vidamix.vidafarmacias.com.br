const clientDestinations = new Map([
  ['/', '/'],
  ['/index.html', '/'],
  ['/catalogo', '/catalogo'],
  ['/catalogo.html', '/catalogo'],
  ['/artes/stories', '/artes/stories'],
  ['/stories.html', '/artes/stories'],
  ['/artes/feed', '/artes/feed'],
  ['/feed.html', '/artes/feed'],
  ['/artes/indoor-h', '/artes/indoor-h'],
  ['/indoor-h.html', '/artes/indoor-h'],
]);
const adminDestinations = new Map([
  ...clientDestinations,
  ['/revista', '/revista'],
  ['/revista.html', '/revista'],
  ['/backgrounds', '/backgrounds'],
  ['/backgrounds.html', '/backgrounds'],
]);

export function loginDestination(next, role, origin) {
  const fallback = '/';
  if (typeof next !== 'string' || !/^\/(?!\/)/.test(next) || /[\\\u0000-\u0020\u007f]/.test(next)) return fallback;
  try {
    const destination = new URL(next, origin);
    if (destination.origin !== origin) return fallback;
    const pathname = destination.pathname.replace(/\/+$/, '') || '/';
    const allowed = role === 'admin' ? adminDestinations : clientDestinations;
    const canonical = allowed.get(pathname);
    return canonical ? `${canonical}${destination.search}${destination.hash}` : fallback;
  } catch {
    return fallback;
  }
}

function responseMessage(data, status) {
  if (typeof data?.error === 'string' && data.error.length > 0 && data.error.length <= 240) return data.error;
  if (status === 429) return 'Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.';
  if (status === 401) return 'E-mail ou senha inválidos.';
  return 'Não foi possível entrar. Tente novamente em instantes.';
}

export function initLogin({ doc = document, win = window, request = fetch } = {}) {
  const form = doc.getElementById('login-form');
  if (!form) return;
  const email = doc.getElementById('login-email');
  const password = doc.getElementById('login-password');
  const toggle = doc.getElementById('login-password-toggle');
  const submit = doc.getElementById('login-submit');
  const label = doc.getElementById('login-submit-label');
  const error = doc.getElementById('login-error');
  const status = doc.getElementById('login-status');
  const next = new URLSearchParams(win.location.search).get('next');
  let busy = false;
  let attempt = 0;

  function redirect(data) {
    if (!['admin', 'cliente'].includes(data?.user?.role)) return false;
    win.location.replace(loginDestination(next, data.user.role, win.location.origin));
    return true;
  }

  function setBusy(value) {
    busy = value;
    form.setAttribute('aria-busy', String(value));
    submit.disabled = value;
    email.readOnly = value;
    password.readOnly = value;
    label.textContent = value ? 'Entrando…' : 'Entrar';
    status.textContent = value ? 'Verificando seu acesso…' : '';
  }

  function showError(message) {
    error.textContent = message;
    error.hidden = false;
    email.setAttribute('aria-describedby', 'login-error');
    password.setAttribute('aria-describedby', 'login-error');
  }

  function clearError() {
    error.hidden = true;
    error.textContent = '';
    email.removeAttribute('aria-describedby');
    password.removeAttribute('aria-describedby');
  }

  toggle.addEventListener('click', () => {
    const visible = password.type === 'password';
    password.type = visible ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', String(visible));
    toggle.setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
  });

  form.addEventListener('input', clearError);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    attempt += 1;
    clearError();
    setBusy(true);
    let navigating = false;
    try {
      const response = await request('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: email.value.trim(), password: password.value }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        showError(responseMessage(data, response.status));
        return;
      }
      password.value = '';
      navigating = redirect(data);
      if (!navigating) showError('Não foi possível validar seu acesso. Tente novamente em instantes.');
    } catch {
      showError('Não foi possível conectar. Verifique sua conexão e tente novamente.');
    } finally {
      if (!navigating) setBusy(false);
    }
  });

  // Reuse an existing session without storing credentials or session tokens in browser storage.
  return request('/api/auth/session', {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  }).then(async (response) => {
    if (!response.ok) return;
    const data = await response.json();
    if (attempt === 0) redirect(data);
  }).catch(() => {
    // The form remains available when offline or when the session has expired.
  });
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') initLogin();
