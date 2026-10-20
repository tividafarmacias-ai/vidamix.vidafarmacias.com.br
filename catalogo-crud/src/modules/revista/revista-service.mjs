import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import { badRequest } from '../../http/errors.mjs';
import { productImageUrl, resolveProductImage } from '../products/product-images.mjs';

export const MAX_REVISTA_ROWS = 2000;
const headers = ['EAN', 'PREÇO', 'VIGENCIA'];

export async function createRevistaTemplate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'VidaMix Studio';
  const sheet = workbook.addWorksheet('Revista', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: headers[0], key: 'ean', width: 25, style: { numFmt: '@' } },
    { header: headers[1], key: 'price', width: 20, style: { numFmt: '#,##0.00' } },
    { header: headers[2], key: 'month', width: 22, style: { numFmt: '@' } },
  ];
  sheet.getRow(1).height = 30;
  sheet.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF084F98' } };
    cell.alignment = { vertical: 'middle' };
  });
  sheet.getCell('A1').note = 'Código de barras do catálogo. Mantenha como texto para preservar zeros à esquerda.';
  sheet.getCell('B1').note = 'Preço da oferta em reais. Exemplo: 19,90. Apenas as duas primeiras casas decimais serão mantidas, sem arredondamento.';
  sheet.getCell('C1').note = 'Mês e ano no formato MM/AAAA. Exemplo: 10/2026. Use a mesma vigência em todas as linhas.';
  sheet.autoFilter = 'A1:C1';
  // Blank, formatted input rows: downloading the template never inserts fictitious products.
  for (let row = 2; row <= 101; row += 1) {
    sheet.getCell(row, 1).numFmt = '@';
    sheet.getCell(row, 2).numFmt = '#,##0.00';
    sheet.getCell(row, 2).dataValidation = { type: 'decimal', operator: 'greaterThan', formulae: [0], allowBlank: true,
      showErrorMessage: true, errorTitle: 'Preço inválido', error: 'Informe um preço maior que zero.' };
    sheet.getCell(row, 3).numFmt = '@';
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function priceCents(value) {
  let decimal;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0.01 || value >= 10000000) return null;
    decimal = String(value);
  } else {
    const text = String(value ?? '').trim().replace(/^R\$\s*/, '');
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/.test(text)) return null;
    decimal = text.replaceAll('.', '').replace(',', '.');
  }
  // Slice decimal digits before converting to cents: multiplying a float first
  // could incorrectly truncate an exact price such as 0.29 to 28 cents.
  const [integer, fraction = ''] = decimal.split('.');
  const cents = Number(integer) * 100 + Number(fraction.slice(0, 2).padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 999999999 ? cents : null;
}

function cellValue(cell) {
  // Formulas and Excel error objects are rejected, including cached results.
  return typeof cell.value === 'object' && cell.value !== null && !(cell.value instanceof Date) ? null : cell.value;
}

const invalidPriceMessage = 'Informe um preço válido entre R$ 0,01 e R$ 9.999.999,99.';

export async function readRevistaWorkbook(file) {
  if (!file || !/\.xlsx$/i.test(file.filename || '') || !file.buffer?.length) throw badRequest('Selecione uma planilha .xlsx.');
  if (file.buffer.length > 2_000_000) throw badRequest('A planilha deve ter até 2 MB.');
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(file.buffer); } catch { throw badRequest('Não foi possível ler o XLSX. Confira se o arquivo está válido e sem senha.'); }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw badRequest('A planilha está vazia.');
  const normalize = value => String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (headers.some((header, index) => normalize(sheet.getCell(1, index + 1).value) !== normalize(header))) {
    throw badRequest('A primeira linha deve conter EAN, PREÇO e VIGENCIA, nessa ordem. Baixe o modelo.');
  }
  if (sheet.rowCount > MAX_REVISTA_ROWS + 1) throw badRequest(`Use no máximo ${MAX_REVISTA_ROWS} linhas de produtos.`);
  if (workbook.worksheets.slice(1).some(other => other.actualRowCount > 0)) throw badRequest('Use apenas uma aba preenchida por importação.');
  const rows = [];
  sheet.eachRow((row, number) => {
    if (number === 1 || !row.values.slice(1).some(value => value !== null && String(value).trim() !== '')) return;
    const eanCell = row.getCell(1);
    let ean = String(cellValue(eanCell) ?? '').trim();
    if (typeof eanCell.value === 'number' && /^0{8,14}$/.test(eanCell.numFmt || '')) ean = ean.padStart(eanCell.numFmt.length, '0');
    let month = cellValue(row.getCell(3));
    if (month instanceof Date && month.getUTCDate() === 1) month = `${String(month.getUTCMonth() + 1).padStart(2, '0')}/${month.getUTCFullYear()}`;
    const rawPrice = cellValue(row.getCell(2));
    const cents = priceCents(rawPrice);
    rows.push({ line: number, ean, priceCents: cents, month: String(month ?? '').trim(),
      ...(cents === null ? { priceError: invalidPriceMessage } : {}) });
  });
  if (!rows.length) throw badRequest('Preencha pelo menos um produto antes de importar.');
  return rows;
}

