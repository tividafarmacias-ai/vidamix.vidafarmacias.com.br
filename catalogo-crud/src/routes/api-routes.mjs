import { readJsonBody, readMultipartFormData, sendError, sendJson, sendNoContent, sendRevalidatedJson } from '../http/response.mjs';
import { createRouter } from '../http/router.mjs';
import { defaultSecurityHeaders } from '../http/response.mjs';
import { createRevistaTemplate, readRevistaWorkbook } from '../modules/revista/revista-service.mjs';

const backgroundFormatMap = Object.freeze({
  stories: 'stories',
  feed: 'feed',
  'indoor-h': 'indoor-h',
});

function getBackgroundManager(managers, format) {
  const normalized = backgroundFormatMap[format];
  return normalized ? managers[normalized] : null;
}

function getRequestedProductId(productService, value) {
  return productService.productId(value);
}

export function createApiRouter({ productService, storyBackgroundService, feedBackgroundService, indoorBackgroundService, backgroundManagers = {}, revistaService }) {
  const router = createRouter();

  router.get('/api/revista/template', async ({ response }) => {
    const buffer = await createRevistaTemplate();
    response.writeHead(200, { ...defaultSecurityHeaders,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="modelo-revista.xlsx"',
      'Content-Length': buffer.length, 'Cache-Control': 'no-store' });
    response.end(buffer);
  });
  router.get('/api/revista/campaigns', ({ response }) => sendJson(response, 200, { items: revistaService.list() }));
  router.get('/api/revista/active', ({ response }) => sendJson(response, 200, { campaign: revistaService.active() }));
  router.get('/api/revista/active/products/:id', ({ params, url, response }) => {
    const campaign = revistaService.active();
    const item = campaign?.id === Number(url.searchParams.get('campaignId'))
      ? campaign.items.find(item => item.productId === Number(params.id) && item.available) : null;
    const product = item ? productService.getProduct(item.productId) : null;
    if (!product) return sendError(response, 404, 'Esta oferta não está mais disponível na revista vigente. Volte à Central para escolher uma oferta atual.');
    sendJson(response, 200, { product, priceCents: item.priceCents, campaignName: campaign.name });
  });
  router.get('/api/revista/campaigns/:id', ({ params, response }) => {
    const campaign = /^\d+$/.test(params.id) ? revistaService.get(Number(params.id)) : null;
    if (!campaign) return sendError(response, 404, 'Campanha não encontrada.');
    sendJson(response, 200, campaign);
  });
  router.delete('/api/revista/campaigns/:id', ({ params, response }) => {
    const id = /^\d+$/.test(params.id) ? Number(params.id) : 0;
    if (!id || !revistaService.remove(id)) return sendError(response, 404, 'Campanha não encontrada.');
    sendJson(response, 200, { id, removed: true });
  });
  for (const action of ['validate', 'campaigns']) {
    router.post(`/api/revista/${action}`, async ({ request, response }) => {
      const { files, fields } = await readMultipartFormData(request, { maxBytes: 2_100_000, tooLargeMessage: 'A planilha deve ter até 2 MB.' });
      const rows = await readRevistaWorkbook(files.find(file => file.fieldName === 'file'));
      if (action === 'validate') return sendJson(response, 200, revistaService.validate(rows));
      const result = revistaService.create(rows, fields.name);
      sendJson(response, result.report ? 422 : result.existing ? 200 : 201, result);
    });
  }

  router.get('/api/health', ({ response }) => {
    sendJson(response, 200, { status: 'ok' });
  });

  router.get('/api/summary', ({ response }) => {
    sendJson(response, 200, productService.getSummary());
  });

  router.get('/api/categories', ({ response }) => {
    sendJson(response, 200, { items: productService.listCategories() });
  });

  router.get('/api/story-backgrounds', async ({ request, response }) => {
    sendRevalidatedJson(request, response, { items: await storyBackgroundService.listStoryBackgrounds() });
  });

  router.get('/api/feed-backgrounds', async ({ request, response }) => {
    sendRevalidatedJson(request, response, { items: await feedBackgroundService.listStoryBackgrounds() });
  });

  router.get('/api/indoor-backgrounds', async ({ request, response }) => {
    sendRevalidatedJson(request, response, { items: await indoorBackgroundService.listStoryBackgrounds() });
  });

  router.post('/api/backgrounds/:format', async ({ params, request, response }) => {
    const manager = getBackgroundManager(backgroundManagers, params.format);
    if (!manager) {
      sendError(response, 404, 'Formato de background não encontrado.');
      return;
    }

    try {
      const { files, fields } = await readMultipartFormData(request, {
        maxBytes: 45_000_000,
        tooLargeMessage: 'O upload de backgrounds excede 45 MB.',
      });
      const background = files.find((file) => file.fieldName === 'background');
      const wallpaper = files.find((file) => file.fieldName === 'wallpaper');
      const result = await manager.add({ name: fields.nome, background, wallpaper });
      sendJson(response, 201, { ...result, message: 'Background adicionado com sucesso.' });
    } catch (error) {
      sendError(response, 400, error.message || 'Não foi possível adicionar o background.');
    }
  });

  router.delete('/api/backgrounds/:format/:id', async ({ params, response }) => {
    const manager = getBackgroundManager(backgroundManagers, params.format);
    if (!manager) {
      sendError(response, 404, 'Formato de background não encontrado.');
      return;
    }

    try {
      if (!await manager.remove(params.id)) {
        sendError(response, 404, 'Background não encontrado.');
        return;
      }
      sendJson(response, 200, { removed: true });
    } catch (error) {
      sendError(response, 400, error.message || 'Não foi possível remover o background.');
    }
  });

  router.get('/api/products', ({ response, url }) => {
    sendJson(response, 200, productService.listProducts(url.searchParams));
  });

  router.get('/api/products/by-ean/:ean', ({ params, response }) => {
    const product = productService.getProductByEan(params.ean);
    if (!product) {
      sendError(response, 404, 'Produto não encontrado para este EAN.');
      return;
    }
    sendJson(response, 200, product);
  });

  router.get('/api/products/:id', ({ params, response }) => {
    const id = getRequestedProductId(productService, params.id);
    const product = id ? productService.getProduct(id) : null;
    if (!product) {
      sendError(response, 404, 'Produto não encontrado.');
      return;
    }
    sendJson(response, 200, product);
  });

  router.post('/api/products', async ({ request, response }) => {
    const product = productService.createProduct(await readJsonBody(request));
    sendJson(response, 201, product);
  });

  router.post('/api/products/:id/image', async ({ params, request, response }) => {
    const id = getRequestedProductId(productService, params.id);
    if (!id) {
      sendError(response, 404, 'Produto nÃ£o encontrado.');
      return;
    }
    const { files } = await readMultipartFormData(request);
    const file = files.find((entry) => entry.fieldName === 'image');
    if (!file) {
      sendError(response, 400, 'Envie um arquivo no campo image.');
      return;
    }
    const product = await productService.uploadProductImage(id, file);
    if (!product) {
      sendError(response, 404, 'Produto nÃ£o encontrado.');
      return;
    }
    sendJson(response, 200, product);
  });

  router.put('/api/products/:id', async ({ params, request, response }) => {
    const id = getRequestedProductId(productService, params.id);
    const product = id ? productService.updateProduct(id, await readJsonBody(request)) : null;
    if (!product) {
      sendError(response, 404, 'Produto não encontrado.');
      return;
    }
    sendJson(response, 200, product);
  });

  router.delete('/api/products/:id', ({ params, response }) => {
    const id = getRequestedProductId(productService, params.id);
    if (!id || !productService.deleteProduct(id)) {
      sendError(response, 404, 'Produto não encontrado.');
      return;
    }
    sendNoContent(response);
  });

  return router;
}
