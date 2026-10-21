import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import { compareImages, downloadMissing, makeImageFileName, normalizeImageUrl } from './lib/catalog-image-sync.mjs';

// libvips may otherwise retain Windows file handles after metadata inspection.
sharp.cache({ files: 0 });

const png = await sharp({
  create: { width: 2, height: 2, channels: 4, background: '#267a4b' },
}).png().toBuffer();
const webp = await sharp(png).webp().toBuffer();
const url = (name) => `https://catalog.example.test/images/${name}`;
const product = (id, image, extra = {}) => ({
  id, ean: String(7890000000000 + id), nome: `Produto ${id}`, imagem_url: image, ...extra,
});

async function fixture(t) {
  const workspace = await mkdtemp(path.join(tmpdir(), 'vidamix-image-sync-'));
  const imagesRoot = path.join(workspace, 'assets');
  await mkdir(path.join(imagesRoot, 'imagens'), { recursive: true });
  t.after(async () => {
    // Remove only the freshly created directory owned by this individual test.
    const resolved = path.resolve(workspace);
    assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
    assert.ok(path.basename(resolved).startsWith('vidamix-image-sync-'));
    await rm(resolved, { recursive: true, force: true });
  });
  return {
    workspace,
    imagesRoot,
    put: (fileName, bytes = png) => writeFile(path.join(imagesRoot, 'imagens', fileName), bytes),
    files: () => readdir(path.join(imagesRoot, 'imagens')),
  };
}

const asImage = (bytes = png) => new Response(bytes, {
  headers: { 'content-type': 'image/png', 'content-length': String(bytes.length) },
});

test('normalizes relative HTTPS URLs and keeps distinct source URLs distinct', () => {
  assert.equal(normalizeImageUrl('  /images/item.png  '), 'https://vidamix.app.br/images/item.png');
  assert.equal(normalizeImageUrl('images/item.png', 'https://catalog.example.test/'), url('item.png'));
  assert.equal(normalizeImageUrl(''), null);
  assert.equal(normalizeImageUrl(null), null);
  assert.throws(() => normalizeImageUrl('http://catalog.example.test/item.png'));
  assert.throws(() => normalizeImageUrl('file:///private/image.png'));
  const fileName = makeImageFileName(url('Oferta%20ver%C3%A3o.PNG'));
  assert.equal(fileName, 'Oferta vera\u0303o-7a41ac8325494771.png');
  assert.equal(fileName, makeImageFileName(url('Oferta%20ver%C3%A3o.PNG')));
  assert.notEqual(makeImageFileName(url('item.png?v=1')), makeImageFileName(url('item.png?v=2')));
});

test('comparison deduplicates URLs while retaining every product and reports unreferenced files', async (t) => {
  const local = await fixture(t);
  const shared = url('shared.png');
  const missing = url('missing.png');
  await local.put(makeImageFileName(shared));
  await local.put('unrelated.png');
  const plan = await compareImages({
    imagesRoot: local.imagesRoot,
    products: [
      product(1, shared), product(2, shared), product(3, missing),
      product(4, ''), product(5, 'http://catalog.example.test/unsafe.png'),
    ],
  });
  assert.equal(plan.products.length, 5);
  assert.deepEqual(plan.products.map((item) => item.status),
    ['existente', 'existente', 'faltante', 'sem_imagem', 'url_invalida']);
  assert.equal(plan.images.length, 2);
  const existing = plan.images.find((item) => item.url === shared);
  assert.equal(existing.status, 'existente');
  assert.equal(existing.file, `imagens/${makeImageFileName(shared)}`);
  assert.deepEqual(existing.productIds.map(String).sort(), ['1', '2']);
  assert.equal(plan.images.find((item) => item.url === missing).status, 'faltante');
  assert.equal(plan.localFilesWithoutReference.length, 1);
  assert.ok(JSON.stringify(plan.localFilesWithoutReference).includes('unrelated.png'));
});

test('comparison reuses deterministic WebP conversions after original files were removed', async (t) => {
  const local = await fixture(t);
  const direct = url('direct.png');
  const suffixed = url('suffixed.jpg');
  const directName = makeImageFileName(direct).replace(/\.png$/, '.webp');
  const suffixedName = makeImageFileName(suffixed).replace(/\.jpg$/, '_resultado.webp');
  await local.put(directName, webp);
  await local.put(suffixedName, webp);
  const plan = await compareImages({
    imagesRoot: local.imagesRoot, products: [product(1, direct), product(2, suffixed)],
  });
  assert.deepEqual(plan.products.map((item) => item.status), ['existente', 'existente']);
  assert.deepEqual(new Set(plan.images.map((item) => item.file)),
    new Set([`imagens/${directName}`, `imagens/${suffixedName}`]));
  assert.equal(plan.localFilesWithoutReference.length, 0);
});

