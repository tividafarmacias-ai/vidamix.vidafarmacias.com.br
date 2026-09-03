import { readJsonBody, sendError, sendJson, sendNoContent } from '../http/response.mjs';
import { createRouter } from '../http/router.mjs';

function getRequestedProductId(productService, value) {
  return productService.productId(value);
}

export function createApiRouter({ productService, storyBackgroundService }) {
  const router = createRouter();

  router.get('/api/health', ({ response }) => {
    sendJson(response, 200, { status: 'ok' });
  });

  router.get('/api/summary', ({ response }) => {
    sendJson(response, 200, productService.getSummary());
  });

  router.get('/api/categories', ({ response }) => {
    sendJson(response, 200, { items: productService.listCategories() });
  });

  router.get('/api/story-backgrounds', async ({ response }) => {
    sendJson(response, 200, { items: await storyBackgroundService.listStoryBackgrounds() });
  });

  router.get('/api/products', ({ response, url }) => {
    sendJson(response, 200, productService.listProducts(url.searchParams));
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
