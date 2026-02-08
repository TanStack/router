import { createRspackPlugin } from 'unplugin'

import { configSchema } from './core/config'
import { unpluginRouterCodeSplitterFactory } from './core/router-code-splitter-plugin'
import { unpluginRouterGeneratorFactory } from './core/router-generator-plugin'
import { unpluginRouterComposedFactory } from './core/router-composed-plugin'
import { unpluginRouteAutoImportFactory } from './core/route-autoimport-plugin'
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
  unpluginRouterCodeSplitterFactory,
)

const tanstackRouterGenerator = TanStackRouterGeneratorRspack
const tanstackRouterCodeSplitter = TanStackRouterCodeSplitterRspack

const TanStackRouterAutoImportRspack = /* #__PURE__ */ createRspackPlugin(
  unpluginRouteAutoImportFactory,
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
  unpluginRouterComposedFactory,
)
const tanstackRouter = TanStackRouterRspack
const tanstackRouterAutoImport = TanStackRouterAutoImportRspack
export default TanStackRouterRspack
export {
  configSchema,
  TanStackRouterRspack,
  TanStackRouterGeneratorRspack,
  TanStackRouterCodeSplitterRspack,
  TanStackRouterAutoImportRspack,
  tanstackRouterGenerator,
  tanstackRouterCodeSplitter,
  tanstackRouterAutoImport,
  tanstackRouter,
}
export type { Config, CodeSplittingOptions }
