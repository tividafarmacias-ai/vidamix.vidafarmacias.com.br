import { badRequest } from './errors.mjs';
import { createHash } from 'node:crypto';

export const defaultSecurityHeaders = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(self), geolocation=(), microphone=(), payment=(), usb=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self'",
    "font-src 'self' https://cdnjs.cloudflare.com data:",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' https://cdnjs.cloudflare.com",
  ].join('; '),
});

export function sendJson(response, statusCode, body) {
  const payload = `${JSON.stringify(body)}\n`;
  response.writeHead(statusCode, {
    ...defaultSecurityHeaders,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  response.end(payload);
}

// The browser keeps the manifest, but checks for additions/replacements on each visit.
export function sendRevalidatedJson(request, response, body) {
  const payload = `${JSON.stringify(body)}\n`;
  const etag = `"${createHash('sha256').update(payload).digest('hex')}"`;
  const unchanged = request.headers['if-none-match']?.split(',').some((tag) => (
    tag.trim() === '*' || tag.trim().replace(/^W\//, '') === etag
  ));
  response.writeHead(unchanged ? 304 : 200, {
    ...defaultSecurityHeaders,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-cache',
    ETag: etag,
    ...(!unchanged ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
  });
  response.end(unchanged ? undefined : payload);
}

export function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { error: message });
}

export function sendNoContent(response) {
  response.writeHead(204, defaultSecurityHeaders);
  response.end();
}

export async function readJsonBody(request, { maxBytes = 1_000_000 } = {}) {
  const contentType = String(request.headers['content-type'] || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== 'application/json') {
    throw badRequest('O corpo da requisição precisa usar Content-Type application/json.');
  }

  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      throw badRequest('O corpo da requisição excede 1 MB.');
    }
    chunks.push(chunk);
  }

  if (size === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw badRequest('O corpo da requisição precisa ser um JSON válido.');
  }
}

export async function readMultipartFormData(request, { maxBytes = 12_000_000 } = {}) {
  const header = String(request.headers['content-type'] || '');
  const contentType = header.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'multipart/form-data') {
    throw badRequest('O corpo da requisição precisa usar Content-Type multipart/form-data.');
  }

  const boundaryMatch = header.match(/(?:^|;)\s*boundary=(?:"([^"]+)"|([^;\s]+))/i);
  const boundary = boundaryMatch?.[1] || boundaryMatch?.[2];
  if (!boundary) throw badRequest('O upload não informou um boundary válido.');

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw badRequest('A imagem excede o limite de 12 MB.');
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks);
  const delimiter = Buffer.from(`--${boundary}`);
  const fields = {};
  const files = [];
  let cursor = body.indexOf(delimiter);

  if (cursor < 0) throw badRequest('O upload está incompleto.');
  while (cursor >= 0) {
    cursor += delimiter.length;
    if (body.subarray(cursor, cursor + 2).toString() === '--') break;
    if (body.subarray(cursor, cursor + 2).toString() === '\r\n') cursor += 2;

    const nextBoundary = body.indexOf(delimiter, cursor);
    if (nextBoundary < 0) throw badRequest('O upload está incompleto.');
    const part = body.subarray(cursor, Math.max(cursor, nextBoundary - 2));
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd < 0) throw badRequest('O upload possui uma parte inválida.');

    const partHeaders = Object.fromEntries(part.subarray(0, headerEnd).toString('utf8').split('\r\n').map((line) => {
      const separator = line.indexOf(':');
      return separator < 0
        ? ['', '']
        : [line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim()];
    }).filter(([name]) => name));
    const disposition = partHeaders['content-disposition'] || '';
    const name = disposition.match(/(?:^|;)\s*name="([^"]*)"/i)?.[1];
    if (name) {
      const filenameMatch = disposition.match(/(?:^|;)\s*filename="([^"]*)"/i);
      const value = part.subarray(headerEnd + 4);
      if (filenameMatch) {
        files.push({
          fieldName: name,
          filename: filenameMatch[1],
          contentType: partHeaders['content-type'] || 'application/octet-stream',
          buffer: value,
        });
      } else {
        fields[name] = value.toString('utf8');
      }
    }
    cursor = nextBoundary;
  }

  return { fields, files };
}
