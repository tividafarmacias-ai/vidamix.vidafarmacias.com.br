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

const config = loadConfig(process.env);
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

  console.log(`Smoke test aprovado em ${checks.length} rotas.`);
} finally {
  await close(server);
  database.close();
}
