import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Release decoded files promptly, including on Windows.
sharp.cache({ files: 0 });

const FORMATS = new Set(['png', 'jpeg', 'webp', 'gif', 'avif', 'heif', 'tiff', 'svg']);
const EXTENSIONS = { png: '.png', jpeg: '.jpg', webp: '.webp', gif: '.gif', avif: '.avif', heif: '.avif', tiff: '.tiff', svg: '.svg' };

export function normalizeImageUrl(value, baseUrl = 'https://vidamix.app.br') {
  if (typeof value !== 'string' || !value.trim()) return null;
  const url = new URL(value.trim(), baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('A imagem deve usar HTTPS sem credenciais na URL.');
  return url.href;
}

// Keep the original downloader's naming scheme so its downloads are reusable.
export function makeImageFileName(url) {
  const basename = decodeURIComponent(path.posix.basename(new URL(url).pathname))
    .normalize('NFKD').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/\s+/g, ' ').trim() || 'imagem';
  const name = basename.slice(0, 120);
  const suffix = path.extname(name);
  const extension = suffix.toLowerCase() || '.bin';
  const stem = (suffix ? name.slice(0, -suffix.length) : name).slice(0, Math.max(1, 120 - extension.length));
  return `${stem}-${createHash('sha256').update(url).digest('hex').slice(0, 16)}${extension}`;
}

function safeImagePath(value) {
  return typeof value === 'string' && /^imagens\/[^/\\:\u0000-\u001F]+$/.test(value)
    && !path.posix.basename(value).startsWith('.');
}

function variants(file) {
  if (!safeImagePath(file)) return [];
  const suffix = path.posix.extname(file);
  const stem = suffix ? file.slice(0, -suffix.length) : file;
  return [...new Set([`${stem}.webp`, `${stem}_resultado.webp`, file,
    ...['.png', '.jpg', '.jpeg', '.gif', '.avif', '.tiff', '.svg'].map((extension) => `${stem}${extension}`)])];
}

async function inspectImage(input) {
  const image = sharp(input, { limitInputPixels: 100_000_000 });
  const metadata = await image.metadata();
  if (!FORMATS.has(metadata.format) || !metadata.width || !metadata.height) throw new Error('Formato de imagem inválido ou sem dimensões.');
  await image.stats();
  return metadata;
}

async function pool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

async function inventory(imagesRoot, onScanProgress) {
  const directory = path.join(imagesRoot, 'imagens');
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const files = entries.filter((entry) => entry.isFile() && !entry.name.includes('.part-'));
  let completed = 0;
  return pool(files, 4, async (entry) => {
    const file = `imagens/${entry.name}`;
    const absolute = path.join(imagesRoot, file);
    const { size: bytes } = await fs.stat(absolute);
    try {
      if (!bytes) throw new Error('Arquivo vazio.');
      const metadata = await inspectImage(absolute);
      return { file, bytes, valid: true, format: metadata.format };
    } catch (error) {
      return { file, bytes, valid: false, error: error.message };
    } finally {
      onScanProgress({ completed: ++completed, total: files.length });
    }
  });
}

