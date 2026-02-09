import { createWebpackPlugin } from 'unplugin'

import { configSchema } from './core/config'
import { unpluginRouterCodeSplitterFactory } from './core/router-code-splitter-plugin'
import { unpluginRouterGeneratorFactory } from './core/router-generator-plugin'
import { unpluginRouterComposedFactory } from './core/router-composed-plugin'
import { unpluginRouteAutoImportFactory } from './core/route-autoimport-plugin'
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
  unpluginRouterCodeSplitterFactory,
)

const TanStackRouterAutoImportWebpack = /* #__PURE__ */ createWebpackPlugin(
  unpluginRouteAutoImportFactory,
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
  unpluginRouterComposedFactory,
)

const tanstackRouterGenerator = TanStackRouterGeneratorWebpack
const tanstackRouterCodeSplitter = TanStackRouterCodeSplitterWebpack
const tanstackRouterAutoImport = TanStackRouterAutoImportWebpack
const tanstackRouter = TanStackRouterWebpack
export default TanStackRouterWebpack
export {
  configSchema,
  TanStackRouterWebpack,
  TanStackRouterGeneratorWebpack,
  TanStackRouterCodeSplitterWebpack,
  TanStackRouterAutoImportWebpack,
  tanstackRouterGenerator,
  tanstackRouterCodeSplitter,
  tanstackRouterAutoImport,
  tanstackRouter,
}
export type { Config, CodeSplittingOptions }
