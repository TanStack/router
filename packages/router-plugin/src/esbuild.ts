import { createEsbuildPlugin } from 'unplugin'

import { configSchema, getConfig } from './core/config'
import { createRouterGeneratorPlugin } from './core/router-generator-plugin'
import { createRouterPluginContext } from './core/router-plugin-context'
import { INLINE_CSS_DEFAULT_DEFINES } from './core/inline-css-defaults'

import type { CodeSplittingOptions, Config } from './core/config'
import type { RouterPluginContext } from './core/router-plugin-context'
import type { UnpluginOptions } from 'unplugin'

type RouterPluginOptions = Partial<Config | (() => Config)> | undefined

const defaultRouterPluginContext = createRouterPluginContext()

const ESBUILD_SPLITTING_ERROR =
  '@tanstack/router-plugin: route code splitting (`autoCodeSplitting`) is not supported with esbuild. ' +
  'Use the generator alone (`TanStackRouterGeneratorEsbuild`), or set `autoCodeSplitting: false`.'

function refuseSplitting(options: RouterPluginOptions) {
  const config =
    typeof options === 'function'
      ? options()
      : getConfig(options ?? {}, process.cwd())
  if (config.autoCodeSplitting) {
    throw new Error(ESBUILD_SPLITTING_ERROR)
  }
}

/**
 * @example
 * ```ts
 * export default {
 *   plugins: [TanStackRouterGeneratorEsbuild()],
 *   // ...
 * }
 * ```
 */
const TanStackRouterGeneratorEsbuild = (
  options?: RouterPluginOptions,
  routerPluginContext?: RouterPluginContext,
) => {
  const pluginContext = routerPluginContext ?? defaultRouterPluginContext
  return createEsbuildPlugin((pluginOptions: RouterPluginOptions) =>
    createRouterGeneratorPlugin(pluginOptions, pluginContext),
  )(options)
}

/**
 * Route code splitting is not available with esbuild (SPEC J2.18): this
 * entry refuses clearly.
 */
const TanStackRouterCodeSplitterEsbuild = (
  _options?: RouterPluginOptions,
  _routerPluginContext?: RouterPluginContext,
): never => {
  throw new Error(ESBUILD_SPLITTING_ERROR)
}

type EsbuildOptionsWithDefine = Parameters<
  NonNullable<NonNullable<UnpluginOptions['esbuild']>['config']>
>[0]

/**
 * @example
 * ```ts
 * export default {
 *   plugins: [tanstackRouter()],
 *   // ...
 * }
 * ```
 */
const TanStackRouterEsbuild = (options: RouterPluginOptions = {}) => {
  refuseSplitting(options)
  const routerPluginContext = createRouterPluginContext()
  return createEsbuildPlugin((pluginOptions: RouterPluginOptions) => [
    {
      name: 'tanstack:router-inline-css-defaults',
      esbuild: {
        config(esbuildOptions: EsbuildOptionsWithDefine) {
          esbuildOptions.define = {
            ...INLINE_CSS_DEFAULT_DEFINES,
            ...esbuildOptions.define,
          }
        },
      },
    },
    ...[createRouterGeneratorPlugin(pluginOptions, routerPluginContext)].flat(),
  ])(options)
}
const tanstackRouter = TanStackRouterEsbuild
export default TanStackRouterEsbuild

export {
  configSchema,
  TanStackRouterGeneratorEsbuild,
  TanStackRouterCodeSplitterEsbuild,
  TanStackRouterEsbuild,
  tanstackRouter,
}

export type { Config, CodeSplittingOptions, RouterPluginContext }