test('comparison reuses manifest and SQLite file mappings only for their exact image URL', async (t) => {
  const local = await fixture(t);
  const fromDownload = url('download-source.png');
  const fromProduct = url('product-source.png');
  const fromDatabase = url('database-source.png');
  const changed = url('changed-source.png');
  for (const name of ['download.webp', 'product.webp', 'database.webp', 'old.png']) {
    await local.put(name, name.endsWith('.webp') ? webp : png);
  }
  const plan = await compareImages({
    imagesRoot: local.imagesRoot,
    products: [
      product(1, fromDownload), product(2, fromProduct),
      product(3, fromDatabase), product(4, changed),
    ],
    manifest: {
      downloads: [{ url: fromDownload, fileName: 'download.png', status: 'baixado' }],
      produtos: [
        { produto_id: 2, imagem_url: fromProduct, url_normalizada: fromProduct, arquivo: 'imagens/product.png' },
        { produto_id: 4, imagem_url: url('old.png'), url_normalizada: url('old.png'), arquivo: 'imagens/old.png' },
      ],
    },
    databaseProducts: [
      { id: 3, imagem_url: fromDatabase, imagem_arquivo: 'imagens/database.png' },
      { id: 4, ean: String(7890000000004), imagem_url: url('old.png'), imagem_arquivo: 'imagens/old.png' },
    ],
  });
  assert.deepEqual(plan.products.map((item) => item.status), ['existente', 'existente', 'existente', 'faltante']);
  assert.deepEqual(plan.images.slice(0, 3).map((item) => item.file),
    ['imagens/download.webp', 'imagens/product.webp', 'imagens/database.webp']);
  assert.equal(plan.products[3].arquivo, null);
});

test('comparison treats missing, corrupt and directory mappings as missing images', async (t) => {
  const local = await fixture(t);
  const sources = ['missing.png', 'corrupt.png', 'directory.png'].map(url);
  await local.put(makeImageFileName(sources[1]), Buffer.from('<html>not an image</html>'));
  await mkdir(path.join(local.imagesRoot, 'imagens', makeImageFileName(sources[2])));
  const plan = await compareImages({
    imagesRoot: local.imagesRoot,
    products: sources.map((source, index) => product(index + 1, source)),
    manifest: { downloads: sources.map((source) => ({ url: source, fileName: makeImageFileName(source), status: 'baixado' })) },
  });
  assert.deepEqual(plan.products.map((item) => item.status), ['faltante', 'faltante', 'faltante']);
  assert.ok(plan.images.every((item) => item.status === 'faltante' && item.file === null));
});

test('truncated PNG with readable metadata is missing and is preserved when a download collides', async (t) => {
  const local = await fixture(t);
  const source = url('truncated.png');
  const fileName = makeImageFileName(source);
  const idatOffset = png.indexOf('IDAT');
  assert.ok(idatOffset > 0);
  const truncated = png.subarray(0, idatOffset + 4);
  // The complete header alone is not proof that the image pixels are readable.
  assert.equal((await sharp(truncated).metadata()).width, 2);
  await assert.rejects(() => sharp(truncated).stats());
  await local.put(fileName, truncated);
  const plan = await compareImages({ imagesRoot: local.imagesRoot, products: [product(1, source)] });
  assert.equal(plan.products[0].status, 'faltante');
  assert.equal(plan.images[0].status, 'faltante');
  assert.equal(plan.invalidLocalFiles.length, 1);
  assert.equal(plan.invalidLocalFiles[0].file, `imagens/${fileName}`);

  let calls = 0;
  const results = await downloadMissing(plan, {
    imagesRoot: local.imagesRoot, retries: 0,
    fetchImpl: async () => { calls += 1; return asImage(); },
  });
  assert.equal(calls, 1);
  assert.equal(results[0].status, 'erro');
  assert.deepEqual(await readFile(path.join(local.imagesRoot, 'imagens', fileName)), truncated);
  assert.deepEqual(await local.files(), [fileName]);
});

