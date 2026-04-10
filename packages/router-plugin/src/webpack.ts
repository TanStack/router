import { createWebpackPlugin } from 'unplugin'

import { configSchema } from './core/config'
import { withHmrHotExpression } from './core/hmr-hot-expression'
import { unpluginRouterCodeSplitterFactory } from './core/router-code-splitter-plugin'
import { unpluginRouterGeneratorFactory } from './core/router-generator-plugin'
import { unpluginRouterComposedFactory } from './core/router-composed-plugin'
import type { CodeSplittingOptions, Config } from './core/config'

/**
 * @example
 * ```ts
 * export default {
 *   // ...
 *   plugins: [TanStackRouterGeneratorWebpack()],
 * }
 * ```
 */
const TanStackRouterGeneratorWebpack = /* #__PURE__ */ createWebpackPlugin(
  unpluginRouterGeneratorFactory,
)

/**
 * @example
 * ```ts
 * export default {
 *   // ...
 *   plugins: [TanStackRouterCodeSplitterWebpack()],
 * }
 * ```
 */
const TanStackRouterCodeSplitterWebpack = /* #__PURE__ */ createWebpackPlugin(
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
 * export default {
 *   // ...
 *   plugins: [tanstackRouter()],
 * }
 * ```
 */
const TanStackRouterWebpack = /* #__PURE__ */ createWebpackPlugin(
  (options, meta) =>
    unpluginRouterComposedFactory(
      withHmrHotExpression(
        options as Partial<Config> | undefined,
        'import.meta.webpackHot',
      ),
      meta,
    ),
)

const tanstackRouter = TanStackRouterWebpack
export default TanStackRouterWebpack
export {
  configSchema,
  TanStackRouterWebpack,
  TanStackRouterGeneratorWebpack,
  TanStackRouterCodeSplitterWebpack,
  tanstackRouter,
}
export type { Config, CodeSplittingOptions }
