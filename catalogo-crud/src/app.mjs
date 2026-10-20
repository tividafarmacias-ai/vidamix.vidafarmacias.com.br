import { HttpError } from './http/errors.mjs';
import path from 'node:path';
import { backgroundVariant } from './modules/stories/background-variants.mjs';
import { canonicalRequestPath, isPublicResource, canAccessPage, canAccessApi } from './http/access.mjs';
import { defaultSecurityHeaders, readJsonBody, sendError, sendJson, sendNoContent } from './http/response.mjs';
import { serveFile } from './http/static-files.mjs';
import { createProductService } from './modules/products/product-service.mjs';
import { createRevistaService } from './modules/revista/revista-service.mjs';
import { productImageUrl, resolveProductImage } from './modules/products/product-images.mjs';
import {
  createStoryBackgroundService,
  isSupportedStoryBackground,
} from './modules/stories/background-service.mjs';
import { createBackgroundManager } from './modules/stories/background-manager.mjs';
import { createApiRouter } from './routes/api-routes.mjs';
import { resolvePageRoute } from './routes/page-routes.mjs';

// Installation metadata and the login/offline shell contain no private data.
// Home Screen icon fetches also work outside an authenticated browser session.
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

export function createApplication({ config, database, authService = null, logger = console }) {
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
  const backgroundManagers = {
    stories: createBackgroundManager({ directory: config.storyBackgroundsDirectory, format: 'stories' }),
    feed: createBackgroundManager({ directory: config.feedBackgroundsDirectory, format: 'feed' }),
    'indoor-h': createBackgroundManager({ directory: config.indoorBackgroundsDirectory, format: 'indoor-h' }),
  };
  const apiRouter = createApiRouter({
    revistaService: createRevistaService({ database, imagesDirectory: config.imagesDirectory }),
    productService, storyBackgroundService, feedBackgroundService, indoorBackgroundService, backgroundManagers,
  });
  const backgroundRoutes = [
    ['/story-backgrounds/', config.storyBackgroundsDirectory, 'stories'],
    ['/feed-backgrounds/', config.feedBackgroundsDirectory, 'feed'],
    ['/indoor-backgrounds/', config.indoorBackgroundsDirectory, 'indoor-h'],
  ];

  return async function requestHandler(request, response) {
    try {
      const url = requestUrl(request);
      const pathname = canonicalRequestPath(url.pathname);
      const route = pathname.toLowerCase();
      const pageFile = resolvePageRoute(route);
      const redirect = (location) => {
        response.writeHead(302, { ...defaultSecurityHeaders, 'Cache-Control': 'no-store', Location: location });
        response.end();
      };
      if (isSafeStaticMethod(request.method) && (
        publicPwaFiles.has(route) || isPublicResource(pathname)
        || ['/login', '/login.html', '/offline.html'].includes(route)
      )) {
        await serveFile({
          request,
          response,
          rootDirectory: config.publicDirectory,
          urlPath: route === '/login' ? 'login.html' : pathname.slice(1),
          cacheControl: publicPwaFiles.has(route) ? 'public, max-age=0, must-revalidate' : 'no-store',
        });
        return;
      }

      if (route === '/api/auth/login') {
        if (request.method !== 'POST') return sendError(response, 405, 'Método não permitido.');
        if (!authService) return sendError(response, 503, 'O serviço de acesso está indisponível.');
        const body = await readJsonBody(request, { maxBytes: 4096 });
        const session = await authService.login(request, response, body);
        sendJson(response, 200, { user: session.user, csrfToken: session.csrfToken });
        return;
      }

      const session = await authService?.getSession(request);
      if (!session || !['admin', 'cliente'].includes(session.user?.role)) {
        if (isSafeStaticMethod(request.method) && (pageFile || route === '/')) {
          redirect(`/login?next=${encodeURIComponent(pathname + url.search)}`);
        } else sendError(response, 401, 'Entre na sua conta para continuar.');
        return;
      }

      if (route === '/api/auth/session') {
        if (!isSafeStaticMethod(request.method)) return sendError(response, 405, 'Método não permitido.');
        sendJson(response, 200, { user: session.user, csrfToken: session.csrfToken });
        return;
      }
      if (route === '/api/auth/logout') {
        if (request.method !== 'POST') return sendError(response, 405, 'Método não permitido.');
        await authService.logout(request, response, session);
        sendNoContent(response);
        return;
      }

      if (route.startsWith('/api/')) {
        if (!canAccessApi(session.user.role, request.method, route)) {
          sendError(response, 403, 'Seu perfil não tem permissão para esta operação.');
          return;
        }
        if (!isSafeStaticMethod(request.method)) authService.assertMutation(request, session);
        // Route parameters may be case-sensitive filenames on Linux/Plesk.
        url.pathname = pathname;
        const handled = await apiRouter.dispatch({ request, response, url });
        if (!handled) sendError(response, 404, 'Endpoint não encontrado.');
        return;
      }

      if (!isSafeStaticMethod(request.method)) {
        sendError(response, 405, 'Método não permitido.');
        return;
      }

      if (pathname.startsWith('/assets/')) {
        const assetPath = pathname.slice('/assets/'.length);
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
          cacheControl: 'no-store',
        });
        return;
      }

      const backgroundRoute = backgroundRoutes.find(([prefix]) => pathname.startsWith(prefix));
      if (backgroundRoute) {
        const [prefix, rootDirectory, format] = backgroundRoute;
        const backgroundPath = pathname.slice(prefix.length);
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
          cacheControl: 'no-store',
        });
        return;
      }

      if (!pageFile) return sendError(response, 404, 'Página não encontrada.');
      if (session.user.role === 'cliente' && pageFile === 'index.html') return redirect('/catalogo');
      if (!canAccessPage(session.user.role, pageFile)) {
        sendError(response, 403, 'Seu perfil não tem acesso a esta página.');
        return;
      }
      await serveFile({
        request,
        response,
        rootDirectory: config.publicDirectory,
        urlPath: pageFile,
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
