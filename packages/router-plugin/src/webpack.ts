import { createWebpackPlugin } from 'unplugin'

import { configSchema, splitterOptions } from './core/config'
import { createRouterGeneratorPlugin } from './core/router-generator-plugin'
import { createRouterPluginContext } from './core/router-plugin-context'
import { createRouterCompilerWebpackPlugin } from './hosts/webpack'
import { INLINE_CSS_DEFAULT_DEFINES } from './core/inline-css-defaults'
import type { CompilerLike } from './hosts/webpack'
import type { CodeSplittingOptions, Config } from './core/config'
import type { RouterPluginContext } from './core/router-plugin-context'
import type { WebpackPluginInstance } from 'webpack'

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
 * The route compiler alone (route splitting, and route HMR in development
 * through `import.meta.webpackHot`).
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
): WebpackPluginInstance => {
  const pluginContext = routerPluginContext ?? defaultRouterPluginContext
  return createRouterCompilerWebpackPlugin(
    splitterOptions(options),
    pluginContext,
    'webpack',
  ) as WebpackPluginInstance
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
const TanStackRouterWebpack = (
  options?: Partial<Config>,
): WebpackPluginInstance => {
  const routerPluginContext = createRouterPluginContext()
  const generator = TanStackRouterGeneratorWebpack(options, routerPluginContext)
  const compiler = createRouterCompilerWebpackPlugin(
    options,
    routerPluginContext,
    'webpack',
  )
  return {
    apply(webpackCompiler) {
      new webpackCompiler.webpack.DefinePlugin(
        INLINE_CSS_DEFAULT_DEFINES,
      ).apply(webpackCompiler)
      generator.apply(webpackCompiler)
      compiler.apply(webpackCompiler as unknown as CompilerLike)
    },
  }
}

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
