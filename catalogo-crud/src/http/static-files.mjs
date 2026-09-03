import { createReadStream, existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { defaultSecurityHeaders, sendError } from './response.mjs';

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
]);

export function fileExists(filePath) {
  return existsSync(filePath);
}

export function resolveStaticFile(rootDirectory, urlPath) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(urlPath);
  } catch {
    return null;
  }

  const pieces = decodedPath.split('/').filter(Boolean);
  if (pieces.some((piece) => (
    piece === '.'
    || piece === '..'
    || piece.startsWith('.')
    || piece.includes('\\')
  ))) {
    return null;
  }

  const candidate = path.resolve(rootDirectory, ...pieces);
  const rootPrefix = `${rootDirectory}${path.sep}`;
  if (candidate !== rootDirectory && !candidate.startsWith(rootPrefix)) {
    return null;
  }
  return candidate;
}

export async function serveFile({ request, response, rootDirectory, urlPath, cacheControl = 'no-store' }) {
  const filePath = resolveStaticFile(rootDirectory, urlPath);
  if (!filePath) {
    sendError(response, 403, 'Caminho não permitido.');
    return;
  }

  try {
    const info = await fs.stat(filePath);
    if (!info.isFile()) {
      sendError(response, 404, 'Arquivo não encontrado.');
      return;
    }

    const contentType = mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
    response.writeHead(200, {
      ...defaultSecurityHeaders,
      'Content-Type': contentType,
      'Content-Length': info.size,
      'Cache-Control': cacheControl,
    });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    createReadStream(filePath).pipe(response);
  } catch (error) {
    if (error.code === 'ENOENT') {
      sendError(response, 404, 'Arquivo não encontrado.');
      return;
    }
    throw error;
  }
}
