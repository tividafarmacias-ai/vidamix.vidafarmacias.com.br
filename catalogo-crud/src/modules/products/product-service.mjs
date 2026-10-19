import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { badRequest } from '../../http/errors.mjs';
import { productImageUrl, resolveProductImage } from './product-images.mjs';

const productColumns = [
  'nome',
  'subtitulo',
  'caracteres',
  'grupo',
  'principio_ativo',
  'ms',
  'fabricante',
  'categoria_id',
  'categoria_produtos',
  'categoria_nome',
  'frases_encarte',
  'status',
  'data_vigencia_inicio',
  'data_vigencia_fim',
  'generico',
  'produto_destaque',
  'ean',
  'direcao_imagem',
  'imagem_url',
  'imagem_arquivo',
  'imagem_status',
  'created_at',
  'updated_at',
];

const stringFields = new Set([
  'nome',
  'subtitulo',
  'caracteres',
  'grupo',
  'principio_ativo',
  'ms',
  'fabricante',
  'categoria_produtos',
  'categoria_nome',
  'frases_encarte',
  'data_vigencia_inicio',
  'data_vigencia_fim',
  'ean',
  'direcao_imagem',
  'imagem_url',
]);

function nowSqlTimestamp() {
  return new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

function nullableString(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const stringValue = String(value).trim();
  return stringValue || null;
}

function nullableInteger(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw badRequest('categoria_id deve ser um número inteiro.');
  }
  return parsed;
}

function booleanInteger(value) {
  if (value === undefined) return undefined;
  if (value === true || value === 1 || value === '1' || value === 'true') return 1;
  if (value === false || value === 0 || value === '0' || value === 'false' || value === null) return 0;
  throw badRequest('Campos booleanos devem receber true ou false.');
}

function serializeProduct(row, imagesDirectory) {
  if (!row) return null;
  const imageFile = resolveProductImage(imagesDirectory, row.imagem_arquivo);

  return {
    ...row,
    generico: Boolean(row.generico),
    produto_destaque: Boolean(row.produto_destaque),
    imagem_local_url: imageFile ? productImageUrl(imageFile, imagesDirectory) : null,
    possui_imagem_local: ['baixado', 'existente', 'manual'].includes(row.imagem_status),
  };
}

function productFilters(searchParams) {
  const where = [];
  const values = [];
  const query = searchParams.get('q')?.trim();
  const status = searchParams.get('status')?.trim();
  const category = searchParams.get('categoria')?.trim();
  const image = searchParams.get('imagem')?.trim();

  if (query) {
    const like = `%${query}%`;
    where.push(`(
      nome LIKE ? COLLATE NOCASE
      OR ean LIKE ? COLLATE NOCASE
      OR fabricante LIKE ? COLLATE NOCASE
      OR principio_ativo LIKE ? COLLATE NOCASE
      OR subtitulo LIKE ? COLLATE NOCASE
      OR categoria_produtos LIKE ? COLLATE NOCASE
    )`);
    values.push(like, like, like, like, like, like);
  }
  if (status && ['ativo', 'inativo'].includes(status)) {
    where.push('status = ?');
    values.push(status);
  }
  if (category) {
    where.push('categoria_produtos = ?');
    values.push(category);
  }
  if (image === 'com') where.push("imagem_status IN ('baixado', 'existente', 'manual')");
  if (image === 'sem') where.push("(imagem_status NOT IN ('baixado', 'existente', 'manual') OR imagem_status IS NULL)");

  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', values };
}

