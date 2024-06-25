import { createRspackPlugin } from 'unplugin'
// import { unpluginRouterCodeSplitterFactory } from './code-splitter'
import { configSchema } from './config'
import { unpluginRouterGeneratorFactory } from './router-generator'
import { unpluginRouterComposedFactory } from './composed'
import type { Config } from './config'
import { unpluginRsPackRouterCodeSplitterFactory } from './demo-rspack-code-splitter'

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
 * @experimental Do not use this plugin yet
 *
 * Unplugin's Rspack integration doesn't support the `resolveId` and `transform` hooks.
 * The code-splitter won't work with Rspack and will probably break your dev and build.
 *
 * If you're familiar with Rspack and know how to overcome our `resolveId` and `transform`
 * limitations, please let us know.
 * We'd love to support it, but we're not sure how to do it yet 😅.
 *
 * @example
 * ```ts
 * export default defineConfig({
 *   // ...
 *   tools: {
 *     rspack: {
 *       plugins: [unstable_TanStackRouterCodeSplitterRspack()],
 *     },
 *   },
 * })
 * ```
 */
// const unstable_TanStackRouterCodeSplitterRspack =
//   /* #__PURE__ */ createRspackPlugin(unpluginRouterCodeSplitterFactory)

const unstable_TanStackRouterCodeSplitterRspackTest =
  /* #__PURE__ */ createRspackPlugin(unpluginRsPackRouterCodeSplitterFactory)

/**
 * @example
 * ```ts
 * export default defineConfig({
 *   // ...
 *   tools: {
 *     rspack: {
 *       plugins: [TanStackRouterRspack()],
 *     },
 *   },
 * })
 * ```
 */
const TanStackRouterRspack = /* #__PURE__ */ createRspackPlugin(
  unpluginRouterComposedFactory,
)

export default TanStackRouterRspack
export {
  configSchema,
  TanStackRouterRspack,
  TanStackRouterGeneratorRspack,
  // unstable_TanStackRouterCodeSplitterRspack,
  unstable_TanStackRouterCodeSplitterRspackTest,
}
export type { Config }
