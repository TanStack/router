import { createWebpackPlugin } from 'unplugin'

import { configSchema } from './core/config'
import { unpluginRouterCodeSplitterFactory } from './core/router-code-splitter-plugin'
import { unpluginRouterGeneratorFactory } from './core/router-generator-plugin'
import { unpluginRouterComposedFactory } from './core/router-composed-plugin'
import type {
  UnpluginFactoryOutput,
  WebpackPluginInstance,
} from 'unplugin'
import type { CodeSplittingOptions, Config } from './core/config'

type AutoImportOptions = Partial<Config | (() => Config)> | undefined
type ComposedOptions = Partial<Config> | undefined

/**
 * @example
 * ```ts
 * export default {
 *   // ...
 *   plugins: [TanStackRouterGeneratorWebpack()],
 * }
 * ```
 */
const TanStackRouterGeneratorWebpack: UnpluginFactoryOutput<
  AutoImportOptions,
  WebpackPluginInstance
> = /* #__PURE__ */ createWebpackPlugin(unpluginRouterGeneratorFactory)

/**
 * @example
 * ```ts
 * export default {
 *   // ...
 *   plugins: [TanStackRouterCodeSplitterWebpack()],
 * }
 * ```
 */
const TanStackRouterCodeSplitterWebpack: UnpluginFactoryOutput<
  AutoImportOptions,
  WebpackPluginInstance
> = /* #__PURE__ */ createWebpackPlugin(unpluginRouterCodeSplitterFactory)

/**
 * @example
 * ```ts
 * export default {
 *   // ...
 *   plugins: [tanstackRouter()],
 * }
 * ```
 */
const TanStackRouterWebpack: UnpluginFactoryOutput<
  ComposedOptions,
  WebpackPluginInstance
> = /* #__PURE__ */ createWebpackPlugin(unpluginRouterComposedFactory)

const tanstackRouter: UnpluginFactoryOutput<
  ComposedOptions,
  WebpackPluginInstance
> = TanStackRouterWebpack
export default TanStackRouterWebpack as UnpluginFactoryOutput<
  ComposedOptions,
  WebpackPluginInstance
>
export {
  configSchema,
  TanStackRouterWebpack,
  TanStackRouterGeneratorWebpack,
  TanStackRouterCodeSplitterWebpack,
  tanstackRouter,
}
export type { Config, CodeSplittingOptions }