function productId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function createProductService({ database, imagesDirectory }) {
  const serialize = (row) => serializeProduct(row, imagesDirectory);

  function safeLocalImagePath(value) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;

    const normalized = String(value).replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalized.startsWith('imagens/') || normalized.includes('..')) {
      throw badRequest('imagem_arquivo precisa apontar para um arquivo dentro de imagens/.');
    }

    const resolved = resolveProductImage(imagesDirectory, normalized);
    if (!resolved) throw badRequest('Caminho de imagem local não permitido.');
    const absolutePath = path.resolve(imagesDirectory, resolved);
    const relativePath = path.relative(imagesDirectory, absolutePath);
    if (
      !relativePath
      || relativePath.startsWith(`..${path.sep}`)
      || path.isAbsolute(relativePath)
      || !existsSync(absolutePath)
    ) {
      throw badRequest('O arquivo de imagem local informado não existe.');
    }

    return normalized;
  }

  function sanitizePayload(payload, { creating = false } = {}) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw badRequest('Envie um objeto JSON com os dados do produto.');
    }

    const output = {};
    for (const field of stringFields) {
      if (Object.hasOwn(payload, field)) output[field] = nullableString(payload[field]);
    }
    if (Object.hasOwn(payload, 'categoria_id')) output.categoria_id = nullableInteger(payload.categoria_id);
    if (Object.hasOwn(payload, 'generico')) output.generico = booleanInteger(payload.generico);
    if (Object.hasOwn(payload, 'produto_destaque')) output.produto_destaque = booleanInteger(payload.produto_destaque);
    if (Object.hasOwn(payload, 'imagem_arquivo')) output.imagem_arquivo = safeLocalImagePath(payload.imagem_arquivo);

    if (Object.hasOwn(payload, 'status')) {
      const status = String(payload.status).trim().toLowerCase();
      if (!['ativo', 'inativo'].includes(status)) {
        throw badRequest('status deve ser ativo ou inativo.');
      }
      output.status = status;
    }

    if (creating && !output.nome) {
      throw badRequest('nome é obrigatório ao criar um produto.');
    }

    return output;
  }

  function getProduct(id) {
    return serialize(database.prepare('SELECT * FROM products WHERE id = ?').get(id));
  }

  function getProductByEan(value) {
    const ean = String(value || '').trim();
    if (!/^\d{8,14}$/.test(ean)) return null;

    return serialize(database.prepare(`
      SELECT * FROM products
      WHERE ean = ?
      ORDER BY CASE WHEN status = 'ativo' THEN 0 ELSE 1 END, id ASC
      LIMIT 1
    `).get(ean));
  }

  function listProducts(searchParams) {
    const requestedPage = Number(searchParams.get('page') || 1);
    const requestedPageSize = Number(searchParams.get('pageSize') || 48);
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const pageSize = Number.isInteger(requestedPageSize) ? Math.min(Math.max(requestedPageSize, 12), 100) : 48;
    const filters = productFilters(searchParams);
    const total = database.prepare(`SELECT COUNT(*) AS count FROM products ${filters.where}`).get(...filters.values).count;
    const rows = database.prepare(`
      SELECT * FROM products
      ${filters.where}
      ORDER BY produto_destaque DESC, nome COLLATE NOCASE ASC, id ASC
      LIMIT ? OFFSET ?
    `).all(...filters.values, pageSize, (page - 1) * pageSize);

    return {
      items: rows.map(serialize),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  function getSummary() {
    const totals = database.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'ativo' THEN 1 ELSE 0 END) AS ativos,
        SUM(CASE WHEN imagem_status IN ('baixado', 'existente', 'manual') THEN 1 ELSE 0 END) AS com_imagem,
        COUNT(DISTINCT COALESCE(NULLIF(categoria_produtos, ''), 'Sem categoria')) AS categorias
      FROM products
    `).get();

    return {
      total: totals.total || 0,
      ativos: totals.ativos || 0,
      com_imagem: totals.com_imagem || 0,
      categorias: totals.categorias || 0,
    };
  }

  function listCategories() {
    return database.prepare(`
      SELECT categoria_produtos AS nome, COUNT(*) AS total
      FROM products
      WHERE categoria_produtos IS NOT NULL AND categoria_produtos != ''
      GROUP BY categoria_produtos
      ORDER BY categoria_produtos COLLATE NOCASE ASC
    `).all();
  }

  function createProduct(payload) {
    const values = sanitizePayload(payload, { creating: true });
    const timestamp = nowSqlTimestamp();
    const product = {
      nome: values.nome,
      subtitulo: values.subtitulo ?? null,
      caracteres: values.caracteres ?? null,
      grupo: values.grupo ?? null,
      principio_ativo: values.principio_ativo ?? null,
      ms: values.ms ?? null,
      fabricante: values.fabricante ?? null,
      categoria_id: values.categoria_id ?? null,
      categoria_produtos: values.categoria_produtos ?? null,
      categoria_nome: values.categoria_nome ?? null,
      frases_encarte: values.frases_encarte ?? null,
      status: values.status ?? 'ativo',
      data_vigencia_inicio: values.data_vigencia_inicio ?? null,
      data_vigencia_fim: values.data_vigencia_fim ?? null,
      generico: values.generico ?? 0,
      produto_destaque: values.produto_destaque ?? 0,
      ean: values.ean ?? null,
      direcao_imagem: values.direcao_imagem ?? 'vertical',
      imagem_url: values.imagem_url ?? null,
      imagem_arquivo: values.imagem_arquivo ?? null,
      imagem_status: values.imagem_arquivo ? 'manual' : 'sem_imagem',
      created_at: timestamp,
      updated_at: timestamp,
    };

    const placeholders = productColumns.map(() => '?').join(', ');
    const result = database.prepare(`INSERT INTO products (${productColumns.join(', ')}) VALUES (${placeholders})`).run(
      ...productColumns.map((column) => product[column]),
    );

    return getProduct(Number(result.lastInsertRowid));
  }

  function updateProduct(id, payload) {
    const existing = database.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!existing) return null;

    const changes = sanitizePayload(payload);
    if (Object.keys(changes).length === 0) return serialize(existing);

    const updated = { ...existing, ...changes, updated_at: nowSqlTimestamp() };
    if (Object.hasOwn(changes, 'imagem_arquivo')) {
      updated.imagem_status = changes.imagem_arquivo ? 'manual' : 'sem_imagem';
    }
    if (!updated.nome) {
      throw badRequest('nome não pode ficar vazio.');
    }

    const values = [...productColumns.map((column) => updated[column]), id];
    const assignments = productColumns.map((column) => `${column} = ?`).join(', ');
    database.prepare(`UPDATE products SET ${assignments} WHERE id = ?`).run(...values);
    return getProduct(id);
  }

  function deleteProduct(id) {
    const result = database.prepare('DELETE FROM products WHERE id = ?').run(id);
    return result.changes > 0;
  }

  async function uploadProductImage(id, file) {
    const existing = database.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!existing) return null;
    if (!file?.buffer?.length) throw badRequest('Selecione uma imagem para o produto.');
    if (file.buffer.length > 10_000_000) throw badRequest('A imagem excede o limite de 10 MB.');

    let metadata;
    try {
      metadata = await sharp(file.buffer).metadata();
    } catch {
      throw badRequest('O arquivo enviado não é uma imagem válida.');
    }

    const extensionByFormat = {
      jpeg: 'jpg',
      png: 'png',
      webp: 'webp',
      gif: 'gif',
      avif: 'avif',
      tiff: 'tif',
    };
    const extension = extensionByFormat[metadata.format];
    if (!extension) throw badRequest('Formato de imagem não suportado. Use PNG, JPG, WebP, GIF ou AVIF.');

    const imagesSubdirectory = path.join(imagesDirectory, 'imagens');
    await fs.mkdir(imagesSubdirectory, { recursive: true });
    const filename = `imagens/upload-produto-${id}-${Date.now()}-${randomUUID().slice(0, 8)}.${extension}`;
    const absolutePath = path.join(imagesDirectory, filename);
    await fs.writeFile(absolutePath, file.buffer, { flag: 'wx' });

    try {
      return updateProduct(id, { imagem_arquivo: filename });
    } catch (error) {
      await fs.unlink(absolutePath).catch(() => {});
      throw error;
    }
  }

  return {
    productId,
    getProduct,
    getProductByEan,
    listProducts,
    getSummary,
    listCategories,
    createProduct,
    updateProduct,
    uploadProductImage,
    deleteProduct,
  };
}
