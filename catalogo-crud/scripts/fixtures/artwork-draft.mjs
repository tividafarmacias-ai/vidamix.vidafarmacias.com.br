export function memoryStorage() {
  const items = new Map();
  return {
    items,
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
  };
}
