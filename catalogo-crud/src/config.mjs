import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(sourceDirectory, '..');

function getPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : 3333;
}

function resolveConfiguredPath(value, fallback) {
  const configuredValue = String(value || '').trim();
  if (!configuredValue) return path.resolve(fallback);
  return path.isAbsolute(configuredValue)
    ? path.normalize(configuredValue)
    : path.resolve(projectDirectory, configuredValue);
}

function getBoolean(value, fallback, name) {
  if (value === undefined || value === null || value === '') return fallback;

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`${name} deve ser true ou false.`);
}

export function loadProjectEnvironment() {
  try { loadEnvFile(path.join(projectDirectory, '.env')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

export function validateLoginConfig(config) {
  if (!config.mysql.host || !config.mysql.user || !config.mysql.database || !config.mysql.password) {
    throw new Error('Configure DB_HOST, DB_USER, DB_PASSWORD e DB_NAME no .env para habilitar o login.');
  }
}

/**
 * Centralizes paths and runtime options so modules do not need to read process.env.
 * Passing a different env object also makes the application easier to exercise in tests.
 */
export function loadConfig(env = process.env) {
  const environment = String(env.NODE_ENV || 'development').trim().toLowerCase();
  const storageDirectory = resolveConfiguredPath(
    env.CATALOG_STORAGE_ROOT,
    path.join(projectDirectory, 'data'),
  );
  const databasePath = resolveConfiguredPath(
    env.CATALOG_DATABASE_PATH,
    path.join(storageDirectory, 'catalogo.sqlite'),
  );
  const mysqlPort = Number(env.DB_PORT || 3306);
  if (!Number.isInteger(mysqlPort) || mysqlPort < 1 || mysqlPort > 65535) {
    throw new Error('DB_PORT deve ser uma porta MySQL válida.');
  }
  let origin = '';
  if (env.APP_ORIGIN) {
    const parsed = new URL(env.APP_ORIGIN);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password
      || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new Error('APP_ORIGIN deve conter apenas a origem HTTP/HTTPS da aplicação.');
    }
    origin = parsed.origin;
  }

  return Object.freeze({
    projectDirectory,
    environment,
    publicDirectory: path.join(projectDirectory, 'public'),
    storageDirectory,
    dataDirectory: path.dirname(databasePath),
    databasePath,
    storyBackgroundsDirectory: resolveConfiguredPath(
      env.STORY_BACKGROUNDS_ROOT,
      path.join(projectDirectory, 'camas-stories'),
    ),
    feedBackgroundsDirectory: resolveConfiguredPath(
      env.FEED_BACKGROUNDS_ROOT,
      path.join(projectDirectory, 'camas-feed'),
    ),
    indoorBackgroundsDirectory: resolveConfiguredPath(
      env.INDOOR_BACKGROUNDS_ROOT,
      path.join(projectDirectory, 'camas-indoor-h'),
    ),
    sourceCatalogPath: resolveConfiguredPath(
      env.CATALOG_SOURCE,
      path.join(projectDirectory, '..', 'produtos.json'),
    ),
    sourceManifestPath: resolveConfiguredPath(
      env.MANIFEST_SOURCE,
      path.join(projectDirectory, '..', 'imagens-produtos', 'manifesto-imagens.json'),
    ),
    imagesDirectory: resolveConfiguredPath(
      env.IMAGES_ROOT,
      path.join(projectDirectory, '..', 'imagens-produtos'),
    ),
    port: getPort(env.PORT || env.CATALOGO_PORT),
    mysql: Object.freeze({
      host: String(env.DB_HOST || '').trim(),
      port: mysqlPort,
      user: String(env.DB_USER || '').trim(),
      password: String(env.DB_PASSWORD || ''),
      database: String(env.DB_NAME || '').trim(),
      ...(getBoolean(env.DB_SSL, false, 'DB_SSL') ? { ssl: { rejectUnauthorized: true } } : {}),
    }),
    auth: Object.freeze({
      origin,
      secureCookies: getBoolean(env.AUTH_COOKIE_SECURE, environment === 'production', 'AUTH_COOKIE_SECURE'),
      trustProxy: getBoolean(env.AUTH_TRUST_PROXY, false, 'AUTH_TRUST_PROXY'),
      sessionDurationMs: 8 * 60 * 60 * 1000,
    }),
  });
}