test('comparison rejects mappings that escape the images directory', async (t) => {
  const local = await fixture(t);
  const source = url('outside.png');
  await writeFile(path.join(local.workspace, 'outside.png'), png);
  const plan = await compareImages({
    imagesRoot: local.imagesRoot,
    products: [product(1, source)],
    manifest: { produtos: [{ produto_id: 1, url_normalizada: source, arquivo: '../outside.png' }] },
    databaseProducts: [{ id: 1, imagem_url: source, imagem_arquivo: '../outside.png' }],
  });
  assert.equal(plan.products[0].status, 'faltante');
  assert.equal(plan.products[0].arquivo, null);
});

test('image-field selection uses the requested field and falls back when it is empty', async (t) => {
  const local = await fixture(t);
  const original = url('original.png');
  const display = url('display.png');
  const products = [
    product(1, original, { imagem_url_exibicao: display }),
    product(2, '', { imagem_url_exibicao: display }),
    product(3, original, { imagem_url_exibicao: '' }),
  ];
  const defaults = await compareImages({ imagesRoot: local.imagesRoot, products });
  assert.deepEqual(defaults.products.map((item) => item.url_normalizada), [original, display, original]);
  const selected = await compareImages({ imagesRoot: local.imagesRoot, products, imageField: 'imagem_url_exibicao' });
  assert.deepEqual(selected.products.map((item) => item.url_normalizada), [display, display, original]);
});

test('downloader fetches each missing URL once and preserves existing image bytes', async (t) => {
  const local = await fixture(t);
  const existing = url('existing.png');
  const missing = url('missing.png');
  await local.put(makeImageFileName(existing), webp);
  const plan = await compareImages({
    imagesRoot: local.imagesRoot,
    products: [product(1, existing), product(2, missing), product(3, missing)],
  });
  const requests = [];
  const results = await downloadMissing(plan, {
    imagesRoot: local.imagesRoot, retries: 0,
    fetchImpl: async (source) => { requests.push(String(source)); return asImage(); },
  });
  assert.deepEqual(requests, [missing]);
  assert.equal(results.length, 1);
  assert.equal(results[0].status, 'baixado');
  assert.equal(results[0].file, `imagens/${makeImageFileName(missing)}`);
  assert.equal(results[0].bytes, png.length);
  assert.deepEqual(await readFile(path.join(local.imagesRoot, 'imagens', makeImageFileName(existing))), webp);
  assert.deepEqual(await readFile(path.join(local.imagesRoot, 'imagens', makeImageFileName(missing))), png);
  assert.equal((await local.files()).length, 2);
});

test('downloader resumes a stale plan without fetching or overwriting files already completed', async (t) => {
  const local = await fixture(t);
  const source = url('resume.png');
  const plan = await compareImages({ imagesRoot: local.imagesRoot, products: [product(1, source)] });
  await local.put(makeImageFileName(source), webp);
  let calls = 0;
  const results = await downloadMissing(plan, {
    imagesRoot: local.imagesRoot, retries: 0,
    fetchImpl: async () => { calls += 1; return asImage(); },
  });
  assert.equal(calls, 0);
  assert.equal(results[0].status, 'existente');
  assert.deepEqual(await readFile(path.join(local.imagesRoot, 'imagens', makeImageFileName(source))), webp);
  assert.equal((await local.files()).length, 1);
});

test('downloader preserves an image created by another process while a fetch is in progress', async (t) => {
  const local = await fixture(t);
  const source = url('concurrent.png');
  const fileName = makeImageFileName(source);
  const plan = await compareImages({ imagesRoot: local.imagesRoot, products: [product(1, source)] });
  const results = await downloadMissing(plan, {
    imagesRoot: local.imagesRoot, retries: 0,
    fetchImpl: async () => {
      await local.put(fileName, webp);
      return asImage();
    },
  });
  assert.equal(results[0].status, 'existente');
  assert.deepEqual(await readFile(path.join(local.imagesRoot, 'imagens', fileName)), webp);
  assert.deepEqual(await local.files(), [fileName]);
});

test('downloader limits missing URLs rather than products or existing images', async (t) => {
  const local = await fixture(t);
  const sources = ['existing.png', 'first.png', 'second.png'].map(url);
  await local.put(makeImageFileName(sources[0]));
  const plan = await compareImages({
    imagesRoot: local.imagesRoot,
    products: [product(1, sources[0]), product(2, sources[1]), product(3, sources[1]), product(4, sources[2])],
  });
  const requests = [];
  const results = await downloadMissing(plan, {
    imagesRoot: local.imagesRoot, retries: 0, limit: 1,
    fetchImpl: async (source) => { requests.push(String(source)); return asImage(); },
  });
  assert.equal(results.length, 1);
  assert.deepEqual(requests, [sources[1]]);
  assert.equal((await local.files()).length, 2);
});

