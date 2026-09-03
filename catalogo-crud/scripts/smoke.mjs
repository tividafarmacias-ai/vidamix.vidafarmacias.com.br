import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApplication } from '../src/app.mjs';
import { loadConfig } from '../src/config.mjs';
import { initializeCatalogDatabase } from '../src/database/catalog-database.mjs';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

const config = loadConfig({
  ...process.env,
  NODE_ENV: 'test',
  APP_AUTH_ENABLED: 'false',
});
const database = await initializeCatalogDatabase(config);
const app = createApplication({ config, database, logger: { error() {} } });
const server = createServer(app);

try {
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const checks = [
    ['/', 200, 'text/html'],
    ['/catalogo', 200, 'text/html'],
    ['/catalogue.css', 200, 'text/css'],
    ['/artes/stories', 200, 'text/html'],
    ['/artes/stories?productId=1', 200, 'text/html'],
    ['/stories.html', 200, 'text/html'],
    ['/api/health', 200, 'application/json'],
    ['/api/summary', 200, 'application/json'],
    ['/api/products?imagem=com&status=ativo&page=1&pageSize=2', 200, 'application/json'],
    ['/js/features/stories/editor.js', 200, 'text/javascript'],
    ['/api/inexistente', 404, 'application/json'],
    ['/assets/arquivo-fora-do-escopo.png', 403, 'application/json'],
    ['/story-backgrounds/imagens%20originais/arquivo.png', 403, 'application/json'],
  ];

  for (const [pathname, expectedStatus, expectedContentType] of checks) {
    const response = await fetch(baseUrl + pathname);
    assert.equal(response.status, expectedStatus, `${pathname} retornou ${response.status}`);
    assert.match(
      response.headers.get('content-type') || '',
      new RegExp('^' + expectedContentType.replace('/', '\\/')),
      `${pathname} retornou Content-Type inesperado`,
    );
  }

  const rejectedWrite = await fetch(baseUrl + '/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: '{}',
  });
  assert.equal(rejectedWrite.status, 400, 'API aceitou conteúdo não JSON');

  const authenticatedConfig = {
    ...config,
    auth: {
      enabled: true,
      username: 'smoke-user',
      password: 'smoke-password',
      realm: 'Smoke Test',
    },
  };
  const authenticatedServer = createServer(
    createApplication({ config: authenticatedConfig, database, logger: { error() {} } }),
  );

  try {
    const authenticatedPort = await listen(authenticatedServer);
    const authenticatedBaseUrl = 'http://127.0.0.1:' + authenticatedPort;
    const deniedResponse = await fetch(authenticatedBaseUrl + '/api/health');
    assert.equal(deniedResponse.status, 401, 'Aplicação protegida aceitou acesso sem credenciais');
    assert.match(
      deniedResponse.headers.get('www-authenticate') || '',
      /^Basic /,
      'Aplicação protegida não informou desafio Basic',
    );

    const authorization = 'Basic ' + Buffer.from('smoke-user:smoke-password').toString('base64');
    const acceptedResponse = await fetch(authenticatedBaseUrl + '/api/health', {
      headers: { Authorization: authorization },
    });
    assert.equal(acceptedResponse.status, 200, 'Aplicação protegida rejeitou credenciais válidas');
  } finally {
    await close(authenticatedServer);
  }

  console.log(`Smoke test aprovado em ${checks.length} rotas e controles de produção.`);
} finally {
  await close(server);
  database.close();
}
