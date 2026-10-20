import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthClient, clearLegacyImageCaches, loginUrl } from '../public/js/auth-session.js';
import { getHeaderDestinations } from '../public/js/app-shell.js';
import { getTour } from '../public/js/features/tour/steps.js';

const session = { user: { id: 9, name: 'Conta exemplo', role: 'cliente' }, csrfToken: 'test-csrf-token' };
const response = (status, data) => ({ status, ok: status < 400, json: async () => data });

function fixture({ result = response(200, session), offline = false, actionStatus = 200 } = {}) {
  const requests = [];
  const redirects = [];
  const root = { dataset: {} };
  const location = new URL('https://vidamix.test/catalogo?q=produto');
  location.replace = (url) => redirects.push(url);
  const client = createAuthClient({
    root, location, offline,
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (url === '/api/auth/session') {
        if (result instanceof Error) throw result;
        return result;
      }
      return response(actionStatus, {});
    },
  });
  return { client, requests, redirects, root };
}

test('session is shared and only same-origin mutations receive the CSRF token', async () => {
  const { client, requests, root } = fixture();
  await Promise.all([
    client.authFetch('/api/products'),
    client.authFetch('/api/products/1', { method: 'PUT', body: '{}', headers: { 'Content-Type': 'application/json' } }),
    client.authFetch('/api/products/1/image', { method: 'POST', body: new FormData() }),
  ]);
  assert.equal(requests.filter(({ url }) => url === '/api/auth/session').length, 1);
  assert.equal(root.dataset.authState, 'authenticated');
  assert.equal(root.dataset.userRole, 'cliente');
  assert.equal(requests[1].options.headers.has('X-CSRF-Token'), false);
  assert.equal(requests[2].options.headers.get('X-CSRF-Token'), session.csrfToken);
  assert.equal(requests[2].options.headers.get('Content-Type'), 'application/json');
  assert.equal(requests[3].options.headers.has('Content-Type'), false, 'browser sets the multipart boundary');
  await assert.rejects(client.authFetch('https://another.test/upload', { method: 'POST' }), /endereço desta aplicação/);
  assert.equal(requests.length, 4, 'never send the token to another origin');
});

test('missing, malformed and unavailable sessions fail closed', async () => {
  for (const result of [response(401, {}), response(503, {}), response(200, { ...session, user: { role: 'owner' } }), new Error('offline')]) {
    const { client, root, requests, redirects } = fixture({ result });
    assert.equal(await client.ready, null);
    assert.equal(root.dataset.userRole, '');
    assert.notEqual(root.dataset.authState, 'authenticated');
    await assert.rejects(client.authFetch('/api/products'), /sessão/);
    assert.equal(requests.length, 1);
    assert.equal(redirects.length, result.status === 401 ? 1 : 0);
  }
});

test('expired API session clears role and redirects once with a local next destination', async () => {
  const { client, root, redirects } = fixture({ actionStatus: 401 });
  await client.authFetch('/api/products');
  assert.equal(root.dataset.authState, 'anonymous');
  assert.equal(root.dataset.userRole, '');
  assert.equal(client.getSession(), null);
  assert.deepEqual(redirects, ['/login?next=%2Fcatalogo%3Fq%3Dproduto']);
  await assert.rejects(client.authFetch('/api/products'), /sessão/);
  assert.equal(redirects.length, 1);
  for (const pathname of ['//another.test', '/\\another.test', 'https://another.test']) {
    assert.equal(loginUrl({ pathname }), '/login?next=%2F');
  }
});

test('logout sends the CSRF token and clears the in-memory session', async () => {
  const { client, requests, redirects, root } = fixture({ actionStatus: 204 });
  await client.logout();
  const request = requests.at(-1);
  assert.equal(request.url, '/api/auth/logout');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.get('X-CSRF-Token'), session.csrfToken);
  assert.equal(request.options.body, '{}');
  assert.equal(client.getSession(), null);
  assert.equal(root.dataset.userRole, '');
  assert.deepEqual(redirects, ['/login']);
});

test('legacy logout cleanup removes only private image caches and tolerates unavailable storage', async () => {
  const removed = [];
  await clearLegacyImageCaches({
    async keys() { return ['vidamix-images-v10', 'vidamix-images-v11', 'vidamix-shell-v12', 'another-app']; },
    async delete(name) { removed.push(name); },
  });
  assert.deepEqual(removed, ['vidamix-images-v10', 'vidamix-images-v11']);
  await clearLegacyImageCaches({ async keys() { throw new Error('denied'); } });
  await clearLegacyImageCaches(null);
});

test('offline page does not request or reveal private navigation', async () => {
  const { client, requests, redirects, root } = fixture({ offline: true });
  assert.equal(await client.ready, null);
  assert.equal(root.dataset.authState, 'offline');
  assert.deepEqual(requests, []);
  assert.deepEqual(redirects, []);
  assert.deepEqual(getHeaderDestinations(null), []);
});

test('customer navigation and tour offer the allowed creation tools and consultation', () => {
  assert.deepEqual(getHeaderDestinations('cliente').map(({ screen }) => screen), ['catalogue', 'stories', 'feed', 'indoor']);
  assert.equal(getHeaderDestinations('admin').length, 7);
  const tour = getTour('catalogue', { role: 'cliente' });
  assert.match(tour.steps.find(({ id }) => id === 'results').description, /consultar/);
  assert.doesNotMatch(JSON.stringify(tour), /editar|Cadastre|Novo produto/);
});
