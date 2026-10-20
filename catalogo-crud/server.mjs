import { createServer } from 'node:http';
import { createApplication } from './src/app.mjs';
import { loadConfig, loadProjectEnvironment, validateLoginConfig } from './src/config.mjs';
import { initializeCatalogDatabase } from './src/database/catalog-database.mjs';
import { createMysqlUserRepository } from './src/modules/auth/mysql-users.mjs';
import { createAuthService } from './src/modules/auth/auth-service.mjs';

loadProjectEnvironment();
const config = loadConfig();
validateLoginConfig(config);
const users = createMysqlUserRepository(config.mysql);
try { await users.checkConnection(); }
catch {
  await users.close();
  console.error('Não foi possível conectar à tabela cliente. Verifique a configuração DB_* e a disponibilidade do MySQL.');
  process.exit(1);
}
const database = await initializeCatalogDatabase(config);
const authService = createAuthService({ users, database, config });
const requestHandler = createApplication({ config, database, authService });
const server = createServer(requestHandler);

let shuttingDown = false;

server.keepAliveTimeout = 5_000;
server.headersTimeout = 10_000;
server.requestTimeout = 30_000;

server.on('error', (error) => {
  console.error('Erro no servidor HTTP:', error);
  if (!shuttingDown) process.exit(1);
});

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Encerrando servidor (${signal})...`);

  const forceExit = setTimeout(() => {
    console.error('Encerramento excedeu o tempo limite; finalizando o processo.');
    database.close();
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async (error) => {
    clearTimeout(forceExit);
    database.close();
    await users.close();
    if (error) {
      console.error(error);
      process.exit(1);
    }
    process.exit(0);
  });
}

server.listen(config.port, () => {
  console.log(`Catálogo CRUD disponível na porta ${config.port} (${config.environment}).`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(signal));
}
