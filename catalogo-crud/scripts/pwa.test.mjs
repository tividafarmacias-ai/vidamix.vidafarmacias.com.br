import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { before, after, test } from 'node:test';
import vm from 'node:vm';
import { createApplication } from '../src/app.mjs';
import { adminAuthFixture, fixtureSessionHeaders } from './fixtures/auth.mjs';
import { loadConfig } from '../src/config.mjs';
import { checkPwaDeployment } from './pwa-deployment-check.mjs';

const config = loadConfig({ APP_AUTH_ENABLED: 'false' });
const workerSource = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const clientSource = await readFile(new URL('../public/js/pwa.js', import.meta.url), 'utf8');
const servers = [];
let origin;

async function startServer(appConfig, simulateApache = false, authService = adminAuthFixture()) {
  const app = createApplication({ config: appConfig, database: {}, authService });
  const server = createServer((request, response) => {
    // Plesk/Apache can own /icons/ and serve unknown extensions without a MIME type.
    if (simulateApache && request.url.startsWith('/icons/')) {
      response.writeHead(404, { 'Content-Type': 'text/html' });
      response.end('<h1>Not Found</h1>');
      return;
    }
    if (simulateApache && request.url.startsWith('/manifest.webmanifest')) {
      response.writeHead(200);
      response.end('{"display":"standalone"}');
      return;
    }
    app(request, response);
  });
  servers.push(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
before(async () => { origin = await startServer(config); });
after(async () => {
  await Promise.all(servers.map((server) => new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  })));
});

test('production without an authentication service fails closed and never enables legacy Basic access', async () => {
  const production = loadConfig({ NODE_ENV: 'production' });
  const protectedOrigin = await startServer(production, false, null);
  for (const route of ['/', '/catalogo', '/artes/stories', '/artes/feed', '/artes/indoor-h']) {
    const response = await fetch(protectedOrigin + route, { redirect: 'manual' });
    assert.equal(response.status, 302, route);
    assert.match(response.headers.get('location'), /^\/login(?:\?|$)/);
    assert.equal(response.headers.get('www-authenticate'), null, route);
  }
  for (const route of ['/api/health', '/api/auth/session']) {
    assert.equal((await fetch(protectedOrigin + route)).status, 401, route);
  }
  for (const route of ['/login', '/sw.js']) {
    assert.equal((await fetch(protectedOrigin + route)).status, 200, route);
  }
  const legacy = await startServer(loadConfig({ NODE_ENV: 'production', APP_AUTH_ENABLED: 'false',
    APP_AUTH_USERNAME: 'old-user', APP_AUTH_PASSWORD: 'old-password' }), false, null);
  const response = await fetch(legacy + '/api/health', {
    headers: { Authorization: `Basic ${Buffer.from('old-user:old-password').toString('base64')}` },
  });
  assert.equal(response.status, 401);
});

