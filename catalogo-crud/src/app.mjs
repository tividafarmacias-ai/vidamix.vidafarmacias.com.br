import { HttpError } from './http/errors.mjs';
import path from 'node:path';
import { backgroundVariant } from './modules/stories/background-variants.mjs';
import { isRequestAuthorized, sendUnauthorized } from './http/auth.mjs';
import { defaultSecurityHeaders, sendError } from './http/response.mjs';
import { serveFile } from './http/static-files.mjs';
import { createProductService } from './modules/products/product-service.mjs';
import { productImageUrl, resolveProductImage } from './modules/products/product-images.mjs';
import {
  createStoryBackgroundService,
  isSupportedStoryBackground,
} from './modules/stories/background-service.mjs';
import { createApiRouter } from './routes/api-routes.mjs';
import { resolvePageRoute } from './routes/page-routes.mjs';

// Installation metadata contains no application data. Home Screen icon fetches
// must work without the browser's HTTP Basic session, including HEAD requests.
const publicPwaFiles = new Set([
  '/manifest.json',
  '/manifest.webmanifest',
  '/apple-touch-icon.png',
  '/apple-touch-icon-precomposed.png',
  '/pwa-icons/apple-touch-icon.png',
  '/pwa-icons/icon-192.png',
  '/pwa-icons/icon-512.png',
  '/pwa-icons/icon-maskable-512.png',
]);

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
  const feedBackgroundService = createStoryBackgroundService({
    storyBackgroundsDirectory: config.feedBackgroundsDirectory,
    format: 'feed',
    urlPrefix: '/feed-backgrounds',
  });
  const indoorBackgroundService = createStoryBackgroundService({
    storyBackgroundsDirectory: config.indoorBackgroundsDirectory,
    format: 'indoor-h',
    urlPrefix: '/indoor-backgrounds',
  });
  const apiRouter = createApiRouter({
    productService, storyBackgroundService, feedBackgroundService, indoorBackgroundService,
  });
  const backgroundRoutes = [
    ['/story-backgrounds/', config.storyBackgroundsDirectory, 'stories'],
    ['/feed-backgrounds/', config.feedBackgroundsDirectory, 'feed'],
    ['/indoor-backgrounds/', config.indoorBackgroundsDirectory, 'indoor-h'],
  ];

  return async function requestHandler(request, response) {
    try {
      const url = requestUrl(request);
      if (publicPwaFiles.has(url.pathname) && isSafeStaticMethod(request.method)) {
        await serveFile({
          request,
          response,
          rootDirectory: config.publicDirectory,
          urlPath: url.pathname.slice(1),
          cacheControl: 'public, max-age=0, must-revalidate',
        });
        return;
      }

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
        let decodedPath;
        try { decodedPath = decodeURIComponent(assetPath); } catch { decodedPath = null; }
        const imageFile = resolveProductImage(config.imagesDirectory, decodedPath);
        if (!imageFile) {
          sendError(response, 403, 'Caminho de imagem não permitido.');
          return;
        }
        if (imageFile !== decodedPath) {
          // Existing tabs and saved PNG URLs continue working after conversion.
          // Do not cache the alias: files may still be uploaded or rolled back.
          response.writeHead(302, {
            ...defaultSecurityHeaders,
            Location: productImageUrl(imageFile) + url.search,
            'Cache-Control': 'no-store',
            'Content-Length': 0,
          });
          response.end();
          return;
        }
        await serveFile({
          request,
          response,
          rootDirectory: config.imagesDirectory,
          urlPath: assetPath,
          cacheControl: 'private, no-cache',
          versioned: true,
        });
        return;
      }

      const backgroundRoute = backgroundRoutes.find(([prefix]) => url.pathname.startsWith(prefix));
      if (backgroundRoute) {
        const [prefix, rootDirectory, format] = backgroundRoute;
        const backgroundPath = url.pathname.slice(prefix.length);
        if (!isSupportedStoryBackground(backgroundPath)) {
          sendError(response, 403, 'Formato de background não permitido.');
          return;
        }
        const variant = url.searchParams.get('variant');
        const file = variant ? await backgroundVariant({
          rootDirectory, urlPath: backgroundPath, variant, format,
          cacheDirectory: path.join(config.storageDirectory, 'background-cache'),
        }) : { rootDirectory, urlPath: backgroundPath };
        await serveFile({
          request,
          response,
          ...file,
          cacheControl: 'private, no-cache',
          versioned: true,
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
