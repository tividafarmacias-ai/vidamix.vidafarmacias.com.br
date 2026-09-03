import { HttpError } from './http/errors.mjs';
import { isRequestAuthorized, sendUnauthorized } from './http/auth.mjs';
import { sendError } from './http/response.mjs';
import { serveFile } from './http/static-files.mjs';
import { createProductService } from './modules/products/product-service.mjs';
import {
  createStoryBackgroundService,
  isSupportedStoryBackground,
} from './modules/stories/background-service.mjs';
import { createApiRouter } from './routes/api-routes.mjs';
import { resolvePageRoute } from './routes/page-routes.mjs';

function isSafeStaticMethod(method) {
  return method === 'GET' || method === 'HEAD';
}

function requestUrl(request) {
  // Only the pathname and query string are needed by this local application.
  // Avoid using a client-controlled Host header as the base URL.
  return new URL(request.url || '/', 'http://localhost');
}

export function createApplication({ config, database, logger = console }) {
  const productService = createProductService({ database, imagesDirectory: config.imagesDirectory });
  const storyBackgroundService = createStoryBackgroundService({
    storyBackgroundsDirectory: config.storyBackgroundsDirectory,
  });
  const apiRouter = createApiRouter({ productService, storyBackgroundService });

  return async function requestHandler(request, response) {
    try {
      const url = requestUrl(request);
      if (!isRequestAuthorized(request, config.auth)) {
        sendUnauthorized(response, config.auth);
        return;
      }

      if (url.pathname.startsWith('/api/')) {
        const handled = await apiRouter.dispatch({ request, response, url });
        if (!handled) sendError(response, 404, 'Endpoint não encontrado.');
        return;
      }

      if (!isSafeStaticMethod(request.method)) {
        sendError(response, 405, 'Método não permitido.');
        return;
      }

      if (url.pathname.startsWith('/assets/')) {
        const assetPath = url.pathname.slice('/assets/'.length);
        if (!assetPath.startsWith('imagens/')) {
          sendError(response, 403, 'Caminho de imagem não permitido.');
          return;
        }
        await serveFile({
          request,
          response,
          rootDirectory: config.imagesDirectory,
          urlPath: assetPath,
          cacheControl: 'public, max-age=86400',
        });
        return;
      }

      if (url.pathname.startsWith('/story-backgrounds/')) {
        const backgroundPath = url.pathname.slice('/story-backgrounds/'.length);
        if (!isSupportedStoryBackground(backgroundPath)) {
          sendError(response, 403, 'Formato de background não permitido.');
          return;
        }
        await serveFile({
          request,
          response,
          rootDirectory: config.storyBackgroundsDirectory,
          urlPath: backgroundPath,
          cacheControl: 'public, max-age=86400',
        });
        return;
      }

      const pageFile = resolvePageRoute(url.pathname);
      const requestedFile = pageFile || url.pathname.slice(1);
      await serveFile({
        request,
        response,
        rootDirectory: config.publicDirectory,
        urlPath: requestedFile,
      });
    } catch (error) {
      if (!(error instanceof HttpError)) logger.error(error);
      const statusCode = error instanceof HttpError ? error.statusCode : 500;
      const message = error instanceof HttpError && error.expose
        ? error.message
        : 'Erro interno do servidor.';

      if (!response.headersSent) sendError(response, statusCode, message);
      else response.destroy();
    }
  };
}
