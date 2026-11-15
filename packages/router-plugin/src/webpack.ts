import { createWebpackPlugin } from 'unplugin'

import { configSchema } from './core/config'
import { createRouterCodeSplitterPlugin } from './core/router-code-splitter-plugin'
import { createRouterGeneratorPlugin } from './core/router-generator-plugin'
import { unpluginRouterComposedFactory } from './core/router-composed-plugin'
import { createRouterPluginContext } from './core/router-plugin-context'
import type { CodeSplittingOptions, Config } from './core/config'
import type { RouterPluginContext } from './core/router-plugin-context'

const defaultRouterPluginContext = createRouterPluginContext()

/**
 * @example
 * ```ts
 * export default {
 *   // ...
 *   plugins: [TanStackRouterGeneratorWebpack()],
 * }
 * ```
 */
const TanStackRouterGeneratorWebpack = (
  options?: Partial<Config>,
  routerPluginContext?: RouterPluginContext,
) => {
  const pluginContext = routerPluginContext ?? defaultRouterPluginContext
  return createWebpackPlugin((pluginOptions: Partial<Config> | undefined) =>
    createRouterGeneratorPlugin(pluginOptions, pluginContext),
  )(options)
}

/**
 * Route HMR in development goes through `import.meta.webpackHot`.
 *
 * @example
 * ```ts
 * export default {
 *   // ...
 *   plugins: [TanStackRouterCodeSplitterWebpack()],
 * }
 * ```
 */
const TanStackRouterCodeSplitterWebpack = (
  options?: Partial<Config>,
  routerPluginContext?: RouterPluginContext,
) => {
  const pluginContext = routerPluginContext ?? defaultRouterPluginContext
  return createWebpackPlugin((pluginOptions: Partial<Config> | undefined) =>
    createRouterCodeSplitterPlugin(pluginOptions, pluginContext, 'webpack'),
  )(options)
}

/**
 * @example
 * ```ts
 * export default {
 *   // ...
 *   plugins: [tanstackRouter()],
 * }
 * ```
 */
const TanStackRouterWebpack = /* #__PURE__ */ createWebpackPlugin(
  unpluginRouterComposedFactory,
)

const tanstackRouter = TanStackRouterWebpack
export default TanStackRouterWebpack
export {
  configSchema,
  TanStackRouterWebpack,
  TanStackRouterGeneratorWebpack,
  TanStackRouterCodeSplitterWebpack,
  tanstackRouter,
}
export type { Config, CodeSplittingOptions, RouterPluginContext }
