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
 * @experimental Do not use this plugin yet
 *
 * Unplugin's Webpack integration doesn't support the `resolveId` and `transform` hooks.
 * The code-splitter won't work with Webpack and will probably break your dev and build.
 *
 * If you're familiar with Webpack and know how to overcome our `resolveId` and `transform`
 * limitations, please let us know.
 * We'd love to support it, but we're not sure how to do it yet 😅.
 *
 * @example
 * ```ts
 * export default {
 *   // ...
 *   plugins: [unstable_TanStackRouterCodeSplitterWebpack()],
 * }
 * ```
 */
const unstable_TanStackRouterCodeSplitterWebpack =
  /* #__PURE__ */ createWebpackPlugin(unpluginRouterCodeSplitterFactory)

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
  unstable_TanStackRouterCodeSplitterWebpack,
}
export type { Config }
