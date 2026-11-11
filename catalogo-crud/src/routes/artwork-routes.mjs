import { defaultSecurityHeaders, readMultipartFormData, sendError, sendJson } from '../http/response.mjs';
import { MAX_ARTWORK_BYTES } from '../modules/artworks/artwork-service.mjs';

export function registerArtworkRoutes(router, service) {
  router.get('/api/artworks', ({ response, session }) => sendJson(response, 200, { items: service.list(session.user.id), limit: 5 }));
  router.post('/api/artworks', async ({ request, response, session }) => {
    const { fields, files } = await readMultipartFormData(request, {
      maxBytes: MAX_ARTWORK_BYTES + 16384, tooLargeMessage: 'A arte deve ter até 100 MB.',
    });
    if (files.length !== 1 || files[0].fieldName !== 'artwork') return sendError(response, 400, 'Envie uma arte no campo artwork.');
    sendJson(response, 201, service.create(session.user.id, fields, files[0]));
  });
  const content = ({ request, response, session, params, url }) => {
    const item = service.get(session.user.id, params.id);
    if (!item) return sendError(response, 404, 'Arte não encontrada no seu histórico.');
    const headers = { ...defaultSecurityHeaders, 'Cache-Control': 'private, no-store',
      'Content-Type': item.contentType, 'Accept-Ranges': 'bytes',
      'Content-Disposition': `${url.searchParams.has('download') ? 'attachment' : 'inline'}; filename="${item.filename}"` };
    let start = 0, end = item.size - 1;
    const range = request.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match && (match[1] || match[2])) {
        start = match[1] ? Number(match[1]) : Math.max(0, item.size - Number(match[2]));
        end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
      } else start = item.size;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= item.size) {
        response.writeHead(416, { ...headers, 'Content-Range': `bytes */${item.size}` });
        response.end();
        return;
      }
      headers['Content-Range'] = `bytes ${start}-${end}/${item.size}`;
    }
    response.writeHead(range ? 206 : 200, { ...headers, 'Content-Length': end - start + 1 });
    response.end(request.method === 'HEAD' ? undefined : item.content.subarray(start, end + 1));
  };
  router.get('/api/artworks/:id/file', content);
  router.add('HEAD', '/api/artworks/:id/file', content);
}
