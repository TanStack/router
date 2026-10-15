/**
 * It is important to familiarize yourself with how the code-splitting works in this plugin.
 * https://github.com/TanStack/router/pull/3355
 */

import { fileURLToPath, pathToFileURL } from 'node:url'
import { decodeIdentifier, logDiff } from '@tanstack/router-utils'
import { getConfig, splitGroupingsSchema } from './config'
import {
  analyzeRouteModule,
  compileCodeSplitReferenceRoute,
  compileCodeSplitSharedRoute,
  compileCodeSplitVirtualRoute,
  computeSharedBindings,
  createRouteInFunctionMessage,
  detectCodeSplitGroupingsFromRoute,
} from './code-splitter/compilers'
import { getFrameworkHmrCompilerPlugins } from './code-splitter/plugins/framework-plugins'
import {
  defaultCodeSplitGroupings,
  splitRouteIdentNodes,
  tsrShared,
  tsrSplit,
} from './constants'
import { debug, normalizePath, routeFactoryCallCodeFilter } from './utils'
import { createRouterPluginContext } from './router-plugin-context'
import type { RouteModuleAnalysis } from './code-splitter/compilers'
import type { CodeSplitGroupings, SplitRouteIdentNodes } from './constants'
import type { GetRoutesByFileMapResultValue } from '@tanstack/router-generator'
import type { CodeSplitCompilerPlugin } from './code-splitter/plugins'
import type { Config, HmrStyle } from './config'
import type { RouterPluginContext } from './router-plugin-context'
import type {
  UnpluginFactory,
  TransformResult as UnpluginTransformResult,
} from 'unplugin'

const CODE_SPLITTER_PLUGIN_NAME =
  'tanstack-router:code-splitter:compile-reference-file'

type TransformationPluginInfo = {
  pluginNames: Array<string>
  pkg: string
  usage: string
}

/**
 * JSX transformation plugins grouped by framework.
 * These plugins must come AFTER the TanStack Router plugin in the Vite config.
 */
const TRANSFORMATION_PLUGINS_BY_FRAMEWORK: Record<
  string,
  Array<TransformationPluginInfo>
> = {
  react: [
    {
      // Babel-based React plugin
      pluginNames: ['vite:react-babel', 'vite:react-refresh'],
      pkg: '@vitejs/plugin-react',
      usage: 'react()',
    },
    {
      // SWC-based React plugin
      pluginNames: ['vite:react-swc', 'vite:react-swc:resolve-runtime'],
      pkg: '@vitejs/plugin-react-swc',
      usage: 'reactSwc()',
    },
    {
      // OXC-based React plugin (deprecated but should still be handled)
      pluginNames: ['vite:react-oxc:config', 'vite:react-oxc:refresh-runtime'],
      pkg: '@vitejs/plugin-react-oxc',
      usage: 'reactOxc()',
    },
  ],
  solid: [
    {
      pluginNames: ['solid'],
      pkg: 'vite-plugin-solid',
      usage: 'solid()',
    },
  ],
}

