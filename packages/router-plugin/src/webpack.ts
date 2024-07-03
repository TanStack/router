import { createWebpackPlugin } from 'unplugin'
import { unpluginRouterCodeSplitterFactory } from './code-splitter'
import { configSchema } from './config'
import { unpluginRouterGeneratorFactory } from './router-generator'
import { unpluginRouterComposedFactory } from './composed'
import type { Config } from './config'

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

/**
 * @example
 * ```ts
 * export default {
 *   // ...
 *   plugins: [TanStackRouterWebpack()],
 * }
 * ```
 */
const TanStackRouterWebpack = /* #__PURE__ */ createWebpackPlugin(
  unpluginRouterComposedFactory,
)

export default TanStackRouterWebpack
export {
  configSchema,
  TanStackRouterWebpack,
  TanStackRouterGeneratorWebpack,
  TanStackRouterCodeSplitterWebpack,
}
export type { Config }
