import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError } from '../../http/errors.mjs';
import { verifyPassword } from './passwords.mjs';

const COOKIE_NAME = 'vidamix_session';
const roles = new Set(['admin', 'cliente']);
const digest = (value) => createHash('sha256').update(String(value)).digest('hex');
const safeEqual = (left, right) => timingSafeEqual(Buffer.from(digest(left)), Buffer.from(digest(right)));
const invalidLogin = () => new HttpError(401, 'E-mail ou senha inválidos.');
const unavailable = () => new HttpError(503, 'Não foi possível verificar seu acesso. Tente novamente em instantes.', { expose: true });

function cookieToken(request) {
  const matches = String(request.headers.cookie || '').split(';')
    .map((part) => part.trim()).filter((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(COOKIE_NAME.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

function protocol(request, options) {
  if (request.socket.encrypted) return 'https';
  if (options.trustProxy && request.headers['x-forwarded-proto'] === 'https') return 'https';
  return 'http';
}

export function assertSameOrigin(request, options = {}) {
  // Production cookies require HTTPS even when a TLS-terminating proxy connects
  // to Node over HTTP. No forwarded header is trusted by default.
  const expected = options.origin || `${options.secureCookies ? 'https' : protocol(request, options)}://${request.headers.host}`;
  if (request.headers['sec-fetch-site'] === 'cross-site' || request.headers.origin !== expected) {
    throw new HttpError(403, 'Origem da requisição não permitida.');
  }
}

function publicUser(user) {
  return { id: String(user.id), name: String(user.name || 'Usuário'), role: user.role };
}

export function createAuthService({ users, database, config, now = Date.now }) {
  const options = config.auth;
  const duration = options.sessionDurationMs;
  database.exec(`
    CREATE TABLE IF NOT EXISTS vidamix_auth_sessions (
      token_hash TEXT PRIMARY KEY, cliente_id TEXT NOT NULL,
      password_fingerprint TEXT NOT NULL, csrf_token TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS vidamix_auth_sessions_expiry ON vidamix_auth_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS vidamix_auth_attempts (
      key_hash TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );
  `);
  const getStored = database.prepare('SELECT * FROM vidamix_auth_sessions WHERE token_hash = ? AND expires_at > ?');
  const remove = database.prepare('DELETE FROM vidamix_auth_sessions WHERE token_hash = ?');
  const insert = database.prepare('INSERT INTO vidamix_auth_sessions VALUES (?, ?, ?, ?, ?)');
  const attempt = database.prepare(`INSERT INTO vidamix_auth_attempts VALUES (?, 1, ?)
    ON CONFLICT(key_hash) DO UPDATE SET attempts = attempts + 1`);
  const getAttempts = database.prepare('SELECT attempts FROM vidamix_auth_attempts WHERE key_hash = ?');
  const clearAttempts = database.prepare('DELETE FROM vidamix_auth_attempts WHERE key_hash = ?');
  const cleanupSessions = database.prepare('DELETE FROM vidamix_auth_sessions WHERE expires_at <= ?');
  const cleanupAttempts = database.prepare('DELETE FROM vidamix_auth_attempts WHERE expires_at <= ?');
  let lastCleanup = 0;

  function setCookie(request, response, token, maxAge) {
    const secure = options.secureCookies || protocol(request, options) === 'https';
    response.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);
  }

  function cleanup() {
    if (now() - lastCleanup < 60000) return;
    cleanupSessions.run(now());
    cleanupAttempts.run(now());
    lastCleanup = now();
  }

  async function getSession(request) {
    cleanup();
    const token = cookieToken(request);
    if (!token) return null;
    const tokenHash = digest(token);
    const stored = getStored.get(tokenHash, now());
    if (!stored) return null;
    let user;
    try { user = await users.findById(stored.cliente_id); }
    catch { throw unavailable(); }
    if (!user?.active || !roles.has(user.role)
      || !safeEqual(stored.password_fingerprint, digest(user.passwordHash))) {
      remove.run(tokenHash);
      return null;
    }
    return { user: publicUser(user), csrfToken: stored.csrf_token, tokenHash };
  }

  function assertMutation(request, session) {
    assertSameOrigin(request, options);
    const token = request.headers['x-csrf-token'];
    if (typeof token !== 'string' || !session?.csrfToken || !safeEqual(token, session.csrfToken)) {
      throw new HttpError(403, 'Sua sessão precisa ser atualizada. Recarregue a página e tente novamente.');
    }
  }

  async function login(request, response, body) {
    assertSameOrigin(request, options);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!email || email.length > 255 || !password || Buffer.byteLength(password) > 1024) throw invalidLogin();
    cleanupAttempts.run(now());
    const forwarded = options.trustProxy ? String(request.headers['x-forwarded-for'] || '').split(',').at(-1)?.trim() : '';
    const address = forwarded || request.socket.remoteAddress || 'unknown';
    const accountKey = digest(`account:${email}`);
    const ipKey = digest(`ip:${address}`);
    for (const [key, limit] of [[accountKey, 10], [ipKey, 50]]) {
      if ((getAttempts.get(key)?.attempts || 0) >= limit) {
        response.setHeader('Retry-After', '900');
        throw new HttpError(429, 'Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.');
      }
    }
    // Count before awaiting MySQL/hash work, so concurrent attempts cannot bypass the limit.
    for (const key of [accountKey, ipKey]) attempt.run(key, now() + 15 * 60 * 1000);
    let user;
    try { user = await users.findByEmail(email); }
    catch { throw unavailable(); }
    const validPassword = await verifyPassword(password, user?.passwordHash || '$1$abcdefgh$G//4keteveJp0qb8z2DxG/');
    if (!user?.active || !roles.has(user.role) || !validPassword) throw invalidLogin();
    clearAttempts.run(accountKey);
    // Keep the IP budget for failed attempts, including attempts against other accounts.
    database.prepare('UPDATE vidamix_auth_attempts SET attempts = MAX(0, attempts - 1) WHERE key_hash = ?').run(ipKey);
    const previous = cookieToken(request);
    if (previous) remove.run(digest(previous));
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    insert.run(digest(token), String(user.id), digest(user.passwordHash), csrfToken, now() + duration);
    setCookie(request, response, token, Math.floor(duration / 1000));
    return { user: publicUser(user), csrfToken };
  }

  function logout(request, response, session) {
    assertMutation(request, session);
    remove.run(session.tokenHash);
    setCookie(request, response, '', 0);
  }

  return { getSession, login, logout, assertMutation };
}
