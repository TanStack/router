import { createVitePlugin } from 'unplugin'

import { configSchema, getConfig } from './core/config'
import { createRouterGeneratorPlugin } from './core/router-generator-plugin'
import { createRouterPluginContext } from './core/router-plugin-context'
import { createRouterCompilerVitePlugin } from './hosts/vite'
import { INLINE_CSS_DEFAULT_DEFINES } from './core/inline-css-defaults'
import type { CodeSplittingOptions, Config } from './core/config'
import type { RouterPluginContext } from './core/router-plugin-context'
import type { Plugin, PluginOption } from 'vite'

type RouterPluginOptions = Partial<Config | (() => Config)> | undefined

const defaultRouterPluginContext = createRouterPluginContext()

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
  routerPluginContext?: RouterPluginContext,
) => {
  const pluginContext = routerPluginContext ?? defaultRouterPluginContext
  return createVitePlugin((pluginOptions: RouterPluginOptions) =>
    createRouterGeneratorPlugin(pluginOptions, pluginContext),
  )(options)
}

/**
 * The route compiler alone: code splitting (`autoCodeSplitting`) and route
 * HMR (dev, `codeSplittingOptions.addHmr`).
 *
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
  routerPluginContext?: RouterPluginContext,
): Plugin => {
  const pluginContext = routerPluginContext ?? defaultRouterPluginContext
  return createRouterCompilerVitePlugin(options, pluginContext)
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
const tanstackRouter = (
  options: RouterPluginOptions = {},
): Array<PluginOption> => {
  const routerPluginContext = createRouterPluginContext()
  const inlineCssDefaults: Plugin = {
    name: 'tanstack:router-inline-css-defaults',
    config() {
      return { define: { ...INLINE_CSS_DEFAULT_DEFINES } }
    },
  }
  return [
    inlineCssDefaults,
    tanstackRouterGenerator(options, routerPluginContext),
    createRouterCompilerVitePlugin(options, routerPluginContext),
  ]
}

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
