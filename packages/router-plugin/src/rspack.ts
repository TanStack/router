import { createRspackPlugin } from 'unplugin'

import { configSchema } from './core/config'
import { unpluginRouterCodeSplitterFactory } from './core/router-code-splitter-plugin'
import { unpluginRouterGeneratorFactory } from './core/router-generator-plugin'
import { unpluginRouterComposedFactory } from './core/router-composed-plugin'
import type {
  RspackPluginInstance,
  UnpluginFactoryOutput,
} from 'unplugin'
import type { CodeSplittingOptions, Config } from './core/config'

type AutoImportOptions = Partial<Config | (() => Config)> | undefined
type ComposedOptions = Partial<Config> | undefined

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
const TanStackRouterGeneratorRspack: UnpluginFactoryOutput<
  AutoImportOptions,
  RspackPluginInstance
> = /* #__PURE__ */ createRspackPlugin(unpluginRouterGeneratorFactory)

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
const TanStackRouterCodeSplitterRspack: UnpluginFactoryOutput<
  AutoImportOptions,
  RspackPluginInstance
> = /* #__PURE__ */ createRspackPlugin(unpluginRouterCodeSplitterFactory)

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
const TanStackRouterRspack: UnpluginFactoryOutput<
  ComposedOptions,
  RspackPluginInstance
> = /* #__PURE__ */ createRspackPlugin(unpluginRouterComposedFactory)
const tanstackRouter: UnpluginFactoryOutput<
  ComposedOptions,
  RspackPluginInstance
> = TanStackRouterRspack
export default TanStackRouterRspack as UnpluginFactoryOutput<
  ComposedOptions,
  RspackPluginInstance
>
export {
  configSchema,
  TanStackRouterRspack,
  TanStackRouterGeneratorRspack,
  TanStackRouterCodeSplitterRspack,
  tanstackRouter,
}
export type { Config, CodeSplittingOptions }
