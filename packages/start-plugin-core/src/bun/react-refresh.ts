/**
 * React Refresh helpers for Bun Start Phase 2c.
 */

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

let cachedBrowserRefreshEntry: string | null = null

function getMinimalReactRefreshShim(): string {
  return `export function injectIntoGlobalHook(_global) {}
export function performReactRefresh() {}
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
const runtime = { injectIntoGlobalHook, performReactRefresh };
window.__tanstack_refresh_runtime__ = runtime;
export default runtime;
`
}

/**
 * @deprecated Prefer getReactRefreshBrowserEntry(); kept for callers that need sync.
 */
export function getReactRefreshRuntimeSource(): string {
  return getMinimalReactRefreshShim()
}

/**
 * Browser-safe React Refresh runtime (ESM).
 * Bundles CJS `react-refresh/runtime` via Bun.build — never serve raw CJS
 * (`module is not defined` in the browser).
 */
export async function getReactRefreshBrowserEntry(): Promise<string> {
  if (cachedBrowserRefreshEntry) {
    return cachedBrowserRefreshEntry
  }

  try {
    const runtimePath = require.resolve('react-refresh/runtime')
    const built = await Bun.build({
      entrypoints: [runtimePath],
      target: 'browser',
      format: 'esm',
      write: false,
    } as never)
    if (!built.success || !built.outputs[0]) {
      cachedBrowserRefreshEntry = getMinimalReactRefreshShim()
      return cachedBrowserRefreshEntry
    }

    const bundled = await built.outputs[0].text()
    cachedBrowserRefreshEntry = wrapBundledRefreshRuntime(bundled)
    return cachedBrowserRefreshEntry
  } catch {
    cachedBrowserRefreshEntry = getMinimalReactRefreshShim()
    return cachedBrowserRefreshEntry
  }
}

function wrapBundledRefreshRuntime(bundledEsm: string): string {
  // Bun CJS→ESM typically ends with `export default require_xxx();`
  const rewritten = bundledEsm.replace(
    /export\s+default\s+([^;]+);?\s*$/,
    'const __RefreshRuntime = $1;',
  )
  if (rewritten === bundledEsm) {
    return getMinimalReactRefreshShim()
  }
  return `${rewritten}
if (typeof __RefreshRuntime?.injectIntoGlobalHook === 'function') {
  __RefreshRuntime.injectIntoGlobalHook(window);
}
window.$RefreshReg$ = (type, id) => {
  __RefreshRuntime.register(type, id);
};
window.$RefreshSig$ = () =>
  __RefreshRuntime.createSignatureFunctionForTransform();
window.__vite_plugin_react_preamble_installed__ = true;
window.__tanstack_refresh_runtime__ = __RefreshRuntime;
export default __RefreshRuntime;
export const injectIntoGlobalHook = (...args) =>
  __RefreshRuntime.injectIntoGlobalHook?.(...args);
export const performReactRefresh = (...args) =>
  __RefreshRuntime.performReactRefresh?.(...args);
`
}

export function getReactRefreshPreambleHtml(
  refreshModulePath: string,
): string {
  return `<script type="module">
import RefreshRuntime from ${JSON.stringify(refreshModulePath)};
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = (type, id) => {
  RefreshRuntime.register(type, id);
};
window.$RefreshSig$ = () =>
  RefreshRuntime.createSignatureFunctionForTransform();
window.__vite_plugin_react_preamble_installed__ = true;
</script>`
}

/**
 * Apply react-refresh/babel when available. Falls back to identity.
 */
export async function applyReactRefreshBabel(
  code: string,
  filename: string,
): Promise<string> {
  try {
    const babel = await import('@babel/core')
    let refreshPlugin: unknown
    try {
      refreshPlugin = require('react-refresh/babel')
    } catch {
      return code
    }

    const result = babel.transformSync(code, {
      filename,
      babelrc: false,
      configFile: false,
      plugins: [
        [
          refreshPlugin,
          {
            skipEnvCheck: true,
          },
        ],
      ],
      // Already transpiled by Bun.Transpiler; parse as plain JS/JSX
      sourceType: 'module',
      parserOpts: {
        sourceType: 'module',
        plugins: ['jsx'],
      },
    })

    return result?.code ?? code
  } catch {
    return code
  }
}
