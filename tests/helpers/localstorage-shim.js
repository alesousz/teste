// Node não tem localStorage por padrão. src/save.js só precisa de
// getItem/setItem/removeItem — este shim mínimo é o suficiente pros testes
// unitários, sem depender de nenhum pacote externo.
export function installLocalStorageShim() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
    clear: () => store.clear(),
  };
  return globalThis.localStorage;
}
