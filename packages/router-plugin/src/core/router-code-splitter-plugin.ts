/**
 * It is important to familiarize yourself with how the code-splitting works in this plugin.
 * https://github.com/TanStack/router/pull/3355
 */

import { fileURLToPath, pathToFileURL } from 'node:url'
import { logDiff } from '@tanstack/router-utils'
import { getConfig, splitGroupingsSchema } from './config'
import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitVirtualRoute,
  detectCodeSplitGroupingsFromRoute,
} from './code-splitter/compilers'
import {
  defaultCodeSplitGroupings,
  splitRouteIdentNodes,
  tsrSplit,
} from './constants'
import { decodeIdentifier } from './code-splitter/path-ids'
import { debug } from './utils'
import type { CodeSplitGroupings, SplitRouteIdentNodes } from './constants'
import type { GetRoutesByFileMapResultValue } from '@tanstack/router-generator'
import type { Config } from './config'
import type {
  UnpluginContextMeta,
  UnpluginFactory,
  TransformResult as UnpluginTransformResult,
} from 'unplugin'

type BannedBeforeExternalPlugin = {
  identifier: string
  pkg: string
  usage: string
  frameworks: Array<UnpluginContextMeta['framework']>
}

const bannedBeforeExternalPlugins: Array<BannedBeforeExternalPlugin> = [
  {
    identifier: '@react-refresh',
    pkg: '@vitejs/plugin-react',
    usage: 'viteReact()',
    frameworks: ['vite'],
  },
]

class FoundPluginInBeforeCode extends Error {
  constructor(
    externalPlugin: BannedBeforeExternalPlugin,
    pluginFramework: string,
  ) {
    super(`We detected that the '${externalPlugin.pkg}' was passed before '@tanstack/router-plugin/${pluginFramework}'. Please make sure that '@tanstack/router-plugin' is passed before '${externalPlugin.pkg}' and try again: 
e.g.
plugins: [
  tanstackRouter(), // Place this before ${externalPlugin.usage}
  ${externalPlugin.usage},
]
`)
  }
}

const PLUGIN_NAME = 'unplugin:router-code-splitter'

export const unpluginRouterCodeSplitterFactory: UnpluginFactory<
  Partial<Config> | undefined
> = (options = {}, { framework }) => {
  let ROOT: string = process.cwd()
  let userConfig = options as Config

  const isProduction = process.env.NODE_ENV === 'production'

  const getGlobalCodeSplitGroupings = () => {
    return (
      userConfig.codeSplittingOptions?.defaultBehavior ||
      defaultCodeSplitGroupings
    )
  }
  const getShouldSplitFn = () => {
    return userConfig.codeSplittingOptions?.splitBehavior
  }

  const handleCompilingReferenceFile = (
    code: string,
    id: string,
    generatorNodeInfo: GetRoutesByFileMapResultValue,
  ): UnpluginTransformResult => {
    if (debug) console.info('Compiling Route: ', id)

    const fromCode = detectCodeSplitGroupingsFromRoute({
      code,
    })

    if (fromCode.groupings) {
      const res = splitGroupingsSchema.safeParse(fromCode.groupings)
      if (!res.success) {
        const message = res.error.errors.map((e) => e.message).join('. ')
        throw new Error(
          `The groupings for the route "${id}" are invalid.\n${message}`,
        )
      }
    }

    const userShouldSplitFn = getShouldSplitFn()

    const pluginSplitBehavior = userShouldSplitFn?.({
      routeId: generatorNodeInfo.routePath,
    }) as CodeSplitGroupings | undefined

    if (pluginSplitBehavior) {
      const res = splitGroupingsSchema.safeParse(pluginSplitBehavior)
      if (!res.success) {
        const message = res.error.errors.map((e) => e.message).join('. ')
        throw new Error(
          `The groupings returned when using \`splitBehavior\` for the route "${id}" are invalid.\n${message}`,
        )
      }
    }

    const splitGroupings: CodeSplitGroupings =
      fromCode.groupings || pluginSplitBehavior || getGlobalCodeSplitGroupings()

    const compiledReferenceRoute = compileCodeSplitReferenceRoute({
      code,
      codeSplitGroupings: splitGroupings,
      targetFramework: userConfig.target,
      filename: id,
      id,
      deleteNodes: new Set(userConfig.codeSplittingOptions?.deleteNodes),
      addHmr: (options.codeSplittingOptions?.addHmr ?? true) && !isProduction,
    })

    if (debug) {
      logDiff(code, compiledReferenceRoute.code)
      console.log('Output:\n', compiledReferenceRoute.code + '\n\n')
    }

    return compiledReferenceRoute
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

    const result = compileCodeSplitVirtualRoute({
      code,
      filename: id,
      splitTargets: grouping,
    })

    if (debug) {
      logDiff(code, result.code)
      console.log('Output:\n', result.code + '\n\n')
    }

    return result
  }

  const includedCode = [
    'createFileRoute(',
    'createRootRoute(',
    'createRootRouteWithContext(',
  ]
  return [
    {
      name: 'tanstack-router:code-splitter:compile-reference-file',
      enforce: 'pre',

      transform: {
        filter: {
          id: {
            exclude: tsrSplit,
            // this is necessary for webpack / rspack to avoid matching .html files
            include: /\.(m|c)?(j|t)sx?$/,
          },
          code: {
            include: includedCode,
          },
        },
        handler(code, id) {
          const generatorFileInfo = globalThis.TSR_ROUTES_BY_ID_MAP?.get(id)
          if (
            generatorFileInfo &&
            includedCode.some((included) => code.includes(included))
          ) {
            for (const externalPlugin of bannedBeforeExternalPlugins) {
              if (!externalPlugin.frameworks.includes(framework)) {
                continue
              }

              if (code.includes(externalPlugin.identifier)) {
                throw new FoundPluginInBeforeCode(externalPlugin, framework)
              }
            }

            return handleCompilingReferenceFile(code, id, generatorFileInfo)
          }

          return null
        },
      },

      vite: {
        configResolved(config) {
          ROOT = config.root
          userConfig = getConfig(options, ROOT)
        },
        applyToEnvironment(environment) {
          if (userConfig.plugin?.vite?.environmentName) {
            return userConfig.plugin.vite.environmentName === environment.name
          }
          return true
        },
      },

      rspack() {
        ROOT = process.cwd()
        userConfig = getConfig(options, ROOT)
      },

      webpack(compiler) {
        ROOT = process.cwd()
        userConfig = getConfig(options, ROOT)

        if (compiler.options.mode === 'production') {
          compiler.hooks.done.tap(PLUGIN_NAME, () => {
            console.info('✅ ' + PLUGIN_NAME + ': code-splitting done!')
            setTimeout(() => {
              process.exit(0)
            })
          })
        }
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
          id = fileURLToPath(url).replace(/\\/g, '/')
          return handleCompilingVirtualFile(code, id)
        },
      },
    },
  ]
}