export async function compareImages({ products, imagesRoot, manifest = {}, databaseProducts = [], imageField = 'imagem_url', onScanProgress = () => {} }) {
  if (!Array.isArray(products)) throw new Error('O catálogo precisa conter uma lista de produtos.');
  if (!['imagem_url', 'imagem_url_exibicao'].includes(imageField)) throw new Error('Campo de imagem inválido.');
  const localFiles = await inventory(imagesRoot, onScanProgress);
  const usable = new Map(localFiles.filter((file) => file.valid).map((file) => [file.file, file]));
  const references = new Map();
  const addReference = (url, file, source) => {
    try {
      const normalized = normalizeImageUrl(url);
      if (!normalized || !safeImagePath(file)) return;
      if (!references.has(normalized)) references.set(normalized, []);
      references.get(normalized).push({ file, source });
    } catch { /* Invalid historical references cannot identify an image. */ }
  };
  for (const item of manifest.downloads || []) addReference(item.url, `imagens/${item.fileName}`, 'manifesto');
  for (const item of manifest.produtos || []) addReference(item.url_normalizada || item.imagem_url, item.arquivo, 'manifesto');
  for (const item of databaseProducts) addReference(item.imagem_url, item.imagem_arquivo, 'sqlite');

  const imagesByUrl = new Map();
  const entries = products.map((product, index) => {
    if (!product || typeof product !== 'object' || Array.isArray(product)) throw new Error(`Produto inválido na posição ${index}.`);
    const fallback = imageField === 'imagem_url' ? 'imagem_url_exibicao' : 'imagem_url';
    const hasPrimary = typeof product[imageField] === 'string' && product[imageField].trim();
    const field = hasPrimary ? imageField : fallback;
    const entry = {
      produto_id: product.id ?? null, ean: product.ean ?? null, nome: product.nome ?? null,
      imagem_url: product.imagem_url ?? null, imagem_url_exibicao: product.imagem_url_exibicao ?? null,
      campo_utilizado: field, usou_fallback: !hasPrimary, url_normalizada: null,
      arquivo: null, status: 'sem_imagem',
    };
    try {
      entry.url_normalizada = normalizeImageUrl(product[field]);
      if (!entry.url_normalizada) return entry;
      entry.imagem_generica = /\/assets\/Tarjado\.png$/i.test(new URL(entry.url_normalizada).pathname);
      let image = imagesByUrl.get(entry.url_normalizada);
      if (!image) {
        const fileName = makeImageFileName(entry.url_normalizada);
        const candidates = [{ file: `imagens/${fileName}`, source: 'nome_por_url' }, ...(references.get(entry.url_normalizada) || [])];
        let found;
        for (const candidate of candidates) {
          const file = variants(candidate.file).find((name) => usable.has(name));
          if (file) { found = { ...usable.get(file), source: candidate.source }; break; }
        }
        image = {
          url: entry.url_normalizada, fileName: found ? path.posix.basename(found.file) : fileName,
          file: found?.file || null, status: found ? 'existente' : 'faltante',
          bytes: found?.bytes || 0, matchedBy: found?.source || null, productIds: [],
          candidates: [...new Set(candidates.flatMap(({ file }) => variants(file)))],
        };
        imagesByUrl.set(image.url, image);
      }
      image.productIds.push(entry.produto_id);
      entry.arquivo = image.file;
      entry.arquivo_previsto = `imagens/${image.fileName}`;
      entry.status = image.status;
    } catch (error) {
      entry.status = 'url_invalida';
      entry.erro = error.message;
    }
    return entry;
  });
  const images = [...imagesByUrl.values()];
  // Include all matching variants; an alternative PNG/WebP is still referenced.
  const referenced = new Set(images.flatMap((image) => image.candidates).filter((file) => usable.has(file)));
  const summary = {
    total_produtos: products.length,
    arquivos_locais: localFiles.length,
    arquivos_locais_validos: usable.size,
    arquivos_locais_invalidos: localFiles.length - usable.size,
    urls_unicas: images.length,
    imagens_reaproveitadas: images.filter((image) => image.status === 'existente').length,
    imagens_faltantes: images.filter((image) => image.status === 'faltante').length,
    produtos_com_imagem_local: entries.filter((entry) => entry.status === 'existente').length,
    produtos_com_imagem_faltante: entries.filter((entry) => entry.status === 'faltante').length,
    produtos_sem_url: entries.filter((entry) => entry.status === 'sem_imagem').length,
    produtos_com_url_invalida: entries.filter((entry) => entry.status === 'url_invalida').length,
    produtos_usando_fallback: entries.filter((entry) => entry.usou_fallback && entry.url_normalizada).length,
    produtos_usando_imagem_generica: entries.filter((entry) => entry.imagem_generica).length,
    arquivos_locais_sem_referencia: localFiles.filter((entry) => !referenced.has(entry.file)).length,
  };
  return { summary, products: entries, images, localFilesWithoutReference: localFiles.filter((entry) => !referenced.has(entry.file)), invalidLocalFiles: localFiles.filter((entry) => !entry.valid) };
}

class DownloadError extends Error {
  constructor(message, retryable = false, status = null) {
    super(message);
    this.retryable = retryable;
    this.status = status;
  }
}

