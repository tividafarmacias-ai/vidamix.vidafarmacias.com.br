import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../src/config.mjs';
import { storyBackgroundExtensions } from '../src/modules/stories/background-service.mjs';

const issues = [];

function addIssue(message) {
  issues.push(message);
}

async function checkReadableFile(label, filePath) {
  if (!existsSync(filePath)) {
    addIssue(`${label} não encontrado: ${filePath}`);
    return;
  }

  try {
    await fs.access(filePath, constants.R_OK);
  } catch {
    addIssue(`${label} sem permissão de leitura: ${filePath}`);
  }
}

async function checkReadableDirectory(label, directoryPath) {
  if (!existsSync(directoryPath)) {
    addIssue(`${label} não encontrado: ${directoryPath}`);
    return false;
  }

  try {
    await fs.access(directoryPath, constants.R_OK | constants.X_OK);
    return true;
  } catch {
    addIssue(`${label} sem permissão de leitura: ${directoryPath}`);
    return false;
  }
}

async function checkWritableDatabaseParent(databasePath) {
  let directoryPath = path.dirname(databasePath);
  while (!existsSync(directoryPath)) {
    const parentPath = path.dirname(directoryPath);
    if (parentPath === directoryPath) {
      addIssue(`Não foi possível localizar um diretório pai para o banco: ${databasePath}`);
      return;
    }
    directoryPath = parentPath;
  }

  try {
    await fs.access(directoryPath, constants.W_OK | constants.X_OK);
  } catch {
    addIssue(`Sem permissão para criar ou gravar o banco em: ${path.dirname(databasePath)}`);
  }
}

let config;
try {
  config = loadConfig(process.env);
} catch (error) {
  console.error(`Configuração inválida: ${error.message}`);
  process.exit(1);
}

if (config.environment !== 'production') {
  addIssue('NODE_ENV deve ser production para validar a configuração de publicação.');
}

if (!config.auth.enabled) {
  addIssue('APP_AUTH_ENABLED deve estar ativo em produção.');
}

await checkWritableDatabaseParent(config.databasePath);
const backgroundsReadable = await checkReadableDirectory(
  'Diretório de backgrounds',
  config.storyBackgroundsDirectory,
);
await checkReadableDirectory('Diretório de imagens de produtos', config.imagesDirectory);

if (backgroundsReadable) {
  const backgroundEntries = await fs.readdir(config.storyBackgroundsDirectory, { withFileTypes: true });
  const backgroundCount = backgroundEntries.filter(
    (entry) => entry.isFile() && storyBackgroundExtensions.has(path.extname(entry.name).toLowerCase()),
  ).length;
  if (!backgroundCount) addIssue('Nenhum background compatível foi encontrado para Stories.');
}

if (!existsSync(config.databasePath)) {
  await checkReadableFile('Arquivo de catálogo para a importação inicial', config.sourceCatalogPath);
  await checkReadableFile('Manifesto de imagens para a importação inicial', config.sourceManifestPath);
}

if (issues.length) {
  console.error('Configuração de produção incompleta:');
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exit(1);
}

console.log('Configuração de produção validada.');
console.log(`Banco persistente: ${config.databasePath}`);
console.log(`Imagens de produtos: ${config.imagesDirectory}`);