export function createRouterCodeSplitterPlugin(
  options: Partial<Config | (() => Config)> | undefined = {},
  routerPluginContext: RouterPluginContext,
): ReturnType<UnpluginFactory<Partial<Config | (() => Config)> | undefined>> {
  let ROOT: string = process.cwd()
  let userConfig: Config
  let addHmr: boolean
  let hmrStyle: HmrStyle
  let compilerPlugins: Array<CodeSplitCompilerPlugin>
  let virtualRouteCompilerPlugins: Array<CodeSplitCompilerPlugin>

  let isProduction = process.env.NODE_ENV === 'production'

  function initUserConfig() {
    if (typeof options === 'function') {
      userConfig = options()
    } else {
      userConfig = getConfig(options, ROOT)
    }

    addHmr = (userConfig.codeSplittingOptions?.addHmr ?? true) && !isProduction
    hmrStyle = userConfig.plugin?.hmr?.style ?? 'vite'
    compilerPlugins = [
      ...(addHmr
        ? (getFrameworkHmrCompilerPlugins({
            targetFramework: userConfig.target,
            hmrStyle,
          }) ?? [])
        : []),
      ...(userConfig.codeSplittingOptions?.compilerPlugins ?? []),
    ]
    virtualRouteCompilerPlugins = compilerPlugins.filter(
      (plugin) => plugin.onVirtualRouteSplitNode,
    )
  }
  // Route files already reported for a route created inside a function
  const routesInFunctionReported = new Set<string>()

  const getGlobalCodeSplitGroupings = () => {
    return (
      userConfig.codeSplittingOptions?.defaultBehavior ||
      defaultCodeSplitGroupings
    )
  }
  const getShouldSplitFn = () => {
    return userConfig.codeSplittingOptions?.splitBehavior
  }
  // React Refresh hot-updates only a module whose exports are all components
  const splitSharedComponents = () => userConfig.target === 'react'

  /**
   * The groupings of a route file and the bindings its split modules share,
   * from the code being compiled: the route module, its split chunks and its
   * shared modules can be compiled in any order, for example after an edit in
   * dev, so none of them may rely on what another one computed.
   */
  const resolveCodeSplitting = (
    code: string,
    id: string,
    routeId: string,
    analysis: RouteModuleAnalysis,
  ) => {
    const fromCode = detectCodeSplitGroupingsFromRoute({
      code,
      filename: id,
      analysis,
    })

    if (fromCode.groupings !== undefined) {
      const res = splitGroupingsSchema.safeParse(fromCode.groupings)
      if (!res.success) {
        const message = res.error.issues.map((e) => e.message).join('. ')
        throw new Error(
          `The groupings for the route "${id}" are invalid.\n${message}`,
        )
      }
    }

    const userShouldSplitFn = getShouldSplitFn()

    const pluginSplitBehavior = userShouldSplitFn?.({
      routeId,
    }) as CodeSplitGroupings | undefined

    if (pluginSplitBehavior) {
      const res = splitGroupingsSchema.safeParse(pluginSplitBehavior)
      if (!res.success) {
        const message = res.error.issues.map((e) => e.message).join('. ')
        throw new Error(
          `The groupings returned when using \`splitBehavior\` for the route "${id}" are invalid.\n${message}`,
        )
      }
    }

    const splitGroupings: CodeSplitGroupings =
      fromCode.groupings ?? pluginSplitBehavior ?? getGlobalCodeSplitGroupings()

    const sharedBindings = computeSharedBindings({
      code,
      filename: id,
      analysis,
      codeSplitGroupings: splitGroupings,
    })
    return {
      splitGroupings,
      sharedBindings: sharedBindings.size > 0 ? sharedBindings : undefined,
    }
  }

  const handleCompilingReferenceFile = (
    code: string,
    id: string,
    generatorNodeInfo: GetRoutesByFileMapResultValue,
    analysis: RouteModuleAnalysis,
  ): UnpluginTransformResult => {
    if (debug) console.info('Compiling Route: ', id)

    const { splitGroupings, sharedBindings } = resolveCodeSplitting(
      code,
      id,
      generatorNodeInfo.routeId,
      analysis,
    )

    const compiledReferenceRoute = compileCodeSplitReferenceRoute({
      code,
      analysis,
      codeSplitGroupings: splitGroupings,
      targetFramework: userConfig.target,
      filename: id,
      id,
      deleteNodes: userConfig.codeSplittingOptions?.deleteNodes
        ? new Set(userConfig.codeSplittingOptions.deleteNodes)
        : undefined,
      addHmr,
      hmrStyle,
      hmrRouteId: generatorNodeInfo.routeId,
      sharedBindings,
      splitSharedComponents: splitSharedComponents(),
      compilerPlugins,
    })

    if (compiledReferenceRoute === null) {
      if (debug) {
        console.info(
          `No changes made to route "${id}", skipping code-splitting.`,
        )
      }
      return null
    }
    if (debug) {
      logDiff(code, compiledReferenceRoute.code)
      console.log('Output:\n', compiledReferenceRoute.code + '\n\n')
    }

    return compiledReferenceRoute
  }

  /** The bindings a split or shared module of a route file shares. */
  const resolveSharedBindings = (
    code: string,
    id: string,
    analysis: RouteModuleAnalysis,
  ) => {
    const baseId = id.split('?')[0]!
    const generatorFileInfo = routerPluginContext.routesByFile.get(baseId)
    return generatorFileInfo
      ? resolveCodeSplitting(code, baseId, generatorFileInfo.routeId, analysis)
          .sharedBindings
      : undefined
  }

  const handleCompilingVirtualFile = (
    code: string,
    id: string,
  ): UnpluginTransformResult => {
    if (debug) console.info('Splitting Route: ', id)

    const [_, ...pathnameParts] = id.split('?')

    const searchParams = new URLSearchParams(pathnameParts.join('?'))
    const splitValue = searchParams.get(tsrSplit)

    if (!splitValue) {
      throw new Error(
        `The split value for the virtual route "${id}" was not found.`,
      )
    }

    const rawGrouping = decodeIdentifier(splitValue)
    const grouping = [...new Set(rawGrouping)].filter((p) =>
      splitRouteIdentNodes.includes(p as any),
    ) as Array<SplitRouteIdentNodes>

    const analysis = analyzeRouteModule({ code, filename: id })
    const result = compileCodeSplitVirtualRoute({
      code,
      analysis,
      filename: id,
      splitTargets: grouping,
      sharedBindings: resolveSharedBindings(code, id, analysis),
      splitSharedComponents: splitSharedComponents(),
      compilerPlugins: virtualRouteCompilerPlugins,
    })

    if (debug) {
      logDiff(code, result.code)
      console.log('Output:\n', result.code + '\n\n')
    }

    return result
  }

  return [
    {
      name: 'tanstack-router:code-splitter:compile-reference-file',
      enforce: 'pre',

      transform: {
        filter: {
          id: {
            // this is necessary for webpack / rspack to avoid matching .html files
            include: /\.(m|c)?(j|t)sx?$/,
          },
          code: {
            include: routeFactoryCallCodeFilter,
          },
        },
        handler(code, id) {
          const normalizedId = normalizePath(id)
          const generatorFileInfo =
            routerPluginContext.routesByFile.get(normalizedId)
          if (generatorFileInfo) {
            const analysis = analyzeRouteModule({
              code,
              filename: normalizedId,
            })
            if (
              analysis.routeCreatedInFunction &&
              !routesInFunctionReported.has(normalizedId)
            ) {
              routesInFunctionReported.add(normalizedId)
              this.warn(createRouteInFunctionMessage(normalizedId))
            }
            return handleCompilingReferenceFile(
              code,
              normalizedId,
              generatorFileInfo,
              analysis,
            )
          }

          return null
        },
      },

      vite: {
        configResolved(config) {
          isProduction = config.command === 'build'
          ROOT = config.root
          initUserConfig()

          // Validate plugin order - router must come before JSX transformation plugins
          const routerPluginIndex = config.plugins.findIndex(
            (p) => p.name === CODE_SPLITTER_PLUGIN_NAME,
          )

          if (routerPluginIndex === -1) return

          const frameworkPlugins =
            TRANSFORMATION_PLUGINS_BY_FRAMEWORK[userConfig.target]
          if (!frameworkPlugins) return

          for (const transformPlugin of frameworkPlugins) {
            const transformPluginIndex = config.plugins.findIndex((p) =>
              transformPlugin.pluginNames.includes(p.name),
            )

            if (
              transformPluginIndex !== -1 &&
              transformPluginIndex < routerPluginIndex
            ) {
              throw new Error(
                `Plugin order error: '${transformPlugin.pkg}' is placed before '@tanstack/router-plugin'.\n\n` +
                  `The TanStack Router plugin must come BEFORE JSX transformation plugins.\n\n` +
                  `Please update your Vite config:\n\n` +
                  `  plugins: [\n` +
                  `    tanstackRouter(),\n` +
                  `    ${transformPlugin.usage},\n` +
                  `  ]\n`,
              )
            }
          }
        },
        applyToEnvironment(environment) {
          if (userConfig.plugin?.vite?.environmentName) {
            return userConfig.plugin.vite.environmentName === environment.name
          }
          return true
        },
      },

      rspack(compiler) {
        isProduction = compiler.options.mode === 'production'
        ROOT = process.cwd()
        initUserConfig()
      },

      webpack(compiler) {
        isProduction = compiler.options.mode === 'production'
        ROOT = process.cwd()
        initUserConfig()
      },
    },
    {
      name: 'tanstack-router:code-splitter:compile-virtual-file',
      enforce: 'pre',

      transform: {
        filter: {
          id: /tsr-split/,
        },
        handler(code, id) {
          const url = pathToFileURL(id)
          url.searchParams.delete('v')
          const normalizedId = normalizePath(fileURLToPath(url))
          return handleCompilingVirtualFile(code, normalizedId)
        },
      },

      vite: {
        applyToEnvironment(environment) {
          if (userConfig.plugin?.vite?.environmentName) {
            return userConfig.plugin.vite.environmentName === environment.name
          }
          return true
        },
      },
    },
    {
      name: 'tanstack-router:code-splitter:compile-shared-file',
      enforce: 'pre',

      transform: {
        filter: {
          id: /tsr-shared/,
        },
        handler(code, id) {
          const url = pathToFileURL(id)
          url.searchParams.delete('v')
          const normalizedId = normalizePath(fileURLToPath(url))
          const analysis = analyzeRouteModule({
            code,
            filename: normalizedId,
          })
          const sharedBindings = resolveSharedBindings(
            code,
            normalizedId,
            analysis,
          )
          if (!sharedBindings) return null

          if (debug) console.info('Compiling Shared Module: ', id)

          const { sideEffectFree, ...result } = compileCodeSplitSharedRoute({
            code,
            analysis,
            sharedBindings,
            filename: normalizedId,
            part:
              new URLSearchParams(normalizedId.split('?')[1]).get(tsrShared) ===
              'components'
                ? 'components'
                : 'values',
            splitSharedComponents: splitSharedComponents(),
          })

          if (debug) {
            logDiff(code, result.code)
            console.log('Output:\n', result.code + '\n\n')
          }

          if (!sideEffectFree) {
            // Explicit, never omitted: rolldown reuses the flag an earlier
            // build returned when a later one leaves it out, which kept an
            // edited, now impure module side-effect free in `vite build
            // --watch` (https://github.com/rolldown/rolldown/issues/11223).
            // `true` is the default analysis.
            return { ...result, moduleSideEffects: true }
          }
          // The bundler can then drop the route module's re-export of shared
          // bindings nothing imports through it, so that they load only with
          // the split chunks that use them
          const native = this.getNativeBuildContext?.()
          if (
            native?.framework === 'webpack' ||
            native?.framework === 'rspack'
          ) {
            const module = (
              native.loaderContext as
                | { _module?: { factoryMeta?: object } }
                | undefined
            )?._module
            if (module) {
              module.factoryMeta = {
                ...module.factoryMeta,
                sideEffectFree: true,
              }
            }
          }
          return { ...result, moduleSideEffects: false }
        },
      },

      vite: {
        applyToEnvironment(environment) {
          if (userConfig.plugin?.vite?.environmentName) {
            return userConfig.plugin.vite.environmentName === environment.name
          }
          return true
        },
      },
    },
  ]
}

export const unpluginRouterCodeSplitterFactory: UnpluginFactory<
  Partial<Config | (() => Config)> | undefined
> = (options = {}) => {
  return createRouterCodeSplitterPlugin(options, createRouterPluginContext())
}
