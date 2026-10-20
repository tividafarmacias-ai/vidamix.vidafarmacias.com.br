import mysql from 'mysql2/promise';

const userColumns = 'id, nome, email, senha, ativo, deleted, role';
const emailQuery = `SELECT ${userColumns} FROM cliente WHERE LOWER(TRIM(email)) = ? LIMIT 2`;
const idQuery = `SELECT ${userColumns} FROM cliente WHERE id = ? LIMIT 1`;
const connectionQuery = `SELECT ${userColumns} FROM cliente LIMIT 0`;

function databaseUnavailable() {
  // Driver errors can contain credentials, hostnames, SQL and user data.
  const error = new Error('Não foi possível consultar a base de usuários.');
  error.code = 'AUTH_DATABASE_UNAVAILABLE';
  return error;
}

function userFromRow(row) {
  return {
    id: String(row.id),
    name: String(row.nome ?? '').trim(),
    email: String(row.email ?? '').trim().toLowerCase(),
    passwordHash: typeof row.senha === 'string' ? row.senha : '',
    role: typeof row.role === 'string' ? row.role : '',
    active: Number(row.ativo) === 1 && Number(row.deleted || 0) === 0,
  };
}

export function createMysqlUserRepository(config, { createPool = mysql.createPool } = {}) {
  let pool;
  try {
    pool = createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      ...(config.ssl ? { ssl: config.ssl } : {}),
      charset: 'utf8mb4',
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 50,
      connectTimeout: 10_000,
      enableKeepAlive: true,
      multipleStatements: false,
    });
  } catch {
    throw databaseUnavailable();
  }
  let closing;

  async function select(sql, parameters = []) {
    if (closing) throw databaseUnavailable();
    try {
      const [rows] = await pool.execute(sql, parameters);
      return rows;
    } catch {
      throw databaseUnavailable();
    }
  }

  return {
    async findByEmail(email) {
      if (typeof email !== 'string') return null;
      const normalized = email.trim().toLowerCase();
      if (!normalized || normalized.length > 254) return null;
      const rows = await select(emailQuery, [normalized]);
      // Never pick an arbitrary account when existing records share an email.
      return rows.length === 1 ? userFromRow(rows[0]) : null;
    },

    async findById(id) {
      if (typeof id !== 'string' && typeof id !== 'number') return null;
      const normalized = String(id);
      if (!/^[1-9]\d{0,19}$/.test(normalized)) return null;
      const rows = await select(idQuery, [normalized]);
      return rows.length === 1 ? userFromRow(rows[0]) : null;
    },

    async checkConnection() {
      // Validate both connectivity and the expected schema without loading records.
      await select(connectionQuery);
      return true;
    },

    close() {
      if (!closing) {
        closing = Promise.resolve().then(() => pool.end()).catch(() => {
          throw databaseUnavailable();
        });
      }
      return closing;
    },
  };
}
