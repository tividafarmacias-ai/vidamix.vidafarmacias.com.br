import assert from 'node:assert/strict';
import test from 'node:test';
import { initLogin, loginDestination } from '../public/js/login.js';

const origin = 'https://studio.example.com';
const response = (status, data) => ({ status, ok: status >= 200 && status < 300, json: async () => data });

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture({ session = response(401, {}), login = response(200, { user: { role: 'cliente' } }), next = '' } = {}) {
  const elements = new Map();
  for (const id of ['login-form', 'login-email', 'login-password', 'login-password-toggle', 'login-submit', 'login-submit-label', 'login-error', 'login-status']) {
    const handlers = new Map();
    const attributes = new Map();
    elements.set(id, {
      value: '', textContent: '', hidden: true, type: id === 'login-password' ? 'password' : 'text',
      disabled: false, readOnly: false, valid: true,
      addEventListener(name, handler) { handlers.set(name, handler); },
      emit(name, event = { preventDefault() {} }) { return handlers.get(name)?.(event); },
      setAttribute(name, value) { attributes.set(name, value); },
      getAttribute(name) { return attributes.get(name); },
      removeAttribute(name) { attributes.delete(name); },
      reportValidity() { return this.valid; },
    });
  }
  const calls = [];
  const redirects = [];
  const ready = initLogin({
    doc: { getElementById: (id) => elements.get(id) },
    win: { location: { origin, search: next ? `?next=${encodeURIComponent(next)}` : '', replace: (value) => redirects.push(value) } },
    request: async (url, options) => {
      calls.push({ url, options });
      const result = url.endsWith('/session') ? session : login;
      if (result instanceof Error) throw result;
      return result;
    },
  });
  const get = (id) => elements.get(`login-${id}`);
  get('email').value = ' usuario@example.com ';
  get('password').value = '  senha com espaços  ';
  return { ready, get, calls, redirects, submit: () => get('form').emit('submit') };
}

test('defaults and permitted destinations follow the authenticated role', () => {
  assert.equal(loginDestination(null, 'admin', origin), '/');
  assert.equal(loginDestination(null, 'cliente', origin), '/');
  assert.equal(loginDestination('/revista', 'admin', origin), '/revista');
  assert.equal(loginDestination('/backgrounds', 'cliente', origin), '/');
  assert.equal(loginDestination('/', 'cliente', origin), '/');
  assert.equal(loginDestination('/index.html', 'cliente', origin), '/');
  assert.equal(loginDestination('/revista', 'cliente', origin), '/');
  for (const role of ['admin', 'cliente']) {
    assert.equal(loginDestination('/artes/stories?product=123#preview', role, origin), '/artes/stories?product=123#preview');
    assert.equal(loginDestination('/feed.html', role, origin), '/artes/feed');
    assert.equal(loginDestination('/catalogo/', role, origin), '/catalogo');
    assert.equal(loginDestination('/artes/indoor-h', role, origin), '/artes/indoor-h');
  }
});

test('next never redirects to external URLs, APIs or unrecognized destinations', () => {
  for (const next of [
    'https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)',
    ' https://evil.example', '/\nevil.example', '/%2f%2fevil.example', '/%5cevil.example',
    '/api/auth/logout', '/api/products', '/login', '/unknown', '/catalogo/../../api/products',
    `${origin}/catalogo`,
  ]) {
    assert.equal(loginDestination(next, 'admin', origin), '/', next);
    assert.equal(loginDestination(next, 'cliente', origin), '/', next);
  }
});

test('a valid session redirects immediately to an allowed destination', async () => {
  const f = fixture({ session: response(200, { user: { role: 'admin' } }), next: '/revista' });
  await f.ready;
  assert.deepEqual(f.redirects, ['/revista']);
  assert.equal(f.calls[0].options.cache, 'no-store');
  assert.equal(f.calls[0].options.credentials, 'same-origin');
});

test('an expired session or unavailable session service leaves login usable', async () => {
  for (const session of [response(401, {}), response(503, {}), new Error('offline')]) {
    const f = fixture({ session });
    await f.ready;
    assert.deepEqual(f.redirects, []);
    assert.equal(f.get('submit').disabled, false);
    assert.equal(f.get('error').hidden, true);
  }
});

