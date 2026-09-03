#!/usr/bin/env node

/**
 * Baixa as imagens referenciadas por um export de produtos.
 *
 * Exemplo:
 * node baixar-imagens-produtos.mjs \
 *   --input "C:\\Users\\Bryan-Connect\\Downloads\\produtos.json" \
 *   --output ".\\imagens-produtos"
 *
 * O script deduplica URLs, retoma arquivos já existentes e grava um
 * manifesto que relaciona cada produto ao arquivo baixado (ou à falha).
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_BASE_URL = 'https://vidamix.app.br';
const DEFAULT_CONCURRENCY = 6;
const DEFAULT_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 20_000;

function printHelp() {
  console.log(`
Uso:
  node baixar-imagens-produtos.mjs --input <produtos.json> [opções]

Opções:
  --output <pasta>           Destino. Padrão: .\\imagens-produtos
  --base-url <url>           Base para imagem_url relativa. Padrão: ${DEFAULT_BASE_URL}
  --concurrency <1-20>       Downloads simultâneos. Padrão: ${DEFAULT_CONCURRENCY}
  --retries <0-10>           Tentativas por falha transitória. Padrão: ${DEFAULT_RETRIES}
  --timeout-ms <n>           Tempo máximo por download. Padrão: ${DEFAULT_TIMEOUT_MS}
  --host <domínio>           Baixa apenas este host; pode ser repetido.
  --limit <n>                Processa somente as primeiras n URLs únicas selecionadas.
  --overwrite                Baixa de novo mesmo que o arquivo já exista.
  --dry-run                  Só mostra o plano; não cria arquivos nem faz requisições.
  --help                     Mostra esta ajuda.

Saídas:
  <output>/imagens/          Arquivos de imagem deduplicados.
  <output>/manifesto-imagens.json
                              Mapa produto → URL → arquivo/status.
`);
}

function valueAfter(args, index, option) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`A opção ${option} precisa de um valor.`);
  }
  return value;
}

function parseInteger(value, option, min, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${option} deve ser um número inteiro entre ${min} e ${max}.`);
  }
  return parsed;
}

function parseArgs(args) {
  const options = {
    input: null,
    output: path.resolve(process.cwd(), 'imagens-produtos'),
    baseUrl: DEFAULT_BASE_URL,
    concurrency: DEFAULT_CONCURRENCY,
    retries: DEFAULT_RETRIES,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    hosts: new Set(),
    limit: null,
    overwrite: false,
    dryRun: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    switch (argument) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--input':
        options.input = path.resolve(valueAfter(args, index, argument));
        index += 1;
        break;
      case '--output':
        options.output = path.resolve(valueAfter(args, index, argument));
        index += 1;
        break;
      case '--base-url':
        options.baseUrl = valueAfter(args, index, argument);
        index += 1;
        break;
      case '--concurrency':
        options.concurrency = parseInteger(valueAfter(args, index, argument), argument, 1, 20);
        index += 1;
        break;
      case '--retries':
        options.retries = parseInteger(valueAfter(args, index, argument), argument, 0, 10);
        index += 1;
        break;
      case '--timeout-ms':
        options.timeoutMs = parseInteger(valueAfter(args, index, argument), argument, 1_000);
        index += 1;
        break;
      case '--host':
        options.hosts.add(valueAfter(args, index, argument).toLowerCase());
        index += 1;
        break;
      case '--limit':
        options.limit = parseInteger(valueAfter(args, index, argument), argument, 1);
        index += 1;
        break;
      case '--overwrite':
        options.overwrite = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      default:
        throw new Error(`Opção desconhecida: ${argument}`);
    }
  }

  if (!options.help && !options.input) {
    throw new Error('Informe o arquivo com --input. Use --help para ver exemplos.');
  }

  const base = new URL(options.baseUrl);
  if (base.protocol !== 'https:') {
    throw new Error('--base-url precisa usar HTTPS.');
  }
  options.baseUrl = base.href;

  return options;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sanitizeFileName(value) {
  const sanitized = value
    .normalize('NFKD')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

  return sanitized || 'imagem';
}

function makeFileName(url) {
  const parsedUrl = new URL(url);
  const decodedBaseName = decodeURIComponent(path.posix.basename(parsedUrl.pathname));
  const baseName = sanitizeFileName(decodedBaseName).slice(0, 120);
  const extension = path.extname(baseName).toLowerCase() || '.bin';
  const nameWithoutExtension = path.extname(baseName) ? baseName.slice(0, -path.extname(baseName).length) : baseName;
  const stem = nameWithoutExtension.slice(0, Math.max(1, 120 - extension.length));

  return `${stem}-${sha256(url).slice(0, 16)}${extension}`;
}

function normalizeImageUrl(value, baseUrl) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const normalized = new URL(value.trim(), baseUrl);
  if (normalized.protocol !== 'https:') {
    throw new Error(`Protocolo não permitido: ${normalized.protocol}`);
  }

  return normalized.href;
}

class DownloadError extends Error {
  constructor(message, { retryable = false, status = null } = {}) {
    super(message);
    this.name = 'DownloadError';
    this.retryable = retryable;
    this.status = status;
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fileSizeIfPresent(filePath) {
  try {
    const info = await fs.stat(filePath);
    return info.isFile() && info.size > 0 ? info.size : 0;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return 0;
    }
    throw error;
  }
}

async function downloadImage(task, options, imagesDirectory) {
  const destination = path.join(imagesDirectory, task.fileName);
  const existingSize = options.overwrite ? 0 : await fileSizeIfPresent(destination);

  if (existingSize > 0) {
    return {
      url: task.url,
      fileName: task.fileName,
      status: 'existente',
      bytes: existingSize,
      attempts: 0,
    };
  }

  const temporary = `${destination}.part-${process.pid}`;
  await fs.rm(temporary, { force: true });

  let lastError = null;

  for (let attempt = 1; attempt <= options.retries + 1; attempt += 1) {
    try {
      const response = await fetch(task.url, {
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'User-Agent': 'vidamix-catalog-image-downloader/1.0',
        },
        signal: AbortSignal.timeout(options.timeoutMs),
      });

      if (!response.ok) {
        throw new DownloadError(
          `HTTP ${response.status} ${response.statusText}`,
          { retryable: response.status === 429 || response.status >= 500, status: response.status },
        );
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().startsWith('image/')) {
        throw new DownloadError(
          `Resposta não é uma imagem (${contentType || 'content-type ausente'})`,
          { retryable: false },
        );
      }

      const body = Buffer.from(await response.arrayBuffer());
      if (body.length === 0) {
        throw new DownloadError('A imagem foi recebida vazia.', { retryable: true });
      }

      await fs.writeFile(temporary, body);
      await fs.rename(temporary, destination);

      return {
        url: task.url,
        finalUrl: response.url,
        fileName: task.fileName,
        status: 'baixado',
        bytes: body.length,
        contentType,
        attempts: attempt,
      };
    } catch (error) {
      lastError = error;
      const retryable = !(error instanceof DownloadError) || error.retryable;
      const hasAnotherAttempt = attempt <= options.retries;

      if (!retryable || !hasAnotherAttempt) {
        break;
      }

      const delay = (500 * (2 ** (attempt - 1))) + Math.round(Math.random() * 250);
      await wait(delay);
    }
  }

  await fs.rm(temporary, { force: true });

  return {
    url: task.url,
    fileName: task.fileName,
    status: 'erro',
    bytes: 0,
    attempts: options.retries + 1,
    httpStatus: lastError?.status || null,
    error: lastError?.message || 'Erro desconhecido',
  };
}

async function runPool(tasks, concurrency, worker) {
  const results = new Array(tasks.length);
  let nextIndex = 0;
  let completed = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= tasks.length) {
        return;
      }

      results[index] = await worker(tasks[index]);
      completed += 1;

      if (completed === tasks.length || completed % 25 === 0) {
        console.log(`Progresso: ${completed}/${tasks.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, runWorker));
  return results;
}

function createTaskList(products, options) {
  const taskByUrl = new Map();
  const productEntries = [];
  let withoutImage = 0;
  let invalidUrl = 0;

  for (const product of products) {
    const entry = {
      produto_id: product.id ?? null,
      ean: product.ean ?? null,
      nome: product.nome ?? null,
      imagem_url: product.imagem_url ?? null,
      url_normalizada: null,
      arquivo: null,
      status: null,
    };

    if (typeof product.imagem_url !== 'string' || !product.imagem_url.trim()) {
      withoutImage += 1;
      entry.status = 'sem_imagem';
      productEntries.push(entry);
      continue;
    }

    try {
      const normalizedUrl = normalizeImageUrl(product.imagem_url, options.baseUrl);
      if (!normalizedUrl) {
        withoutImage += 1;
        entry.status = 'sem_imagem';
        productEntries.push(entry);
        continue;
      }
      const parsedUrl = new URL(normalizedUrl);
      entry.url_normalizada = normalizedUrl;

      if (options.hosts.size > 0 && !options.hosts.has(parsedUrl.host.toLowerCase())) {
        entry.status = 'ignorado_por_host';
        productEntries.push(entry);
        continue;
      }

      let task = taskByUrl.get(normalizedUrl);
      if (!task) {
        task = {
          url: normalizedUrl,
          fileName: makeFileName(normalizedUrl),
        };
        taskByUrl.set(normalizedUrl, task);
      }

      entry.arquivo = `imagens/${task.fileName}`;
      entry.status = 'aguardando';
      productEntries.push(entry);
    } catch (error) {
      invalidUrl += 1;
      entry.status = 'url_invalida';
      entry.erro = error.message;
      productEntries.push(entry);
    }
  }

  const tasks = [...taskByUrl.values()];
  const selectedTasks = options.limit ? tasks.slice(0, options.limit) : tasks;
  const selectedUrls = new Set(selectedTasks.map((task) => task.url));

  for (const entry of productEntries) {
    if (entry.status === 'aguardando' && !selectedUrls.has(entry.url_normalizada)) {
      entry.status = 'ignorado_por_limite';
    }
  }

  return {
    productEntries,
    selectedTasks,
    allTaskCount: tasks.length,
    withoutImage,
    invalidUrl,
  };
}

function countByStatus(entries) {
  return Object.fromEntries(
    [...entries.reduce((counts, entry) => {
      counts.set(entry.status, (counts.get(entry.status) || 0) + 1);
      return counts;
    }, new Map())].sort(([left], [right]) => left.localeCompare(right)),
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const rawCatalog = await fs.readFile(options.input, 'utf8');
  const catalog = JSON.parse(rawCatalog);
  if (!Array.isArray(catalog.produtos)) {
    throw new Error('O JSON precisa conter um array na propriedade "produtos".');
  }

  const plan = createTaskList(catalog.produtos, options);
  const hostFilter = options.hosts.size ? [...options.hosts].join(', ') : 'todos';

  console.log(`Produtos no arquivo: ${catalog.produtos.length}`);
  console.log(`Sem imagem: ${plan.withoutImage}`);
  console.log(`URLs inválidas: ${plan.invalidUrl}`);
  console.log(`URLs únicas elegíveis: ${plan.allTaskCount}`);
  console.log(`URLs selecionadas: ${plan.selectedTasks.length}`);
  console.log(`Filtro de host: ${hostFilter}`);

  if (options.dryRun) {
    console.log('Dry run concluído: nenhum arquivo foi criado e nenhuma requisição foi feita.');
    return;
  }

  const imagesDirectory = path.join(options.output, 'imagens');
  await fs.mkdir(imagesDirectory, { recursive: true });

  const results = await runPool(
    plan.selectedTasks,
    options.concurrency,
    (task) => downloadImage(task, options, imagesDirectory),
  );
  const resultByUrl = new Map(results.map((result) => [result.url, result]));

  for (const entry of plan.productEntries) {
    if (entry.status !== 'aguardando') {
      continue;
    }

    const result = resultByUrl.get(entry.url_normalizada);
    if (!result) {
      entry.status = 'ignorado_por_limite';
      continue;
    }

    entry.status = result.status;
    entry.bytes = result.bytes;
    if (result.contentType) entry.content_type = result.contentType;
    if (result.finalUrl) entry.url_final = result.finalUrl;
    if (result.httpStatus) entry.http_status = result.httpStatus;
    if (result.error) entry.erro = result.error;
  }

  const summary = {
    gerado_em: new Date().toISOString(),
    arquivo_origem: options.input,
    total_declarado: catalog.total ?? null,
    total_produtos: catalog.produtos.length,
    sem_imagem: plan.withoutImage,
    urls_invalidas: plan.invalidUrl,
    urls_unicas_elegiveis: plan.allTaskCount,
    urls_processadas_nesta_execucao: results.length,
    resultados_por_url: countByStatus(results),
    resultados_por_produto: countByStatus(plan.productEntries),
  };

  const manifest = {
    resumo: summary,
    downloads: results,
    produtos: plan.productEntries,
  };

  const manifestPath = path.join(options.output, 'manifesto-imagens.json');
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`Manifesto salvo em: ${manifestPath}`);
  console.log(`Resultado por URL: ${JSON.stringify(summary.resultados_por_url)}`);

  if ((summary.resultados_por_url.erro || 0) > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(`Erro: ${error.message}`);
  process.exitCode = 1;
});
