/**
 * Public page registry. Add an explicit entry for each new format instead of
 * deriving a filename from the URL, which keeps the static surface controlled.
 */
const pages = new Map([
  ['/', 'index.html'],
  ['/catalogo', 'catalogo.html'],
  ['/artes/stories', 'stories.html'],
]);

export function resolvePageRoute(pathname) {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return pages.get(normalizedPath) || null;
}
