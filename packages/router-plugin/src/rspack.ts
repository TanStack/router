import { createRspackPlugin } from 'unplugin'

import { configSchema } from './core/config'
import { withHmrHotExpression } from './core/hmr-hot-expression'
import { unpluginRouterCodeSplitterFactory } from './core/router-code-splitter-plugin'
import { unpluginRouterGeneratorFactory } from './core/router-generator-plugin'
import { unpluginRouterComposedFactory } from './core/router-composed-plugin'
import type { CodeSplittingOptions, Config } from './core/config'

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
      withHmrHotExpression(
        options as Partial<Config> | undefined,
        'import.meta.webpackHot',
      ),
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
      withHmrHotExpression(
        options as Partial<Config> | undefined,
        'import.meta.webpackHot',
      ),
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
