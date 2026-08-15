/**
 * Browser HMR client + import.meta.hot shim helpers (served as a module).
 * Used by Bun Start Phase 2; Phase 1 only needs full/client reload handling.
 */

export const HMR_CLIENT_PATH = '/__tanstack_hmr_client.js'
export const HMR_SSE_PATH = '/__tanstack_bun_reload'
export const DEV_CLIENT_PATH = '/@tanstack-dev/client'
export const REACT_REFRESH_PATH = '/__tanstack_react_refresh.js'
export const FS_PREFIX = '/@fs'

/** Source for the browser HMR client module (injected as type=module). */
export function getHmrClientModuleSource(opts: {
  ssePath?: string
  enableReactRefresh?: boolean
}): string {
  const ssePath = JSON.stringify(opts.ssePath ?? HMR_SSE_PATH)
  const enableRefresh = opts.enableReactRefresh === true

  return `const ssePath = ${ssePath};
const enableRefresh = ${enableRefresh ? 'true' : 'false'};
const acceptors = new Map();
const hotData = new Map();

function createHot(url) {
  const key = String(url);
  if (!hotData.has(key)) hotData.set(key, {});
  return {
    get data() { return hotData.get(key); },
    accept(cb) {
      if (typeof cb === 'function') {
        acceptors.set(key, cb);
      } else {
        acceptors.set(key, true);
      }
    },
    prune(cb) { /* no-op stub */ },
    invalidate() {
      location.reload();
    },
    decline() {
      acceptors.delete(key);
    },
  };
}

globalThis.__tanstack_hot__ = createHot;
globalThis.__TANSTACK_HMR__ = {
  acceptors,
  createHot,
  async applyUpdate(modules) {
    const list = Array.isArray(modules) ? modules : [];
    if (!list.length) {
      location.reload();
      return;
    }
    let handled = false;
    for (const id of list) {
      const key = String(id);
      const acceptor = acceptors.get(key);
      try {
        const mod = await import(key + (key.includes('?') ? '&' : '?') + 't=' + Date.now());
        if (typeof acceptor === 'function') {
          acceptor(mod);
          handled = true;
        } else if (acceptor === true) {
          handled = true;
        }
      } catch (err) {
        console.warn('[tanstack-hmr] update failed for', key, err);
        location.reload();
        return;
      }
    }
    if (!handled) {
      location.reload();
    } else if (enableRefresh && globalThis.__tanstack_refresh_runtime__) {
      try {
        globalThis.__tanstack_refresh_runtime__.performReactRefresh();
      } catch (err) {
        console.warn('[tanstack-hmr] react refresh failed', err);
        location.reload();
      }
    }
  },
};

function connect() {
  const es = new EventSource(ssePath);
  es.onmessage = (ev) => {
    let msg = ev.data;
    try { msg = JSON.parse(ev.data); } catch { /* plain string */ }
    const type = typeof msg === 'string' ? msg : msg?.type;
    if (type === 'server-only') {
      return;
    }
    if (type === 'update' && msg?.modules) {
      void globalThis.__TANSTACK_HMR__.applyUpdate(msg.modules);
      return;
    }
    if (type === 'client-reload' || type === 'full-reload' || type === 'reload') {
      location.reload();
      return;
    }
  };
  es.onerror = () => {
    try { es.close(); } catch {}
    setTimeout(connect, 1000);
  };
}
connect();
`
}

/** HTML snippet: load HMR client before app scripts. */
export function getHmrClientScriptTag(): string {
  return `<script type="module" src="${HMR_CLIENT_PATH}"></script>`
}

/**
 * Rewrite Vite-style `import.meta.hot` to the Bun HMR shim so bundled/dev
 * modules can register acceptors.
 *
 * Uses a local const so assignments like `import.meta.hot.data ??= {}` remain valid
 * (optional-chaining on the left-hand side is a SyntaxError).
 */
export function rewriteImportMetaHot(code: string): string {
  if (!code.includes('import.meta.hot')) {
    return code
  }
  const preamble =
    'const __tanstack_import_meta_hot__ = globalThis.__tanstack_hot__?.(import.meta.url);\n'
  return (
    preamble +
    code.replaceAll('import.meta.hot', '__tanstack_import_meta_hot__')
  )
}