test('todas as entradas oferecem o manifesto e a marca; ícones têm dimensões reais', async () => {
  for (const route of ['/', '/catalogo', '/artes/stories', '/artes/feed', '/artes/indoor-h',
    '/index.html', '/catalogo.html', '/stories.html', '/feed.html', '/indoor-h.html']) {
    const response = await fetch(origin + route);
    assert.equal(response.status, 200, route);
    const html = await response.text();
    assert.match(html, /rel="manifest" href="\/manifest.json\?v=2"/);
    assert.match(html, /src="\/js\/pwa.js" defer/);
    assert.match(html, /<header[\s\S]*src="\/branding\/vida-horizontal.png"[\s\S]*?<\/header>/);
    assert.match(html, /rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon.png\?v=2"/);
    assert.doesNotMatch(html, /(?:href|src)="\/icons\//);
  }
  const response = await fetch(origin + '/manifest.json?v=2');
  assert.match(response.headers.get('content-type'), /^application\/json/);
  const manifest = await response.json();
  assert.deepEqual(await (await fetch(origin + '/manifest.webmanifest')).json(), manifest, 'Manifesto antigo mantém os ícones atuais');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.id, '/');
  for (const icon of [...manifest.icons,
    { src: '/apple-touch-icon.png?v=2', sizes: '180x180' },
    { src: '/apple-touch-icon-precomposed.png', sizes: '180x180' },
  ]) {
    assert.ok(!icon.src.startsWith('/icons/'));
    const iconResponse = await fetch(origin + icon.src);
    assert.equal(iconResponse.status, 200);
    assert.equal(iconResponse.headers.get('content-type'), 'image/png');
    const png = Buffer.from(await iconResponse.arrayBuffer());
    assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
  const workerResponse = await fetch(origin + '/sw.js');
  assert.equal(workerResponse.status, 200);
  assert.match(workerResponse.headers.get('content-type'), /^text\/javascript/);
  assert.equal(workerResponse.headers.get('cache-control'), 'no-store');
});

test('metadados e ícones aceitam GET/HEAD sem senha; páginas e API continuam protegidas', async () => {
  const protectedOrigin = await startServer(config, false, adminAuthFixture({ requireHeader: true }));
  const headers = fixtureSessionHeaders;
  for (const route of ['/', '/catalogo', '/artes/stories', '/api/health']) {
    assert.equal((await fetch(protectedOrigin + route, { redirect: 'manual' })).status,
      route.startsWith('/api/') ? 401 : 302, route);
    assert.equal((await fetch(protectedOrigin + route, { headers })).status, 200, route);
  }
  for (const route of ['/manifest.json?v=2', '/manifest.webmanifest', '/apple-touch-icon.png?v=2',
    '/apple-touch-icon-precomposed.png', '/pwa-icons/icon-192.png', '/pwa-icons/icon-512.png',
    '/pwa-icons/icon-maskable-512.png', '/pwa-icons/apple-touch-icon.png']) {
    for (const method of ['GET', 'HEAD']) {
      const response = await fetch(protectedOrigin + route, { method });
      assert.equal(response.status, 200, `${method} ${route}`);
      assert.equal(response.headers.get('www-authenticate'), null);
      assert.ok(Number(response.headers.get('content-length')) > 0);
      if (method === 'HEAD') assert.equal(await response.text(), '');
    }
    assert.equal((await fetch(protectedOrigin + route, { method: 'POST' })).status, 401);
  }
  for (const route of ['/sw.js', '/offline.html', '/js/pwa.js']) {
    assert.equal((await fetch(protectedOrigin + route)).status, 200, route);
  }
  for (const route of ['/pwa-icons/%2e%2e%2findex.html', '/manifest.json/extra']) {
    assert.notEqual((await fetch(protectedOrigin + route, { redirect: 'manual' })).status, 200, route);
  }
  const report = await checkPwaDeployment(protectedOrigin);
  assert.deepEqual(report.issues, []);
  assert.equal(report.warnings.length, 1);
});

test('instalação independe do alias /icons/ e do MIME de .webmanifest no proxy', async () => {
  const proxyOrigin = await startServer(config, true);
  const report = await checkPwaDeployment(proxyOrigin);
  assert.deepEqual(report.issues, []);
  assert.ok(report.checked.includes('/manifest.json?v=2'));
  assert.ok(report.checked.includes('/apple-touch-icon.png?v=2'));
  assert.ok(report.checked.every((url) => !url.startsWith('/icons/') && !url.endsWith('.webmanifest')));
});

function workerHarness() {
  const handlers = new Map();
  const stores = new Map([['another-app-cache', new Map()], ['vidamix-offline-old', new Map()]]);
  const state = { fetch: (request) => fetch(request), claimed: false, stores };
  const key = (request) => new URL(typeof request === 'string' ? request : request.url, origin).href;
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        addAll: async (requests) => {
          for (const request of requests) {
            assert.equal(request.credentials, 'same-origin');
            const response = await state.fetch(request);
            assert.ok(response.ok, `Precache indisponível: ${request.url}`);
            store.set(key(request), response);
          }
        },
        match: async (request) => store.get(key(request))?.clone(),
        keys: async () => [...store.keys()].map((url) => ({ url })),
        put: async (request, response) => { store.set(key(request), response); },
        delete: async (request) => store.delete(key(request)),
      };
    },
  };
  vm.runInNewContext(workerSource, {
    URL, Response, caches,
    Request: class extends Request {
      constructor(url, options) { super(new URL(typeof url === 'object' ? url.url : url, origin), options); }
    },
    fetch: (request) => state.fetch(request),
    self: {
      location: { origin },
      addEventListener: (type, handler) => handlers.set(type, handler),
      skipWaiting: async () => { state.replacedLegacyWorker = true; },
      clients: { claim: async () => { state.claimed = true; } },
    },
  });
  state.lifecycle = async (type) => {
    let work;
    handlers.get(type)({ waitUntil: (promise) => { work = promise; } });
    await work;
  };
  state.request = (pathname, options = {}) => {
    let response = null;
    handlers.get('fetch')({
      request: { url: new URL(pathname, origin).href, method: 'GET', mode: 'navigate', ...options },
      respondWith: (promise) => { response = promise; },
    });
    return response;
  };
  return state;
}

