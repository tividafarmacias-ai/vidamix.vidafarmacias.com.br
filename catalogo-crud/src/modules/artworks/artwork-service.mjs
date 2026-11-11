import { badRequest } from '../../http/errors.mjs';

export const MAX_ARTWORK_BYTES = 100_000_000;
const columns = 'id, title, format, filename, content_type AS contentType, created_at AS createdAt, length(content) AS size';

export function createArtworkService({ database }) {
  function list(userId) {
    return database.prepare(`SELECT ${columns} FROM created_artworks WHERE user_id = ? ORDER BY id DESC LIMIT 5`).all(String(userId));
  }
  return {
    list,
    get(userId, id) {
      if (!/^[1-9]\d*$/.test(String(id))) return null;
      return database.prepare(`SELECT ${columns}, content FROM created_artworks WHERE user_id = ? AND id = ?`).get(String(userId), id) || null;
    },
    create(userId, fields, file) {
      if (!['stories', 'feed', 'indoor-h'].includes(fields.format)) throw badRequest('Formato de arte inválido.');
      const buffer = file?.buffer;
      if (!buffer?.length || buffer.length > MAX_ARTWORK_BYTES) throw badRequest('A arte deve ter até 100 MB.');
      const png = buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
      const mp4 = buffer.length >= 24 && buffer.toString('ascii', 4, 8) === 'ftyp'
        && buffer.readUInt32BE(0) >= 16 && buffer.readUInt32BE(0) <= buffer.length
        && /^(?:isom|iso[2-9]|mp4[12]|avc1|M4V )$/.test(buffer.toString('ascii', 8, 12));
      if ((!png && !mp4) || file.contentType !== (png ? 'image/png' : 'video/mp4')) {
        throw badRequest('Envie uma arte em PNG ou MP4.');
      }
      const title = String(fields.title || 'Arte criada').trim().slice(0, 160) || 'Arte criada';
      const extension = png ? 'png' : 'mp4';
      const name = String(file.filename || 'arte').replace(/\.[^.]*$/, '').normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]/gi, '-').slice(0, 100) || 'arte';
      database.exec('BEGIN IMMEDIATE');
      try {
        const result = database.prepare(`INSERT INTO created_artworks
          (user_id, title, format, filename, content_type, created_at, content) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(String(userId), title, fields.format, `${name}.${extension}`, png ? 'image/png' : 'video/mp4', new Date().toISOString(), buffer);
        database.prepare(`DELETE FROM created_artworks WHERE user_id = ? AND id NOT IN
          (SELECT id FROM created_artworks WHERE user_id = ? ORDER BY id DESC LIMIT 5)`).run(String(userId), String(userId));
        database.exec('COMMIT');
        return list(userId).find(item => item.id === Number(result.lastInsertRowid));
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
