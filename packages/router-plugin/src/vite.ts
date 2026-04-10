import { createVitePlugin } from 'unplugin'

import { configSchema } from './core/config'
import { unpluginRouterCodeSplitterFactory } from './core/router-code-splitter-plugin'
import { unpluginRouterGeneratorFactory } from './core/router-generator-plugin'
import { unpluginRouterComposedFactory } from './core/router-composed-plugin'
import { unpluginRouteAutoImportFactory } from './core/route-autoimport-plugin'
import type { UnpluginFactoryOutput } from 'unplugin'
import type { Plugin as VitePlugin } from 'vite'
import type { CodeSplittingOptions, Config, getConfig } from './core/config'

type AutoImportOptions = Partial<Config | (() => Config)> | undefined
type ComposedOptions = Partial<Config> | undefined
type ViteReturn = VitePlugin | Array<VitePlugin>

const tanstackRouterAutoImport: UnpluginFactoryOutput<
  AutoImportOptions,
  ViteReturn
> = createVitePlugin(unpluginRouteAutoImportFactory)

/**
 * @example
 * ```ts
 * export default defineConfig({
 *   plugins: [tanstackRouterGenerator()],
 *   // ...
 * })
 * ```
 */
const tanstackRouterGenerator: UnpluginFactoryOutput<
  AutoImportOptions,
  ViteReturn
> = createVitePlugin(unpluginRouterGeneratorFactory)

/**
 * @example
 * ```ts
 * export default defineConfig({
 *   plugins: [tanStackRouterCodeSplitter()],
 *   // ...
 * })
 * ```
 */
const tanStackRouterCodeSplitter: UnpluginFactoryOutput<
  AutoImportOptions,
  ViteReturn
> = createVitePlugin(unpluginRouterCodeSplitterFactory)

/**
 * @example
 * ```ts
 * export default defineConfig({
 *   plugins: [tanstackRouter()],
 *   // ...
 * })
 * ```
 */
const tanstackRouter: UnpluginFactoryOutput<ComposedOptions, ViteReturn> =
  createVitePlugin(unpluginRouterComposedFactory)

/**
 * @deprecated Use `tanstackRouter` instead.
 */
const TanStackRouterVite: UnpluginFactoryOutput<ComposedOptions, ViteReturn> =
  tanstackRouter

export default tanstackRouter as UnpluginFactoryOutput<
  ComposedOptions,
  ViteReturn
>
export {
  configSchema,
  getConfig,
  tanstackRouterAutoImport,
  tanStackRouterCodeSplitter,
  tanstackRouterGenerator,
  TanStackRouterVite,
  tanstackRouter,
}

export type { Config, CodeSplittingOptions }
