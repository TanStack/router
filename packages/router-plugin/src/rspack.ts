import { createRspackPlugin } from 'unplugin'

import { configSchema } from './core/config'
import { unpluginRouterCodeSplitterFactory } from './core/router-code-splitter-plugin'
import { unpluginRouterGeneratorFactory } from './core/router-generator-plugin'
import { unpluginRouterComposedFactory } from './core/router-composed-plugin'
import type { CodeSplittingOptions, Config } from './core/config'

/**
 * Rspack uses webpack-compatible `module.hot` / `import.meta.webpackHot` HMR.
 * Force `plugin.hmr.style = 'webpack'` so the router HMR adapter emits
 * `module.hot`-style accept/dispose code instead of Vite's callback-receive
 * variant, regardless of what the user passes (or doesn't pass).
 */
function withWebpackHmrStyle(
  options: Partial<Config> | undefined,
): Partial<Config> {
  return {
    ...options,
    plugin: {
      ...options?.plugin,
      hmr: {
        ...options?.plugin?.hmr,
        style: 'webpack',
      },
    },
  }
}

/**
 * @example
 * ```ts
 * export default defineConfig({
 *   // ...
 *   tools: {
 *     rspack: {
 *       plugins: [TanStackRouterGeneratorRspack()],
 *     },
 *   },
 * })
 * ```
 */
const TanStackRouterGeneratorRspack = /* #__PURE__ */ createRspackPlugin(
  unpluginRouterGeneratorFactory,
)

/**
 * @example
 * ```ts
 * export default defineConfig({
 *   // ...
 *   tools: {
 *     rspack: {
 *       plugins: [TanStackRouterCodeSplitterRspack()],
 *     },
 *   },
 * })
 * ```
 */
const TanStackRouterCodeSplitterRspack = /* #__PURE__ */ createRspackPlugin(
  (options, meta) =>
    unpluginRouterCodeSplitterFactory(
      withWebpackHmrStyle(options as Partial<Config> | undefined),
      meta,
    ),
)

/**
 * @example
 * ```ts
 * export default defineConfig({
 *   // ...
 *   tools: {
 *     rspack: {
 *       plugins: [tanstackRouter()],
 *     },
 *   },
 * })
 * ```
 */
const TanStackRouterRspack = /* #__PURE__ */ createRspackPlugin(
  (options, meta) =>
    unpluginRouterComposedFactory(
      withWebpackHmrStyle(options as Partial<Config> | undefined),
      meta,
    ),
)
const tanstackRouter = TanStackRouterRspack
export default TanStackRouterRspack
export {
  configSchema,
  TanStackRouterRspack,
  TanStackRouterGeneratorRspack,
  TanStackRouterCodeSplitterRspack,
  tanstackRouter,
}
export type { Config, CodeSplittingOptions }
