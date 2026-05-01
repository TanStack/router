import { createVitePlugin } from 'unplugin'

import { configSchema, getConfig } from './core/config'
import { createRouterCodeSplitterPlugin } from './core/router-code-splitter-plugin'
import { createRouterGeneratorPlugin } from './core/router-generator-plugin'
import { unpluginRouterComposedFactory } from './core/router-composed-plugin'
import { defaultRouterPluginContext } from './core/router-plugin-context'
import type { CodeSplittingOptions, Config } from './core/config'
import type { RouterPluginContext } from './core/router-plugin-context'

type RouterPluginOptions = Partial<Config | (() => Config)> | undefined

/**
 * @example
 * ```ts
 * export default defineConfig({
 *   plugins: [tanstackRouterGenerator()],
 *   // ...
 * })
 * ```
 */
const tanstackRouterGenerator = (
  options?: RouterPluginOptions,
  routerPluginContext: RouterPluginContext = defaultRouterPluginContext,
) => {
  return createVitePlugin((pluginOptions: RouterPluginOptions) =>
    createRouterGeneratorPlugin(pluginOptions, routerPluginContext),
  )(options)
}

/**
 * @example
 * ```ts
 * export default defineConfig({
 *   plugins: [tanStackRouterCodeSplitter()],
 *   // ...
 * })
 * ```
 */
const tanStackRouterCodeSplitter = (
  options?: RouterPluginOptions,
  routerPluginContext: RouterPluginContext = defaultRouterPluginContext,
) => {
  return createVitePlugin((pluginOptions: RouterPluginOptions) =>
    createRouterCodeSplitterPlugin(pluginOptions, routerPluginContext),
  )(options)
}

/**
 * @example
 * ```ts
 * export default defineConfig({
 *   plugins: [tanstackRouter()],
 *   // ...
 * })
 * ```
 */
const tanstackRouter = createVitePlugin(unpluginRouterComposedFactory)

/**
 * @deprecated Use `tanstackRouter` instead.
 */
const TanStackRouterVite = tanstackRouter

export default tanstackRouter
export {
  configSchema,
  getConfig,
  tanStackRouterCodeSplitter,
  tanstackRouterGenerator,
  TanStackRouterVite,
  tanstackRouter,
}

export type { Config, CodeSplittingOptions, RouterPluginContext }
