/**
 * Browser stubs for `node:*` builtins pulled into ESM-dev graphs
 * (e.g. `@tanstack/start-storage-context` → `node:async_hooks`).
 */

export function isNodeBuiltinSpecifier(spec: string): boolean {
  return (
    spec.startsWith('node:') ||
    spec === 'async_hooks' ||
    spec === 'fs' ||
    spec === 'path' ||
    spec === 'url' ||
    spec === 'crypto' ||
    spec === 'module' ||
    spec === 'os' ||
    spec === 'util' ||
    spec === 'stream' ||
    spec === 'buffer' ||
    spec === 'events' ||
    spec === 'process' ||
    spec === 'child_process' ||
    spec === 'worker_threads' ||
    spec === 'http' ||
    spec === 'https' ||
    spec === 'net' ||
    spec === 'tls' ||
    spec === 'zlib' ||
    spec === 'assert' ||
    spec === 'tty' ||
    spec === 'constants'
  )
}

/** True when `/@fs` stripped path is still a node builtin (e.g. `node:async_hooks`). */
export function isNodeBuiltinFsPath(absPath: string): boolean {
  const spec = absPath.startsWith('/') ? absPath.slice(1) : absPath
  return isNodeBuiltinSpecifier(spec)
}

/** Return browser stub source for a `node:*` builtin. */
export function getNodeBuiltinStubSource(spec: string): string {
  const normalized = spec.startsWith('/') ? spec.slice(1) : spec
  const name = normalized.startsWith('node:')
    ? normalized.slice('node:'.length)
    : normalized

  if (name === 'async_hooks') {
    return `export class AsyncLocalStorage {
  #store;
  run(store, fn, ...args) {
    const prev = this.#store;
    this.#store = store;
    try {
      return fn(...args);
    } finally {
      this.#store = prev;
    }
  }
  getStore() {
    return this.#store;
  }
  enterWith(store) {
    this.#store = store;
  }
  disable() {
    this.#store = undefined;
  }
  exit(fn, ...args) {
    const prev = this.#store;
    this.#store = undefined;
    try {
      return fn(...args);
    } finally {
      this.#store = prev;
    }
  }
}
export default { AsyncLocalStorage };
`
  }

  // Generic empty / proxy stub — enough for accidental client imports.
  return `const stub = new Proxy(function BunNodeBuiltinStub() {}, {
  get() { return stub; },
  apply() { return stub; },
  construct() { return stub; },
});
export default stub;
export const __tanstackNodeBuiltinStub = ${JSON.stringify(spec)};
`
}
