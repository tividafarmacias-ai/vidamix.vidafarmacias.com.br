import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { hashSync } from 'bcryptjs';
import apacheMd5 from 'apache-md5';
import { createApplication } from '../src/app.mjs';
import { loadConfig } from '../src/config.mjs';
import { initializeSchema } from '../src/database/catalog-database.mjs';
import { createAuthService } from '../src/modules/auth/auth-service.mjs';

const password = 'Senha somente do teste 123!';
const passwordHash = hashSync(password, 4);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=', 'base64');

async function fixture(t, { auth = {}, unavailable = false } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'vidamix-auth-'));
  const images = path.join(directory, 'images');
  const backgrounds = path.join(directory, 'backgrounds');
  await mkdir(path.join(images, 'imagens'), { recursive: true });
  await mkdir(backgrounds);
  await writeFile(path.join(images, 'imagens', 'produto.png'), png);
  await writeFile(path.join(backgrounds, 'campanha.png'), png);
  const database = new DatabaseSync(':memory:');
  initializeSchema(database);
  database.prepare(`INSERT INTO products
    (id, nome, ean, imagem_arquivo, imagem_status, created_at, updated_at)
    VALUES (1, 'Produto de teste', '7891234567890', 'imagens/produto.png', 'manual', '2026-01-01', '2026-01-01')`).run();
  const records = new Map([
    ['1', { id: '1', name: 'Admin de teste', email: 'admin@example.test', passwordHash, role: 'admin', active: true }],
    ['2', { id: '2', name: 'Cliente de teste', email: 'cliente@example.test', passwordHash, role: 'cliente', active: true }],
  ]);
  const calls = { byEmail: [], byId: [] };
  const users = {
    async findByEmail(email) {
      calls.byEmail.push(email);
      if (unavailable) throw new Error('mysql://usuario:segredo@privado/base cliente SELECT password');
      return [...records.values()].find(user => user.email === email) || null;
    },
    async findById(id) {
      calls.byId.push(String(id));
      if (unavailable) throw new Error('mysql://usuario:segredo@privado/base cliente SELECT password');
      return records.get(String(id)) || null;
    },
  };
  let timestamp = Date.UTC(2026, 9, 20, 12);
  const config = {
    ...loadConfig({ NODE_ENV: 'test' }),
    storageDirectory: directory,
    imagesDirectory: images,
    storyBackgroundsDirectory: backgrounds,
    feedBackgroundsDirectory: backgrounds,
    indoorBackgroundsDirectory: backgrounds,
    auth: { sessionDurationMs: 28_800_000, secureCookies: false, trustProxy: false, origin: '', ...auth },
  };
  const authService = createAuthService({ users, database, config, now: () => timestamp });
  const servers = [];
  async function start(service = authService) {
    const server = createServer(createApplication({ config, database, authService: service, logger: { error() {} } }));
    servers.push(server);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${server.address().port}`;
  }
  t.after(async () => {
    await Promise.all(servers.map(server => new Promise(resolve => {
      server.close(resolve);
      server.closeAllConnections();
    })));
    database.close();
    // Only remove this test's verified newly created temporary directory.
    if (path.dirname(directory) === path.resolve(tmpdir()) && path.basename(directory).startsWith('vidamix-auth-')) {
      await rm(directory, { recursive: true, force: true });
    }
  });
  const origin = await start();
  const request = (route, options = {}) => fetch(origin + route, { redirect: 'manual', ...options });
  const login = async (email = 'admin@example.test', extra = {}) => {
    const response = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: config.auth.origin || origin },
      body: JSON.stringify({ email, password, ...extra }),
    });
    const body = await response.json();
    return { response, body, cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
  };
  return { origin, request, login, records, users, calls, config, database, start,
    advance(ms) { timestamp += ms; },
    setUnavailable(value) { unavailable = value; },
    headers(session) { return { Cookie: session.cookie, Origin: config.auth.origin || origin, 'X-CSRF-Token': session.body.csrfToken }; },
  };
}

test('authentication fails closed without a service; login resources and PWA metadata stay public', async t => {
  const app = await fixture(t);
  const origin = await app.start(null);
  for (const route of ['/', '/catalogo', '/catalogo.html', '/artes/stories', '/feed.html',
    '/artes/indoor-h', '/revista', '/backgrounds.html']) {
    const response = await fetch(origin + route, { redirect: 'manual' });
    assert.equal(response.status, 302, route);
    const destination = new URL(response.headers.get('location'), origin);
    assert.equal(destination.origin, origin);
    assert.equal(destination.pathname, '/login');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  for (const route of ['/api/auth/session', '/api/health', '/api/products', '/assets/imagens/produto.png']) {
    assert.equal((await fetch(origin + route, { redirect: 'manual' })).status, 401, route);
  }
  for (const route of ['/login', '/login.html', '/brand.css', '/js/theme.js', '/sw.js', '/offline.html',
    '/manifest.json', '/pwa-icons/icon-192.png']) {
    assert.equal((await fetch(origin + route)).status, 200, route);
  }
  const basic = await fetch(origin + '/api/health', {
    headers: { Authorization: `Basic ${Buffer.from('admin:admin').toString('base64')}` },
  });
  assert.equal(basic.status, 401);
});

test('login creates an opaque HttpOnly session, returns only public user fields and restores it after service restart', async t => {
  const app = await fixture(t);
  const session = await app.login('  ADMIN@example.test  ');
  assert.equal(session.response.status, 200);
  assert.deepEqual(session.body.user, { id: '1', name: 'Admin de teste', role: 'admin' });
  assert.ok(session.body.csrfToken.length >= 32);
  assert.deepEqual(Object.keys(session.body).sort(), ['csrfToken', 'user']);
  const cookie = session.response.headers.get('set-cookie');
  assert.match(cookie, /^vidamix_session=[A-Za-z0-9_-]{32,}/);
  assert.match(cookie, /;\s*HttpOnly/i);
  assert.match(cookie, /;\s*SameSite=Lax/i);
  assert.match(cookie, /;\s*Path=\//i);
  assert.doesNotMatch(cookie, /;\s*Secure/i);
  assert.equal(session.response.headers.get('cache-control'), 'no-store');
  assert.equal(session.response.headers.get('www-authenticate'), null);
  assert.deepEqual(app.calls.byEmail, ['admin@example.test']);
  const restored = await app.request('/api/auth/session', { headers: { Cookie: session.cookie } });
  assert.equal(restored.status, 200);
  assert.deepEqual(await restored.json(), session.body);
  assert.ok(app.calls.byId.includes('1'), 'the account is revalidated against the user directory');

  const token = session.cookie.split('=')[1];
  const tables = app.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
  for (const { name } of tables) {
    const rows = app.database.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all();
    for (const row of rows) {
      assert.ok(!Object.values(row).includes(token), 'database stores a hash instead of the cookie token');
      assert.ok(!Object.values(row).includes(password), 'database never stores the provided password');
    }
  }
  const restarted = createAuthService({ users: app.users, database: app.database, config: app.config,
    now: () => Date.UTC(2026, 9, 20, 12) });
  const restartedOrigin = await app.start(restarted);
  const persisted = await fetch(restartedOrigin + '/api/auth/session', { headers: { Cookie: session.cookie } });
  assert.equal(persisted.status, 200);
});

test('client can read products and create all allowed formats, including physical HTML aliases', async t => {
  const app = await fixture(t);
  const session = await app.login('cliente@example.test', { role: 'admin' });
  assert.equal(session.response.status, 200);
  assert.equal(session.body.user.role, 'cliente', 'a submitted role cannot elevate the stored account');
  const headers = { Cookie: session.cookie };
  for (const route of ['/', '/index.html', '/catalogo', '/catalogo/', '/catalogo.html', '/artes/stories', '/stories.html',
    '/artes/feed/', '/feed.html', '/artes/indoor-h', '/indoor-h.html']) {
    const response = await app.request(route, { headers });
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get('content-type'), /^text\/html/);
  }
  for (const route of ['/api/products', '/api/products/1', '/api/products/by-ean/7891234567890',
    '/api/categories', '/api/summary', '/api/story-backgrounds', '/api/feed-backgrounds',
    '/api/indoor-backgrounds', '/api/health', '/assets/imagens/produto.png',
    '/story-backgrounds/campanha.png', '/feed-backgrounds/campanha.png', '/indoor-backgrounds/campanha.png',
    '/js/features/revista/artwork.js']) {
    assert.equal((await app.request(route, { headers })).status, 200, route);
  }
});

test('client is denied administrative pages, aliases and every API mutation before reading their payloads', async t => {
  const app = await fixture(t);
  const session = await app.login('cliente@example.test');
  const headers = { Cookie: session.cookie };
  for (const route of ['/revista', '/revista/', '/revista.html', '/REVISTA.HTML', '/%72evista.html',
    '/revista%2ehtml', '/backgrounds', '/backgrounds/', '/backgrounds.html', '/BACKGROUNDS.HTML',
    '/%62ackgrounds.html', '/backgrounds.html/', '/revista.html%20', '/revista.html.']) {
    const response = await app.request(route, { headers });
    assert.ok([400, 403, 404].includes(response.status), `${route}: ${response.status} must not expose an admin page`);
  }
  for (const [method, route] of [
    ['POST', '/api/products'], ['PUT', '/api/products/1'], ['DELETE', '/api/products/1'],
    ['POST', '/api/products/1/image'], ['POST', '/api/backgrounds/stories'],
    ['POST', '/api/backgrounds/feed'], ['POST', '/api/backgrounds/indoor-h'],
    ['DELETE', '/api/backgrounds/stories/campanha.png'],
    ['GET', '/api/revista/template'], ['GET', '/api/revista/active'],
    ['GET', '/api/revista/active/products/1?campaignId=1'], ['GET', '/api/revista/campaigns'],
    ['GET', '/api/revista/campaigns/1'], ['POST', '/api/revista/validate'],
    ['POST', '/api/revista/campaigns'], ['DELETE', '/api/revista/campaigns/1'],
  ]) {
    const response = await app.request(route, { method, headers });
    assert.equal(response.status, 403, `${method} ${route}`);
  }
  assert.equal(app.database.prepare('SELECT COUNT(*) AS count FROM products').get().count, 1);
  assert.equal((await app.request('/assets/imagens/produto.png', { headers })).status, 200);
});

test('admin can visit every screen and complete product CRUD with a valid session and CSRF token', async t => {
  const app = await fixture(t);
  const session = await app.login();
  const headers = app.headers(session);
  for (const route of ['/', '/catalogo', '/artes/stories', '/artes/feed', '/artes/indoor-h',
    '/revista', '/revista.html', '/backgrounds', '/backgrounds.html', '/api/revista/campaigns', '/api/revista/template']) {
    assert.equal((await app.request(route, { headers })).status, 200, route);
  }
  const created = await app.request('/api/products', { method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: 'Novo produto de teste', ean: '7891234567891' }) });
  assert.equal(created.status, 201);
  const product = await created.json();
  const updated = await app.request(`/api/products/${product.id}`, { method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: 'Produto atualizado' }) });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).nome, 'Produto atualizado');
  assert.equal((await app.request(`/api/products/${product.id}`, { method: 'DELETE', headers })).status, 204);
  assert.equal((await app.request(`/api/products/${product.id}`, { headers })).status, 404);
});

test('mutations reject missing or foreign Origin and missing or forged CSRF tokens', async t => {
  const app = await fixture(t);
  const session = await app.login();
  const valid = app.headers(session);
  for (const headers of [
    { Cookie: session.cookie },
    { Cookie: session.cookie, Origin: app.origin },
    { Cookie: session.cookie, Origin: app.origin, 'X-CSRF-Token': 'forged' },
    { Cookie: session.cookie, 'X-CSRF-Token': session.body.csrfToken },
    { ...valid, Origin: 'https://evil.example' },
    { ...valid, Origin: 'null' },
    { ...valid, Origin: `${app.origin}.evil.example` },
  ]) {
    const response = await app.request('/api/products/1', { method: 'DELETE', headers });
    assert.equal(response.status, 403);
    assert.ok(app.database.prepare('SELECT id FROM products WHERE id = 1').get(), 'blocked requests cannot delete data');
  }
  for (const origin of [null, 'https://evil.example', 'null']) {
    const response = await app.request('/api/auth/login', { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(origin === null ? {} : { Origin: origin }) },
      body: JSON.stringify({ email: 'admin@example.test', password }) });
    assert.equal(response.status, 403, `login Origin ${origin}`);
    assert.equal(response.headers.get('set-cookie'), null);
  }
});

test('admin background removal preserves the case of filenames in API parameters', async t => {
  const app = await fixture(t);
  const filename = 'Campanha DE Verao.PNG';
  await writeFile(path.join(app.config.storyBackgroundsDirectory, filename), png);
  const session = await app.login();
  const response = await app.request(`/api/backgrounds/stories/${encodeURIComponent(filename)}`, {
    method: 'DELETE', headers: app.headers(session),
  });
  assert.equal(response.status, 200);
  const listing = await app.request('/api/story-backgrounds', { headers: { Cookie: session.cookie } });
  assert.deepEqual((await listing.json()).items.map(item => item.arquivo), ['campanha.png']);
});

test('logout requires CSRF, revokes the server session and expires the cookie', async t => {
  const app = await fixture(t);
  const session = await app.login();
  const rejected = await app.request('/api/auth/logout', { method: 'POST', headers: { Cookie: session.cookie, Origin: app.origin } });
  assert.equal(rejected.status, 403);
  assert.equal((await app.request('/api/auth/session', { headers: { Cookie: session.cookie } })).status, 200);
  const response = await app.request('/api/auth/logout', { method: 'POST', headers: app.headers(session) });
  assert.equal(response.status, 204);
  assert.match(response.headers.get('set-cookie'), /vidamix_session=;/);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  assert.equal((await app.request('/api/auth/session', { headers: { Cookie: session.cookie } })).status, 401);
  assert.equal((await app.request('/api/products', { headers: { Cookie: session.cookie } })).status, 401);
});

test('invalid credentials, unknown roles and inactive accounts have the same non-enumerating response', async t => {
  const app = await fixture(t);
  const bodies = [];
  for (const [email, changes, extra] of [
    ['missing@example.test', {}, {}],
    ['admin@example.test', {}, { password: 'senha incorreta' }],
    ['admin@example.test', { role: 'superadmin' }, {}],
    ['admin@example.test', { role: 'admin', active: false }, {}],
  ]) {
    Object.assign(app.records.get('1'), changes);
    const session = await app.login(email, extra);
    assert.equal(session.response.status, 401);
    assert.equal(session.cookie, '');
    bodies.push(session.body);
    assert.doesNotMatch(JSON.stringify(session.body), /password|mysql|SELECT|superadmin|missing@example/i);
  }
  for (const body of bodies.slice(1)) assert.deepEqual(body, bodies[0]);
});

test('sessions reject tampering and expire at the configured time', async t => {
  const app = await fixture(t);
  const session = await app.login();
  for (const cookie of ['vidamix_session=forged', 'vidamix_session=%ZZ', `${session.cookie}x`,
    'vidamix_session=', 'another_session=anything', `${session.cookie}; ${session.cookie}`]) {
    assert.equal((await app.request('/api/auth/session', { headers: { Cookie: cookie } })).status, 401, cookie);
  }
  app.advance(app.config.auth.sessionDurationMs - 1);
  assert.equal((await app.request('/api/auth/session', { headers: { Cookie: session.cookie } })).status, 200);
  app.advance(2);
  assert.equal((await app.request('/api/auth/session', { headers: { Cookie: session.cookie } })).status, 401);
});

test('role, password and active status changes take effect on existing sessions', async t => {
  for (const change of [{ role: 'cliente' }, { active: false }, { passwordHash: hashSync('nova senha', 4) }, { role: 'owner' }]) {
    await t.test(`account field changed: ${Object.keys(change)[0]}`, async child => {
      const app = await fixture(child);
      const session = await app.login();
      Object.assign(app.records.get('1'), change);
      const response = await app.request('/api/products/1', { method: 'DELETE', headers: app.headers(session) });
      assert.ok([401, 403].includes(response.status), `changed account must immediately lose admin writes: ${response.status}`);
      assert.ok(app.database.prepare('SELECT id FROM products WHERE id = 1').get());
    });
  }
});

test('unavailable MySQL authentication never exposes backend diagnostics or permits access', async t => {
  const app = await fixture(t);
  const session = await app.login();
  app.setUnavailable(true);
  const restored = await app.request('/api/auth/session', { headers: { Cookie: session.cookie } });
  assert.equal(restored.status, 503);
  assert.doesNotMatch(await restored.text(), /mysql|usuario|segredo|privado|SELECT|password/i);
  const login = await app.login();
  assert.equal(login.response.status, 503);
  assert.doesNotMatch(JSON.stringify(login.body), /mysql|usuario|segredo|privado|SELECT|password/i);
  const denied = await app.request('/api/products', { headers: { Cookie: session.cookie } });
  assert.equal(denied.status, 503);
  assert.doesNotMatch(await denied.text(), /mysql|usuario|segredo|privado|SELECT|password/i);
  assert.equal((await app.request('/login')).status, 200, 'the login UI remains available during a directory outage');
});

test('configured HTTPS cookies are Secure and untrusted forwarded headers cannot weaken origin checks', async t => {
  const app = await fixture(t, { auth: { secureCookies: true, origin: 'https://studio.example.test' } });
  const session = await app.login();
  assert.equal(session.response.status, 200);
  assert.match(session.response.headers.get('set-cookie'), /;\s*Secure/i);
  const spoofed = await app.request('/api/products/1', { method: 'DELETE',
    headers: { ...app.headers(session), Origin: 'https://evil.example',
      'X-Forwarded-Host': 'evil.example', 'X-Forwarded-Proto': 'https' } });
  assert.equal(spoofed.status, 403);
});

test('logging in again rotates the session and revokes the preceding cookie', async t => {
  const app = await fixture(t);
  const original = await app.login();
  const response = await app.request('/api/auth/login', { method: 'POST',
    headers: { Cookie: original.cookie, Origin: app.origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.test', password }) });
  assert.equal(response.status, 200);
  const replacement = response.headers.get('set-cookie').split(';')[0];
  assert.notEqual(replacement, original.cookie);
  assert.notEqual((await response.json()).csrfToken, original.body.csrfToken);
  assert.equal((await app.request('/api/auth/session', { headers: { Cookie: original.cookie } })).status, 401);
  assert.equal((await app.request('/api/auth/session', { headers: { Cookie: replacement } })).status, 200);
});

test('legacy MD5-crypt can authenticate existing records but plaintext passwords cannot', async t => {
  const app = await fixture(t);
  app.records.get('1').passwordHash = apacheMd5(password, '$1$test1234$');
  assert.equal((await app.login()).response.status, 200);
  app.records.get('1').passwordHash = password;
  assert.equal((await app.login()).response.status, 401);
});

test('repeated invalid credentials are rate limited without accepting subsequent attempts', async t => {
  const app = await fixture(t);
  let limited = false;
  for (let attempt = 0; attempt < 25; attempt++) {
    const result = await app.login('admin@example.test', { password: 'errada' });
    assert.ok([401, 429].includes(result.response.status));
    if (result.response.status === 429) {
      limited = true;
      assert.equal(result.cookie, '');
      break;
    }
  }
  assert.ok(limited, 'repeated login failures must be limited');
});
