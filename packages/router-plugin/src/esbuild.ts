import { createEsbuildPlugin } from 'unplugin'

import { configSchema } from './core/config'
import { unpluginRouterCodeSplitterFactory } from './core/router-code-splitter-plugin'
import { unpluginRouterGeneratorFactory } from './core/router-generator-plugin'
import { unpluginRouterComposedFactory } from './core/router-composed-plugin'

import type { EsbuildPlugin, UnpluginFactoryOutput } from 'unplugin'
import type { CodeSplittingOptions, Config } from './core/config'

type AutoImportOptions = Partial<Config | (() => Config)> | undefined
type ComposedOptions = Partial<Config> | undefined

/**
 * @example
 * ```ts
 * export default {
 *   plugins: [TanStackRouterGeneratorEsbuild()],
 *   // ...
 * }
 * ```
 */
const TanStackRouterGeneratorEsbuild: UnpluginFactoryOutput<
  AutoImportOptions,
  EsbuildPlugin
> = createEsbuildPlugin(unpluginRouterGeneratorFactory)

/**
 * @example
 * ```ts
 * export default {
 *  plugins: [TanStackRouterCodeSplitterEsbuild()],
 *  // ...
 * }
 * ```
 */
const TanStackRouterCodeSplitterEsbuild: UnpluginFactoryOutput<
  AutoImportOptions,
  EsbuildPlugin
> = createEsbuildPlugin(unpluginRouterCodeSplitterFactory)

/**
 * @example
 * ```ts
 * export default {
 *   plugins: [tanstackRouter()],
 *   // ...
 * }
 * ```
 */
const TanStackRouterEsbuild: UnpluginFactoryOutput<
  ComposedOptions,
  EsbuildPlugin
> = createEsbuildPlugin(unpluginRouterComposedFactory)
const tanstackRouter: UnpluginFactoryOutput<ComposedOptions, EsbuildPlugin> =
  TanStackRouterEsbuild
export default TanStackRouterEsbuild as UnpluginFactoryOutput<
  ComposedOptions,
  EsbuildPlugin
>

export {
  configSchema,
  TanStackRouterGeneratorEsbuild,
  TanStackRouterCodeSplitterEsbuild,
  TanStackRouterEsbuild,
  tanstackRouter,
}

export type { Config, CodeSplittingOptions }
