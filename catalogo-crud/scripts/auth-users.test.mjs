import assert from 'node:assert/strict';
import test from 'node:test';
import { createMysqlUserRepository } from '../src/modules/auth/mysql-users.mjs';

const config = { host: 'mysql.example.test', port: 3306, user: 'read_user', password: 'fixture-only', database: 'users' };
const row = {
  id: 42, nome: '  Usuário de Teste  ', email: ' Teste@Example.com ', senha: '$1$1234$ImZYBLmYC.rbBKg9ERxX70',
  ativo: 1, deleted: 0, role: 'cliente', telefone: 'not exposed', cpf: 'not exposed',
};

function fixture({ rows = [row], executeError, closeError } = {}) {
  const calls = [];
  let options;
  let closed = 0;
  const repository = createMysqlUserRepository(config, {
    createPool(poolOptions) {
      options = poolOptions;
      return {
        async execute(sql, parameters) {
          calls.push({ sql, parameters });
          if (executeError) throw executeError;
          return [rows, []];
        },
        async end() {
          closed += 1;
          if (closeError) throw closeError;
        },
      };
    },
  });
  return { repository, calls, get options() { return options; }, get closed() { return closed; } };
}

test('email lookup normalizes input and maps only required account fields', async () => {
  const f = fixture();
  const user = await f.repository.findByEmail(' TESTE@EXAMPLE.COM ');
  assert.deepEqual(user, {
    id: '42', name: 'Usuário de Teste', email: 'teste@example.com', passwordHash: row.senha, role: 'cliente', active: true,
  });
  assert.match(f.calls[0].sql, /WHERE LOWER\(TRIM\(email\)\) = \? LIMIT 2$/);
  assert.deepEqual(f.calls[0].parameters, ['teste@example.com']);
  assert.match(f.calls[0].sql, /^SELECT id, nome, email, senha, ativo, deleted, role FROM cliente /);
});

test('email values are sent as parameters rather than interpolated into SQL', async () => {
  const f = fixture({ rows: [] });
  const malicious = "' or 1=1 --@example.com";
  assert.equal(await f.repository.findByEmail(malicious), null);
  assert.equal(f.calls[0].sql.includes(malicious), false);
  assert.deepEqual(f.calls[0].parameters, [malicious]);
});

test('unknown and duplicate emails both fail closed', async () => {
  for (const rows of [[], [row, { ...row, id: 43, role: 'admin' }], [row, row, row]]) {
    const f = fixture({ rows });
    assert.equal(await f.repository.findByEmail('teste@example.com'), null);
  }
});

test('inactive, deleted and unset active values are not active accounts', async () => {
  for (const [ativo, deleted, expected] of [
    [1, 0, true], ['1', '0', true], [1, null, true], [1, undefined, true],
    [0, 0, false], [null, 0, false], [undefined, 0, false], [2, 0, false],
    [1, 1, false], [1, -1, false], [1, '2', false], [1, 'invalid', false],
  ]) {
    const f = fixture({ rows: [{ ...row, ativo, deleted }] });
    assert.equal((await f.repository.findById(42)).active, expected, `${ativo}/${deleted}`);
  }
});

test('unknown roles remain unchanged for the authorization service to reject', async () => {
  const f = fixture({ rows: [{ ...row, role: 'superuser', senha: null, nome: null, email: null }] });
  assert.deepEqual(await f.repository.findById('42'), {
    id: '42', name: '', email: '', passwordHash: '', role: 'superuser', active: true,
  });
});

test('ID lookup is parameterized and returns null for nonexistent users', async () => {
  const f = fixture();
  assert.equal((await f.repository.findById('42')).id, '42');
  assert.match(f.calls[0].sql, /WHERE id = \? LIMIT 1$/);
  assert.deepEqual(f.calls[0].parameters, ['42']);
  assert.equal(await fixture({ rows: [] }).repository.findById(42), null);
});

test('invalid identifiers and emails do not query the database', async () => {
  const f = fixture();
  for (const id of [null, undefined, {}, [], '', 0, -1, 1.5, Infinity, '1 OR 1=1', '0', '1'.repeat(21)]) {
    assert.equal(await f.repository.findById(id), null);
  }
  for (const email of [null, undefined, {}, [], '', '   ', 'a'.repeat(255)]) {
    assert.equal(await f.repository.findByEmail(email), null);
  }
  assert.equal(f.calls.length, 0);
});

test('connection check validates required schema without returning user records', async () => {
  const f = fixture({ rows: [] });
  assert.equal(await f.repository.checkConnection(), true);
  assert.equal(f.calls[0].sql, 'SELECT id, nome, email, senha, ativo, deleted, role FROM cliente LIMIT 0');
  assert.deepEqual(f.calls[0].parameters, []);
});

test('pool uses bounded connections and does not enable multiple statements', () => {
  const f = fixture();
  for (const [key, value] of Object.entries(config)) assert.equal(f.options[key], value);
  assert.equal(f.options.multipleStatements, false);
  assert.equal(f.options.charset, 'utf8mb4');
  assert.equal(f.options.connectionLimit, 5);
  assert.equal(f.options.queueLimit, 50);
  assert.equal(f.options.connectTimeout, 10_000);
  const ssl = { rejectUnauthorized: true };
  createMysqlUserRepository({ ...config, ssl, multipleStatements: true }, {
    createPool(options) {
      assert.equal(options.ssl, ssl);
      assert.equal(options.multipleStatements, false);
      return {};
    },
  });
});

function assertSanitized(error) {
  assert.equal(error.code, 'AUTH_DATABASE_UNAVAILABLE');
  assert.equal(error.message, 'Não foi possível consultar a base de usuários.');
  assert.equal(error.cause, undefined);
  assert.equal(error.sql, undefined);
  assert.equal(error.sqlMessage, undefined);
  assert.doesNotMatch(error.stack, /secret-credential|SELECT senha|private-database/);
  return true;
}

test('all database read failures are sanitized before leaving the repository', async () => {
  const driverError = Object.assign(new Error('secret-credential private-database SELECT senha'), {
    sql: 'SELECT senha', sqlMessage: 'secret-credential', code: 'ER_ACCESS_DENIED_ERROR',
  });
  const f = fixture({ executeError: driverError });
  await assert.rejects(f.repository.findByEmail('teste@example.com'), assertSanitized);
  await assert.rejects(f.repository.findById('42'), assertSanitized);
  await assert.rejects(f.repository.checkConnection(), assertSanitized);
  assert.throws(() => createMysqlUserRepository(config, {
    createPool() { throw driverError; },
  }), assertSanitized);
});

test('close ends the pool once and further reads are rejected', async () => {
  const f = fixture();
  await Promise.all([f.repository.close(), f.repository.close()]);
  assert.equal(f.closed, 1);
  await assert.rejects(f.repository.findById('42'), assertSanitized);
  assert.equal(f.calls.length, 0);
});

test('pool shutdown errors are sanitized', async () => {
  const f = fixture({ closeError: new Error('secret-credential') });
  await assert.rejects(f.repository.close(), assertSanitized);
});