test('service worker instala recursos existentes e oferece fallback offline nas rotas e aliases', async () => {
  const worker = workerHarness();
  await worker.lifecycle('install');
  await worker.lifecycle('activate');
  assert.ok(worker.claimed);
  assert.ok(worker.replacedLegacyWorker, 'legacy workers must stop serving cached protected images');
  assert.ok(worker.stores.has('another-app-cache'));
  assert.ok(!worker.stores.has('vidamix-offline-old'));
  worker.fetch = async () => { throw new TypeError('offline'); };
  for (const pathname of ['/', '/catalogo', '/artes/feed?productId=42', '/artes/stories/', '/artes/indoor-h', '/feed.html']) {
    const response = await worker.request(pathname);
    assert.match(await response.text(), /Vamos reconectar/);
  }
  for (const pathname of ['/brand.css', '/pwa.css', '/branding/vida-horizontal.png', '/js/pwa.js']) {
    assert.equal((await worker.request(pathname, { mode: 'cors' })).status, 200);
  }
});

test('worker mantém respostas online e erros de autenticação; não intercepta APIs ou gravações', async () => {
  const worker = workerHarness();
  await worker.lifecycle('install');
  for (const status of [200, 401, 403, 500]) {
    worker.fetch = async () => new Response(`server-${status}`, { status });
    const response = await worker.request('/catalogo');
    assert.equal(response.status, status);
    assert.equal(await response.text(), `server-${status}`);
  }
  for (const path of ['/api/products', 'https://example.com/']) {
    assert.equal(worker.request(path), null);
  }
  assert.equal(worker.request('/catalogo', { method: 'POST' }), null);
  for (const cache of worker.stores.values()) assert.ok(!cache.has(origin + '/catalogo'));
});

test('protected images, thumbnails and render variants always reach the server, including versioned URLs', async () => {
  const worker = workerHarness();
  await worker.lifecycle('install');
  const requests = [];
  worker.fetch = async request => {
    requests.push(request);
    return new Response('authenticated image', { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'no-store' } });
  };
  for (const pathname of ['/assets/imagens/product.webp?v=1', '/story-backgrounds/a.png?v=1',
    '/feed-backgrounds/a.webp?v=1&variant=thumb-v1', '/indoor-backgrounds/a.webp?v=1&variant=render-v1',
    '/assets/imagens/product.png']) {
    assert.equal((await worker.request(pathname, { mode: 'cors' })).status, 200, pathname);
    assert.equal(requests.at(-1).cache, 'no-store', 'old browser image caches cannot bypass session checks');
    assert.equal(requests.at(-1).url, origin + pathname);
    for (const cache of worker.stores.values()) assert.ok(!cache.has(origin + pathname));
  }
  for (const status of [401, 403]) {
    worker.fetch = async () => new Response('denied', { status });
    assert.equal((await worker.request('/assets/imagens/product.webp?v=1', { mode: 'cors' })).status, status);
  }
  worker.fetch = async () => { throw new Error('offline'); };
  await assert.rejects(worker.request('/assets/imagens/product.webp?v=1', { mode: 'cors' }), /offline/);
});

