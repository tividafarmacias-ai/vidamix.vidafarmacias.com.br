/**
 * Public page registry. Add an explicit entry for each new format instead of
 * deriving a filename from the URL, which keeps the static surface controlled.
 */
const pages = new Map([
  ['/', 'index.html'],
  ['/catalogo', 'catalogo.html'],
  ['/revista', 'revista.html'],
  ['/backgrounds', 'backgrounds.html'],
  ['/artes/stories', 'stories.html'],
  ['/artes/feed', 'feed.html'],
  ['/artes/indoor-h', 'indoor-h.html'],
]);
const aliases = new Map([...pages].map(([route, filename]) => [`/${filename}`, route]));

export function resolvePageRoute(pathname) {
  const normalizedPath = (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname).toLowerCase();
  return pages.get(aliases.get(normalizedPath) || normalizedPath) || null;
}
