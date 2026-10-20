import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig, validateLoginConfig } from '../src/config.mjs';
import { assertSameOrigin } from '../src/modules/auth/auth-service.mjs';

const databaseEnvironment = Object.freeze({
  DB_HOST: 'mysql.example.test',
  DB_USER: 'test_reader',
  DB_PASSWORD: 'synthetic-test-password',
  DB_NAME: 'fixture_users',
});

test('login configuration requires every MySQL credential even when legacy authentication was disabled', () => {
  for (const absent of Object.keys(databaseEnvironment)) {
    const env = { ...databaseEnvironment, [absent]: '', APP_AUTH_ENABLED: 'false' };
    assert.throws(() => validateLoginConfig(loadConfig(env)), /DB_HOST.*DB_USER.*DB_PASSWORD.*DB_NAME/);
  }
  assert.throws(() => validateLoginConfig(loadConfig({ APP_AUTH_ENABLED: 'false' })), /Configure DB_HOST/);
  assert.doesNotThrow(() => validateLoginConfig(loadConfig(databaseEnvironment)));
});

test('configuration defaults to eight-hour sessions, Secure production cookies and no trusted proxy', () => {
  const development = loadConfig({ NODE_ENV: 'development' });
  const production = loadConfig({ NODE_ENV: 'production' });
  assert.equal(production.auth.sessionDurationMs, 8 * 60 * 60 * 1000);
  assert.equal(production.auth.secureCookies, true);
  assert.equal(development.auth.secureCookies, false);
  assert.equal(production.auth.trustProxy, false);
  assert.equal(development.auth.trustProxy, false);
  assert.equal(production.auth.origin, '');
  assert.ok(Object.isFrozen(production.auth));
  assert.ok(Object.isFrozen(production.mysql));
  assert.equal(Object.hasOwn(production.auth, 'enabled'), false, 'authentication has no public-access switch');
});

test('explicit cookie and proxy booleans are parsed strictly', () => {
  for (const [value, expected] of [['true', true], ['1', true], ['yes', true], ['on', true],
    ['false', false], ['0', false], ['no', false], ['off', false]]) {
    const { auth } = loadConfig({ AUTH_COOKIE_SECURE: value, AUTH_TRUST_PROXY: value });
    assert.equal(auth.secureCookies, expected, value);
    assert.equal(auth.trustProxy, expected, value);
  }
  for (const key of ['AUTH_COOKIE_SECURE', 'AUTH_TRUST_PROXY', 'DB_SSL']) {
    assert.throws(() => loadConfig({ [key]: 'perhaps' }), new RegExp(key));
  }
});

test('public origin accepts only an HTTP(S) origin without credentials, path, query or fragment', () => {
  for (const value of ['https://studio.example.test', 'https://studio.example.test/',
    'http://localhost:3333', 'https://STUDIO.EXAMPLE.TEST:443']) {
    assert.equal(loadConfig({ APP_ORIGIN: value }).auth.origin, new URL(value).origin);
  }
  for (const value of ['not a URL', '//example.test', 'file:///app', 'ftp://example.test',
    'https://user:secret@example.test', 'https://example.test/path', 'https://example.test/?next=1',
    'https://example.test/#fragment', 'https://example.test:99999']) {
    assert.throws(() => loadConfig({ APP_ORIGIN: value }), value);
  }
});

test('MySQL port and TLS settings use validated values', () => {
  assert.equal(loadConfig({}).mysql.port, 3306);
  assert.equal(loadConfig({ DB_PORT: '3307' }).mysql.port, 3307);
  for (const value of ['0', '-1', '65536', '3306.5', 'invalid']) {
    assert.throws(() => loadConfig({ DB_PORT: value }), /DB_PORT/);
  }
  assert.deepEqual(loadConfig({ DB_SSL: 'true' }).mysql.ssl, { rejectUnauthorized: true });
  assert.equal(loadConfig({ DB_SSL: 'false' }).mysql.ssl, undefined);
});

test('Origin uses the configured external origin behind a proxy', () => {
  const options = loadConfig({ APP_ORIGIN: 'https://studio.example.test' }).auth;
  const request = { headers: { host: '127.0.0.1:3333', origin: 'https://studio.example.test' }, socket: {} };
  assert.doesNotThrow(() => assertSameOrigin(request, options));
  for (const origin of ['http://127.0.0.1:3333', 'https://evil.example', 'null', undefined]) {
    assert.throws(() => assertSameOrigin({ ...request, headers: { ...request.headers, origin } }, options),
      error => error.statusCode === 403);
  }
});

test('production HTTPS cookies allow the HTTPS site behind TLS termination without trusting forwarded headers', () => {
  const options = loadConfig({ NODE_ENV: 'production' }).auth;
  const request = { headers: { host: 'studio.example.test', origin: 'https://studio.example.test' }, socket: {} };
  assert.equal(options.secureCookies, true);
  assert.equal(options.trustProxy, false);
  assert.doesNotThrow(() => assertSameOrigin(request, options));
  assert.throws(() => assertSameOrigin({ ...request, headers: { ...request.headers, origin: 'http://studio.example.test' } }, options),
    error => error.statusCode === 403);
});

test('forwarded HTTPS is trusted only with an explicit proxy setting; forwarded host cannot replace Host', () => {
  const request = { headers: { host: 'studio.example.test', origin: 'https://studio.example.test',
    'x-forwarded-proto': 'https', 'x-forwarded-host': 'evil.example' }, socket: {} };
  assert.throws(() => assertSameOrigin(request, { trustProxy: false }), error => error.statusCode === 403);
  assert.doesNotThrow(() => assertSameOrigin(request, { trustProxy: true }));
  assert.doesNotThrow(() => assertSameOrigin({ ...request, socket: { encrypted: true } }, { trustProxy: false }));
  assert.throws(() => assertSameOrigin({ ...request, headers: { ...request.headers, origin: 'https://evil.example' } },
    { trustProxy: true }), error => error.statusCode === 403);
});

test('cross-site fetch metadata rejects a request even when its Origin matches', () => {
  const request = { headers: { host: 'studio.example.test', origin: 'http://studio.example.test',
    'sec-fetch-site': 'cross-site' }, socket: {} };
  assert.throws(() => assertSameOrigin(request), error => error.statusCode === 403);
});
