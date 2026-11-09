// PNG is already compressed: store entries without recompressing them.
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
function header(size) {
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  return { bytes, word: (at, value) => view.setUint16(at, value, true), long: (at, value) => view.setUint32(at, value, true) };
}
export function createZipArchive() {
  const chunks = [], directory = [], names = new Set();
  let offset = 0;
  return {
    async add(name, blob) {
      if (names.has(name) || /[\\/]/.test(name)) throw new Error('Nome de arquivo inválido no lote.');
      if (offset + blob.size > 256 * 1024 * 1024) throw new Error('Este lote ultrapassa 256 MB. Selecione menos produtos e exporte em partes.');
      const filename = new TextEncoder().encode(name);
      const checksum = crc32(new Uint8Array(await blob.arrayBuffer()));
      const local = header(30);
      local.long(0, 0x04034b50); local.word(4, 20); local.word(6, 0x0800);
      local.word(12, 33); local.long(14, checksum); local.long(18, blob.size); local.long(22, blob.size); local.word(26, filename.length);
      const central = header(46);
      central.long(0, 0x02014b50); central.word(4, 20); central.word(6, 20); central.word(8, 0x0800);
      central.word(14, 33); central.long(16, checksum); central.long(20, blob.size); central.long(24, blob.size);
      central.word(28, filename.length); central.long(42, offset);
      chunks.push(local.bytes, filename, blob);
      directory.push(central.bytes, filename);
      offset += local.bytes.length + filename.length + blob.size;
      names.add(name);
    },
    finish() {
      const end = header(22);
      end.long(0, 0x06054b50); end.word(8, names.size); end.word(10, names.size);
      end.long(12, directory.reduce((total, bytes) => total + bytes.length, 0)); end.long(16, offset);
      return new Blob([...chunks, ...directory, end.bytes], { type: 'application/zip' });
    },
  };
}

export async function exportArtworkBatch({ items, format, render, signal, onProgress = () => {} }) {
  const archive = createZipArchive();
  for (const [index, item] of items.entries()) {
    signal?.throwIfAborted();
    onProgress(index, items.length);
    const blob = await render(item, signal);
    signal?.throwIfAborted();
    if (!blob?.size) throw new Error(`Não foi possível gerar a arte de ${item.product.nome}.`);
    const name = item.product.nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 70) || 'produto';
    await archive.add(`${String(index + 1).padStart(3, '0')}-${format}-${item.product.id}-${name}.png`, blob);
    signal?.throwIfAborted();
    onProgress(index + 1, items.length);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return archive.finish();
}