async function fetchImage(url, { fetchImpl, timeoutMs, maxBytes }) {
  const signal = AbortSignal.timeout(timeoutMs);
  let currentUrl = normalizeImageUrl(url);
  let response;
  for (let redirects = 0; redirects <= 5; redirects++) {
    response = await fetchImpl(currentUrl, {
      redirect: 'manual', signal,
      headers: { Accept: 'image/*', 'User-Agent': 'vidamix-incremental-images/1.0' },
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get('location');
    await response.body?.cancel();
    if (!location || redirects === 5) throw new DownloadError('Redirecionamento inválido ou em excesso.');
    currentUrl = normalizeImageUrl(location, currentUrl);
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new DownloadError(`HTTP ${response.status}`, response.status === 429 || response.status >= 500, response.status);
  }
  const contentType = response.headers.get('content-type') || '';
  if (!/^image\//i.test(contentType)) {
    await response.body?.cancel();
    throw new DownloadError(`Resposta não é uma imagem (${contentType || 'sem Content-Type'}).`);
  }
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel();
    throw new DownloadError('Imagem excede o limite de bytes.');
  }
  const chunks = [];
  let bytes = 0;
  if (!response.body) throw new DownloadError('Imagem vazia.');
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new DownloadError('Imagem excede o limite de bytes.');
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  let metadata;
  try {
    metadata = await inspectImage(buffer);
  } catch {
    throw new DownloadError('Conteúdo recebido não é uma imagem válida.');
  }
  return { buffer, metadata, contentType, finalUrl: currentUrl };
}

async function existingCandidate(imagesRoot, candidates) {
  for (const file of candidates) {
    if (!safeImagePath(file)) continue;
    try {
      const absolute = path.join(imagesRoot, file);
      const info = await fs.lstat(absolute);
      if (!info.isFile() || !info.size) continue;
      await inspectImage(absolute);
      return { file, bytes: info.size };
    } catch (error) {
      if (['EACCES', 'EPERM'].includes(error.code)) throw error;
    }
  }
  return null;
}

export async function downloadMissing(plan, {
  imagesRoot, concurrency = 4, retries = 2, timeoutMs = 20_000, maxBytes = 25 * 1024 * 1024,
  limit = Infinity, fetchImpl = fetch, onProgress = () => {},
} = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 12) throw new Error('Concorrência inválida (1–12).');
  if (!Number.isInteger(retries) || retries < 0 || retries > 10) throw new Error('Tentativas inválidas (0–10).');
  if ((!Number.isInteger(limit) || limit < 0) && limit !== Infinity) throw new Error('Limite inválido.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || !Number.isInteger(maxBytes) || maxBytes < 1) throw new Error('Timeout ou limite de bytes inválido.');
  const tasks = plan.images.filter((image) => image.status === 'faltante').slice(0, limit);
  await fs.mkdir(path.join(imagesRoot, 'imagens'), { recursive: true });
  let completed = 0;
  return pool(tasks, concurrency, async (image) => {
    let result;
    let attempts = 0;
    try {
      const candidates = image.candidates || variants(`imagens/${image.fileName}`);
      const existing = await existingCandidate(imagesRoot, candidates);
      if (existing) {
        result = { url: image.url, fileName: path.posix.basename(existing.file), status: 'existente', ...existing, attempts };
      } else {
        for (attempts = 1; attempts <= retries + 1; attempts++) {
          try {
            const download = await fetchImage(image.url, { fetchImpl, timeoutMs, maxBytes });
            const expected = makeImageFileName(image.url);
            const extension = path.extname(expected);
            const formatsByExtension = { '.png': 'png', '.webp': 'webp', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.gif': 'gif', '.svg': 'svg', '.avif': 'heif', '.tif': 'tiff', '.tiff': 'tiff' };
            const fileName = formatsByExtension[extension] === download.metadata.format
              ? expected : `${expected.slice(0, -extension.length)}${EXTENSIONS[download.metadata.format]}`;
            const file = `imagens/${fileName}`;
            const destination = path.join(imagesRoot, file);
            const temporary = `${destination}.part-${randomUUID()}`;
            try {
              await fs.writeFile(temporary, download.buffer, { flag: 'wx' });
              // Hard-link publishes a complete file atomically, without replacing
              // anything created by another run or by the user while downloading.
              try {
                await fs.link(temporary, destination);
                result = { url: image.url, fileName, file, status: 'baixado', bytes: download.buffer.length, attempts, contentType: download.contentType, finalUrl: download.finalUrl };
              } catch (error) {
                if (error.code !== 'EEXIST') throw error;
                const present = await existingCandidate(imagesRoot, [file]);
                if (!present) throw new DownloadError(`Já existe um arquivo inválido em ${file}; preservado para revisão.`);
                result = { url: image.url, fileName, status: 'existente', ...present, attempts };
              }
            } finally {
              await fs.rm(temporary, { force: true });
            }
            break;
          } catch (error) {
            const retryable = error instanceof DownloadError ? error.retryable : ['TimeoutError', 'AbortError', 'TypeError'].includes(error.name);
            if (!retryable || attempts > retries) throw error;
            await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** (attempts - 1)));
          }
        }
      }
    } catch (error) {
      result = { url: image.url, fileName: image.fileName, file: null, status: 'erro', bytes: 0, attempts, httpStatus: error.status || null, error: error.message };
    }
    onProgress({ completed: ++completed, total: tasks.length, result });
    return result;
  });
}
