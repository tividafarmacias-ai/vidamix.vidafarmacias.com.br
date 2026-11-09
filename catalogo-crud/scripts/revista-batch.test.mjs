import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { saveCampaignSelection, loadCampaignSelection } from '../public/js/features/revista/selection.js';
import { exportArtworkBatch } from '../public/js/features/revista/zip.js';
import { canContinue } from '../public/js/features/indoor/model.js';
import { getCarouselState, getIndoorDuration } from '../public/js/features/indoor/renderer.js';
import { resolvePageRoute } from '../src/routes/page-routes.mjs';
import { canAccessPage } from '../src/http/access.mjs';

const item = id => ({ productId: id, name: `Proteção ${id}`, priceCents: 3705, ean: `789000000000${id}`, available: true, imageUrl: `/image-${id}.png` });
const campaign = { id: 5, name: 'Revista atual', backgrounds: { feed: 'ofertas.png' }, items: [item(1), item(2)] };
function storageFixture() {
  const entries = new Map();
  return { getItem: key => entries.get(key) || null, setItem: (key, value) => entries.set(key, value), entries };
}

test('selection passes only IDs and reloads authoritative prices in the original order', async () => {
  const storage = storageFixture();
  const token = saveCampaignSelection(5, [2, 1, 2], storage);
  assert.deepEqual(JSON.parse([...storage.entries.values()][0]), { campaignId: 5, productIds: [2, 1] });
  const result = await loadCampaignSelection(`?selection=${token}&price=0.01`, async url => {
    assert.equal(url, '/api/revista/active');
    return { campaign };
  }, storage);
  assert.deepEqual(result.items.map(entry => [entry.product.id, entry.price]), [[2, '37,05'], [1, '37,05']]);
  assert.equal(result.campaign.backgrounds.feed, 'ofertas.png');
});

test('selection rejects missing storage, stale campaigns and unavailable or missing products', async () => {
  const storage = storageFixture();
  const token = saveCampaignSelection(5, [1, 2], storage);
  const load = current => loadCampaignSelection(`?selection=${token}`, async () => ({ campaign: current }), storage);
  for (const current of [null, { ...campaign, id: 6 }, { ...campaign, items: [item(1)] },
    { ...campaign, items: [item(1), { ...item(2), available: false }] }]) await assert.rejects(load(current), /revista|disponível/);
  await assert.rejects(loadCampaignSelection('?selection=missing', async () => ({ campaign }), storage), /seleção não está disponível/);
  assert.throws(() => saveCampaignSelection(5, [1], { setItem() { throw new Error(); } }), /armazenamento/);
});

test('batch ZIP preserves every PNG, unique filenames and the selected product order', async () => {
  const storage = storageFixture();
  const token = saveCampaignSelection(5, [2, 1], storage);
  const { items } = await loadCampaignSelection(`?selection=${token}`, async () => ({ campaign }), storage);
  const progress = [];
  const blob = await exportArtworkBatch({ items, format: 'feed', render: async entry => new Blob([`PNG-${entry.product.id}-${entry.price}`]), onProgress: (...values) => progress.push(values) });
  const archive = await JSZip.loadAsync(await blob.arrayBuffer(), { checkCRC32: true });
  const names = Object.keys(archive.files);
  assert.deepEqual(names, ['001-feed-2-Protecao-2.png', '002-feed-1-Protecao-1.png']);
  assert.equal(await archive.file(names[0]).async('string'), 'PNG-2-37,05');
  assert.equal(await archive.file(names[1]).async('string'), 'PNG-1-37,05');
  assert.deepEqual(progress.at(-1), [2, 2]);
});

test('cancelled and failed batches never produce a partial archive', async () => {
  const items = [1, 2, 3].map(id => ({ product: { id, nome: 'Produto' } }));
  const controller = new AbortController();
  let rendered = 0;
  await assert.rejects(exportArtworkBatch({ items, format: 'stories', signal: controller.signal,
    render: async () => { rendered += 1; controller.abort(); return new Blob(['png']); } }), { name: 'AbortError' });
  assert.equal(rendered, 1);
  await assert.rejects(exportArtworkBatch({ items, format: 'feed', render: async () => null }), /gerar a arte/);
  await assert.rejects(exportArtworkBatch({ items, format: 'feed', render: async () => { throw new Error('Imagem indisponível'); } }), /Imagem indisponível/);
});

test('Indoor magazine selections support one and more than five offers with matching timeline durations', () => {
  for (const count of [1, 3, 7]) {
    const selected = Array.from({ length: count }, (_, i) => ({ product: { id: i + 1, imagem_local_url: '/image.png' }, duration: 10 }));
    assert.equal(canContinue(selected), false);
    assert.equal(canContinue(selected, { flexible: true, limit: Math.max(5, count) }), true);
    assert.equal(getIndoorDuration(true, selected), count * 10 + 3);
    assert.equal(getCarouselState(count * 10 + 1, { hasWallpaper: true, products: selected }).index, count - 1);
  }
  assert.equal(canContinue([], { flexible: true }), false);
});

test('dedicated magazine page and its HTML alias are accessible to both authenticated roles', () => {
  for (const path of ['/revista/ofertas', '/revista/ofertas/', '/revista-ofertas.html']) {
    assert.equal(resolvePageRoute(path), 'revista-ofertas.html');
    assert.equal(canAccessPage('cliente', resolvePageRoute(path)), true);
    assert.equal(canAccessPage('admin', resolvePageRoute(path)), true);
    assert.equal(canAccessPage(null, resolvePageRoute(path)), false);
  }
});