test('activation clears every legacy image cache while preserving unrelated application caches', async () => {
  const worker = workerHarness();
  worker.stores.set('vidamix-images-v1', new Map([[origin + '/assets/imagens/product.webp?v=1', new Response('private')]]));
  worker.stores.set('vidamix-images-old', new Map());
  await worker.lifecycle('install');
  await worker.lifecycle('activate');
  assert.ok(!worker.stores.has('vidamix-images-v1'));
  assert.ok(!worker.stores.has('vidamix-images-old'));
  assert.ok(worker.stores.has('another-app-cache'));
  assert.ok([...worker.stores.keys()].some(name => name.startsWith('vidamix-offline-')));
});

function clientHarness({ apple = false, standalone = false, secure = true } = {}) {
  const eventHost = () => {
    const listeners = new Map();
    return {
      addEventListener: (name, listener) => listeners.set(name, listener),
      dispatch: async (name, event = {}) => listeners.get(name)?.(event),
    };
  };
  const button = { ...eventHost(), hidden: true, disabled: false };
  const help = { hidden: true, textContent: '' };
  const media = { ...eventHost(), matches: standalone };
  const registrations = [];
  const window = { ...eventHost(), matchMedia: () => media, isSecureContext: secure };
  vm.runInNewContext(clientSource, {
    window, console: { warn() {} },
    navigator: {
      userAgent: apple ? 'iPhone' : 'Chrome',
      serviceWorker: { register: async (...args) => { registrations.push(args); } },
    },
    document: {
      readyState: 'complete',
      querySelector: (selector) => ({ '[data-pwa-install]': button, '[data-pwa-help]': help })[selector],
    },
  });
  return { window, button, help, media, registrations };
}

test('instalação só oferece prompt disponível, trata recusa e oculta o botão quando instalado', async () => {
  const client = clientHarness();
  assert.equal(client.button.hidden, true);
  assert.equal(client.registrations[0][0], '/sw.js');
  let prompts = 0;
  const event = (outcome) => ({
    preventDefault() {},
    prompt: async () => { prompts++; },
    userChoice: Promise.resolve({ outcome }),
  });
  await client.window.dispatch('beforeinstallprompt', event('dismissed'));
  assert.equal(client.button.hidden, false);
  await client.button.dispatch('click');
  assert.equal(prompts, 1);
  assert.equal(client.button.hidden, true);
  await client.window.dispatch('beforeinstallprompt', event('accepted'));
  await client.button.dispatch('click');
  assert.equal(prompts, 2);
  assert.equal(client.button.hidden, true);
  assert.equal(client.button.disabled, false);
});

test('iOS recebe instruções e standalone/HTTP inseguro não oferece instalação', async () => {
  const apple = clientHarness({ apple: true });
  assert.equal(apple.button.hidden, false);
  await apple.button.dispatch('click');
  assert.equal(apple.help.hidden, false);
  assert.match(apple.help.textContent, /Adicionar à Tela de Início/);
  await apple.window.dispatch('appinstalled');
  assert.equal(apple.button.hidden, true);
  assert.equal(apple.help.hidden, true);
  assert.equal(clientHarness({ apple: true, standalone: true }).button.hidden, true);
  const insecure = clientHarness({ secure: false, apple: true });
  assert.equal(insecure.button.hidden, true);
  assert.equal(insecure.registrations.length, 0);
});
