/**
 * React Refresh helpers for Bun Start Phase 2c.
 */

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export function getReactRefreshRuntimeSource(): string {
  try {
    const runtimePath = require.resolve('react-refresh/runtime')
    // Prefer CJS runtime wrapped as ESM for the browser
    return `
import runtime from ${JSON.stringify(runtimePath)};
runtime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
window.__tanstack_refresh_runtime__ = runtime;
export default runtime;
`
  } catch {
    return `
export function performReactRefresh() {}
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__tanstack_refresh_runtime__ = { performReactRefresh() {} };
`
  }
}

/**
 * Browser-safe React Refresh runtime bundle.
 * We inline a minimal shim when react-refresh cannot be resolved for the browser;
 * Bun.dev middleware will prefer serving the package via /@id/react-refresh/runtime.
 */
export function getReactRefreshBrowserEntry(): string {
  return `import * as RefreshRuntime from '/@id/${encodeURIComponent('react-refresh/runtime')}?importer=${encodeURIComponent(import.meta.url)}';
const runtime = RefreshRuntime.default ?? RefreshRuntime;
runtime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
window.__tanstack_refresh_runtime__ = runtime;
export default runtime;
`
}

export function getReactRefreshPreambleHtml(
  refreshModulePath: string,
): string {
  return `<script type="module">
import { injectIntoGlobalHook } from ${JSON.stringify(refreshModulePath)};
injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
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