test('successful login posts credentials, preserves password spaces, and clears the password', async () => {
  const f = fixture({ next: '/artes/feed' });
  await f.ready;
  await f.submit();
  const call = f.calls[1];
  assert.equal(call.url, '/api/auth/login');
  assert.equal(call.options.method, 'POST');
  assert.equal(call.options.credentials, 'same-origin');
  assert.equal(call.options.cache, 'no-store');
  assert.equal(call.options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(call.options.body), { email: 'usuario@example.com', password: '  senha com espaços  ' });
  assert.deepEqual(f.redirects, ['/artes/feed']);
  assert.equal(f.get('password').value, '');
  assert.equal(f.get('form').getAttribute('aria-busy'), 'true');
});

test('login suppresses duplicate submissions and announces a pending request', async () => {
  const pending = deferred();
  const f = fixture({ login: pending.promise });
  await f.ready;
  const submitting = f.submit();
  await f.submit();
  assert.equal(f.calls.length, 2);
  assert.equal(f.get('submit').disabled, true);
  assert.equal(f.get('email').readOnly, true);
  assert.equal(f.get('password').readOnly, true);
  assert.equal(f.get('submit-label').textContent, 'Entrando…');
  assert.equal(f.get('status').textContent, 'Verificando seu acesso…');
  pending.resolve(response(401, {}));
  await submitting;
  assert.equal(f.get('submit').disabled, false);
  assert.equal(f.get('email').readOnly, false);
  assert.equal(f.get('password').readOnly, false);
  assert.equal(f.get('form').getAttribute('aria-busy'), 'false');
});

test('invalid native form fields prevent sending credentials', async () => {
  const f = fixture();
  await f.ready;
  f.get('form').valid = false;
  await f.submit();
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.redirects, []);
});

test('invalid credentials display a generic API error and associate it with the fields', async () => {
  const f = fixture({ login: response(401, { error: 'E-mail ou senha inválidos.' }) });
  await f.ready;
  await f.submit();
  assert.equal(f.get('error').textContent, 'E-mail ou senha inválidos.');
  assert.equal(f.get('error').hidden, false);
  assert.equal(f.get('email').getAttribute('aria-describedby'), 'login-error');
  assert.equal(f.get('password').getAttribute('aria-describedby'), 'login-error');
  assert.deepEqual(f.redirects, []);
  f.get('form').emit('input');
  assert.equal(f.get('error').hidden, true);
  assert.equal(f.get('email').getAttribute('aria-describedby'), undefined);
  assert.equal(f.get('password').getAttribute('aria-describedby'), undefined);
});

test('rate limits and network failures are actionable and allow another submission', async () => {
  for (const [login, message] of [
    [response(429, {}), 'Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.'],
    [new Error('network error'), 'Não foi possível conectar. Verifique sua conexão e tente novamente.'],
  ]) {
    const f = fixture({ login });
    await f.ready;
    await f.submit();
    assert.equal(f.get('error').textContent, message);
    assert.equal(f.get('submit').disabled, false);
    assert.equal(f.get('submit-label').textContent, 'Entrar');
    await f.submit();
    assert.equal(f.calls.length, 3);
  }
});

test('malformed responses and unknown roles do not redirect', async () => {
  for (const login of [
    response(200, { user: { role: 'other' } }),
    response(200, null),
    { ok: true, status: 200, json: async () => { throw new SyntaxError('invalid JSON'); } },
  ]) {
    const f = fixture({ login });
    await f.ready;
    await f.submit();
    assert.deepEqual(f.redirects, []);
    assert.equal(f.get('error').hidden, false);
    assert.equal(f.get('submit').disabled, false);
  }
});

test('show and hide password updates the input and accessible toggle state', async () => {
  const f = fixture();
  await f.ready;
  f.get('password-toggle').emit('click');
  assert.equal(f.get('password').type, 'text');
  assert.equal(f.get('password-toggle').getAttribute('aria-pressed'), 'true');
  assert.equal(f.get('password-toggle').getAttribute('aria-label'), 'Ocultar senha');
  f.get('password-toggle').emit('click');
  assert.equal(f.get('password').type, 'password');
  assert.equal(f.get('password-toggle').getAttribute('aria-pressed'), 'false');
  assert.equal(f.get('password-toggle').getAttribute('aria-label'), 'Mostrar senha');
});

test('a stale session lookup cannot override the result of a new login', async () => {
  const session = deferred();
  const f = fixture({ session: session.promise, login: response(200, { user: { role: 'cliente' } }) });
  await f.submit();
  session.resolve(response(200, { user: { role: 'admin' } }));
  await f.ready;
  assert.deepEqual(f.redirects, ['/']);
});