test('downloader retries transient responses then stores the image once', async (t) => {
  const local = await fixture(t);
  const plan = await compareImages({ imagesRoot: local.imagesRoot, products: [product(1, url('retry.png'))] });
  let calls = 0;
  const results = await downloadMissing(plan, {
    imagesRoot: local.imagesRoot, retries: 2, concurrency: 1,
    fetchImpl: async () => {
      calls += 1;
      return calls === 1 ? new Response('unavailable', { status: 503 })
        : calls === 2 ? new Response('wait', { status: 429, headers: { 'retry-after': '0' } })
          : asImage();
    },
  });
  assert.equal(calls, 3);
  assert.equal(results[0].status, 'baixado');
  assert.equal((await local.files()).length, 1);
});

test('downloader aborts a timed-out request and retries it successfully', async (t) => {
  const local = await fixture(t);
  const plan = await compareImages({ imagesRoot: local.imagesRoot, products: [product(1, url('timeout.png'))] });
  let calls = 0;
  let aborted = false;
  // AbortSignal.timeout uses an unreferenced timer; keep the fake request alive.
  const keepAlive = setTimeout(() => {}, 5_000);
  t.after(() => clearTimeout(keepAlive));
  const results = await downloadMissing(plan, {
    imagesRoot: local.imagesRoot, retries: 1, timeoutMs: 20,
    fetchImpl: async (_source, options) => {
      calls += 1;
      if (calls > 1) return asImage();
      assert.ok(options.signal);
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          aborted = true;
          reject(options.signal.reason);
        }, { once: true });
      });
    },
  });
  assert.equal(aborted, true);
  assert.equal(calls, 2);
  assert.equal(results[0].status, 'baixado');
  assert.equal((await local.files()).length, 1);
});

test('downloader rejects HTTP errors, HTML and invalid image bodies without partial files', async (t) => {
  const local = await fixture(t);
  const sources = ['not-found.png', 'html.png', 'invalid.png'].map(url);
  const plan = await compareImages({
    imagesRoot: local.imagesRoot, products: sources.map((source, index) => product(index + 1, source)),
  });
  let calls = 0;
  const responses = new Map([
    [sources[0], () => new Response('not found', { status: 404 })],
    [sources[1], () => new Response('<html>sign in</html>', { headers: { 'content-type': 'text/html' } })],
    [sources[2], () => asImage(Buffer.from('these bytes are not an image'))],
  ]);
  const results = await downloadMissing(plan, {
    imagesRoot: local.imagesRoot, retries: 1,
    fetchImpl: async (source) => { calls += 1; return responses.get(String(source))(); },
  });
  assert.equal(calls, 3);
  assert.equal(results.length, 3);
  assert.ok(results.every((item) => item.status === 'erro' && typeof item.error === 'string'));
  assert.deepEqual(await local.files(), []);
});

test('downloader rejects redirects from HTTPS to HTTP without requesting the insecure URL', async (t) => {
  const local = await fixture(t);
  const source = url('redirect.png');
  const plan = await compareImages({ imagesRoot: local.imagesRoot, products: [product(1, source)] });
  const requests = [];
  const results = await downloadMissing(plan, {
    imagesRoot: local.imagesRoot, retries: 1,
    fetchImpl: async (destination, options) => {
      requests.push(String(destination));
      assert.equal(options.redirect, 'manual');
      return new Response(null, { status: 302, headers: { location: 'http://catalog.example.test/insecure.png' } });
    },
  });
  assert.deepEqual(requests, [source]);
  assert.equal(results[0].status, 'erro');
  assert.deepEqual(await local.files(), []);
});

test('downloader enforces byte limit even when content-length is absent', async (t) => {
  const local = await fixture(t);
  const plan = await compareImages({ imagesRoot: local.imagesRoot, products: [product(1, url('large.png'))] });
  const results = await downloadMissing(plan, {
    imagesRoot: local.imagesRoot, retries: 0, maxBytes: png.length - 1,
    fetchImpl: async () => new Response(png, { headers: { 'content-type': 'image/png' } }),
  });
  assert.equal(results[0].status, 'erro');
  assert.deepEqual(await local.files(), []);
});