export function createRevistaService({ database, imagesDirectory }) {
  function validate(rows) {
    const findProduct = database.prepare(`SELECT id, nome FROM products WHERE ean = ?
      ORDER BY CASE WHEN status = 'ativo' THEN 0 ELSE 1 END, id LIMIT 1`);
    const items = [], missing = [], errors = [], seen = new Set();
    let month = null;
    for (const row of rows) {
      const previousErrors = errors.length;
      if (!/^\d{8,14}$/.test(row.ean)) errors.push({ line: row.line, message: 'EAN deve conter de 8 a 14 dígitos.' });
      if (!Number.isSafeInteger(row.priceCents) || row.priceCents <= 0 || row.priceCents > 999999999) {
        errors.push({ line: row.line, message: row.priceError || invalidPriceMessage });
      }
      if (!/^(0[1-9]|1[0-2])\/(20\d{2}|21\d{2})$/.test(row.month)) errors.push({ line: row.line, message: 'Vigência inválida. Use MM/AAAA, por exemplo 10/2026.' });
      else if (month && row.month !== month) errors.push({ line: row.line, message: `Vigência ${row.month} diferente da campanha (${month}). Esta linha será ignorada.` });
      if (seen.has(row.ean)) errors.push({ line: row.line, message: `EAN ${row.ean} repetido na planilha.` });
      const product = /^\d{8,14}$/.test(row.ean) ? findProduct.get(row.ean) : null;
      if (!product && /^\d{8,14}$/.test(row.ean)) missing.push({ line: row.line, ean: row.ean });
      // Only accepted rows reserve the EAN and the campaign month. An invalid
      // occurrence must not prevent a later correct row from being imported.
      if (product && errors.length === previousErrors) {
        month ??= row.month;
        seen.add(row.ean);
        items.push({ ...row, productId: product.id, name: product.nome });
      }
    }
    return { valid: items.length > 0, total: rows.length, month, items, missing, errors,
      skippedCount: rows.length - items.length };
  }

  function list() {
    return database.prepare(`SELECT c.id, c.name, c.month, c.created_at AS createdAt, COUNT(i.id) AS productCount
      FROM revista_campaigns c LEFT JOIN revista_items i ON i.campaign_id = c.id GROUP BY c.id ORDER BY c.id DESC`).all();
  }
  function get(id) {
    const campaign = database.prepare('SELECT id, name, month, created_at AS createdAt FROM revista_campaigns WHERE id = ?').get(id);
    if (!campaign) return null;
    return { ...campaign, items: database.prepare(`SELECT product_id AS productId, ean, name, price_cents AS priceCents
      FROM revista_items WHERE campaign_id = ? ORDER BY id`).all(id) };
  }
  function active(now = new Date()) {
    const month = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo', month: '2-digit', year: 'numeric',
    }).format(now);
    const campaign = database.prepare(`SELECT id, name, month FROM revista_campaigns
      WHERE month = ? AND EXISTS (SELECT 1 FROM revista_items WHERE campaign_id = revista_campaigns.id)
      ORDER BY id DESC LIMIT 1`).get(month);
    if (!campaign) return null;
    const items = database.prepare(`SELECT i.product_id AS productId, i.ean, i.name, i.price_cents AS priceCents,
      p.subtitulo AS description, p.fabricante AS manufacturer, p.status, p.imagem_arquivo AS imageFile
      FROM revista_items i LEFT JOIN products p ON p.id = i.product_id
      WHERE i.campaign_id = ? ORDER BY i.id`).all(campaign.id).map(({ imageFile, status, ...item }) => {
      const image = resolveProductImage(imagesDirectory, imageFile);
      return { ...item, imageUrl: image ? productImageUrl(image, imagesDirectory) : null,
        available: Boolean(item.productId && status === 'ativo' && image) };
    });
    return { ...campaign, items };
  }
  function create(rows, name) {
    // Recheck catalogue membership when saving, even after a successful preview.
    const report = validate(rows);
    if (!report.valid) return { report };
    const title = String(name || `Revista ${report.month}`).trim();
    if (!title || title.length > 120) throw badRequest('O nome da campanha deve ter entre 1 e 120 caracteres.');
    const hash = createHash('sha256').update(JSON.stringify(report.items.map(({ ean, priceCents, month }) => ({ ean, priceCents, month })).sort((a, b) => a.ean.localeCompare(b.ean)))).digest('hex');
    const existing = database.prepare('SELECT id FROM revista_campaigns WHERE import_hash = ?').get(hash);
    if (existing) return { campaign: get(existing.id), existing: true, skippedCount: report.skippedCount };
    database.exec('BEGIN IMMEDIATE');
    try {
      const result = database.prepare('INSERT INTO revista_campaigns (name, month, import_hash, created_at) VALUES (?, ?, ?, ?)')
        .run(title, report.month, hash, new Date().toISOString());
      const id = Number(result.lastInsertRowid);
      const insert = database.prepare('INSERT INTO revista_items (campaign_id, product_id, ean, name, price_cents) VALUES (?, ?, ?, ?, ?)');
      for (const item of report.items) insert.run(id, item.productId, item.ean, item.name, item.priceCents);
      database.exec('COMMIT');
      return { campaign: get(id), existing: false, skippedCount: report.skippedCount };
    } catch (error) { database.exec('ROLLBACK'); throw error; }
  }
  function remove(id) {
    const campaign = database.prepare('SELECT id FROM revista_campaigns WHERE id = ?').get(id);
    if (!campaign) return false;
    database.exec('BEGIN IMMEDIATE');
    try {
      database.prepare('DELETE FROM revista_items WHERE campaign_id = ?').run(id);
      database.prepare('DELETE FROM revista_campaigns WHERE id = ?').run(id);
      database.exec('COMMIT');
      return true;
    } catch (error) { database.exec('ROLLBACK'); throw error; }
  }
  return { validate, list, get, active, create, remove };
}
