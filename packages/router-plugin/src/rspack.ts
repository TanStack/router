import { createRspackPlugin } from 'unplugin'

import { configSchema, splitterOptions } from './core/config'
import { createRouterGeneratorPlugin } from './core/router-generator-plugin'
import { createRouterPluginContext } from './core/router-plugin-context'
import { createRouterCompilerWebpackPlugin } from './hosts/webpack'
import { INLINE_CSS_DEFAULT_DEFINES } from './core/inline-css-defaults'
import type { CompilerLike } from './hosts/webpack'
import type { CodeSplittingOptions, Config } from './core/config'
import type { RouterPluginContext } from './core/router-plugin-context'
import type { Rspack } from '@rsbuild/core'

type RspackPluginInstance = Rspack.RspackPluginInstance

type RspackRouterPluginOptions = Partial<Config> | (() => Partial<Config>)

const defaultRouterPluginContext = createRouterPluginContext()

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
const TanStackRouterGeneratorRspack = (
  options?: RspackRouterPluginOptions,
  routerPluginContext?: RouterPluginContext,
) => {
  const pluginContext = routerPluginContext ?? defaultRouterPluginContext
  return createRspackPlugin((pluginOptions) =>
    createRouterGeneratorPlugin(
      pluginOptions as Partial<Config | (() => Config)> | undefined,
      pluginContext,
    ),
  )(options)
}

/**
 * The route compiler alone (route splitting, and route HMR in development).
 * Rspack uses webpack-compatible `import.meta.webpackHot` HMR, which the
 * compiler emits for it.
 *
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
const TanStackRouterCodeSplitterRspack = (
  options?: RspackRouterPluginOptions,
  routerPluginContext?: RouterPluginContext,
): RspackPluginInstance => {
  const pluginContext = routerPluginContext ?? defaultRouterPluginContext
  return createRouterCompilerWebpackPlugin(
    splitterOptions(options),
    pluginContext,
    'rspack',
  ) as RspackPluginInstance
}

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
const TanStackRouterRspack = (
  options?: RspackRouterPluginOptions,
): RspackPluginInstance => {
  const routerPluginContext = createRouterPluginContext()
  const generator = TanStackRouterGeneratorRspack(options, routerPluginContext)
  const compiler = createRouterCompilerWebpackPlugin(
    options,
    routerPluginContext,
    'rspack',
  )
  return {
    apply(rspackCompiler: Rspack.Compiler) {
      new rspackCompiler.webpack.DefinePlugin(INLINE_CSS_DEFAULT_DEFINES).apply(
        rspackCompiler,
      )
      generator.apply(rspackCompiler)
      compiler.apply(rspackCompiler as unknown as CompilerLike)
    },
  }
}
const tanstackRouter = TanStackRouterRspack
export default TanStackRouterRspack
export {
  configSchema,
  TanStackRouterRspack,
  TanStackRouterGeneratorRspack,
  TanStackRouterCodeSplitterRspack,
  tanstackRouter,
}
export type { Config, CodeSplittingOptions, RouterPluginContext }
