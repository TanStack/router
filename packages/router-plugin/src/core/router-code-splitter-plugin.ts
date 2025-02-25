/**
 * It is important to familiarize yourself with how the code-splitting works in this plugin.
 * https://github.com/TanStack/router/pull/3355
 */

import { isAbsolute, join, normalize } from 'node:path'
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
import type { CodeSplitGroupings, SplitRouteIdentNodes } from './constants'

import type { Config } from './config'
import type {
  UnpluginContextMeta,
  UnpluginFactory,
  TransformResult as UnpluginTransformResult,
} from 'unplugin'

const debug =
  process.env.TSR_VITE_DEBUG &&
  ['true', 'router-plugin'].includes(process.env.TSR_VITE_DEBUG)

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function fileIsInRoutesDirectory(
  filePath: string,
  routesDirectory: string,
): boolean {
  const routesDirectoryPath = isAbsolute(routesDirectory)
    ? routesDirectory
    : join(process.cwd(), routesDirectory)

  const path = normalize(filePath)

  return path.startsWith(routesDirectoryPath)
}

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
  constructor(externalPlugin: BannedBeforeExternalPlugin, framework: string) {
    super(`We detected that the '${externalPlugin.pkg}' was passed before '@tanstack/router-plugin'. Please make sure that '@tanstack/router-plugin' is passed before '${externalPlugin.pkg}' and try again: 
e.g.
plugins: [
  TanStackRouter${capitalizeFirst(framework)}(), // Place this before ${externalPlugin.usage}
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
  ): UnpluginTransformResult => {
    if (debug) console.info('Compiling Route: ', id)

    const fromCode = detectCodeSplitGroupingsFromRoute({
      code,
      root: ROOT,
      filename: id,
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
      routeId: fromCode.routeId,
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
      root: ROOT,
      filename: id,
      runtimeEnv: isProduction ? 'prod' : 'dev',
      codeSplitGroupings: splitGroupings,
      targetFramework: userConfig.target,
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
      root: ROOT,
      filename: id,
      splitTargets: grouping,
    })

    if (debug) {
      logDiff(code, result.code)
      console.log('Output:\n', result.code + '\n\n')
    }

    return result
  }

  return {
    name: 'router-code-splitter-plugin',
    enforce: 'pre',

    transform(code, id) {
      if (!userConfig.autoCodeSplitting) {
        return null
      }

      const url = pathToFileURL(id)
      url.searchParams.delete('v')
      id = fileURLToPath(url).replace(/\\/g, '/')

      if (id.includes(tsrSplit)) {
        return handleCompilingVirtualFile(code, id)
      } else if (
        fileIsInRoutesDirectory(id, userConfig.routesDirectory) &&
        (code.includes('createRoute(') || code.includes('createFileRoute('))
      ) {
        for (const externalPlugin of bannedBeforeExternalPlugins) {
          if (!externalPlugin.frameworks.includes(framework)) {
            continue
          }

          if (code.includes(externalPlugin.identifier)) {
            throw new FoundPluginInBeforeCode(externalPlugin, framework)
          }
        }

        return handleCompilingReferenceFile(code, id)
      }

      return null
    },

    transformInclude(id) {
      if (!userConfig.autoCodeSplitting) {
        return undefined
      }

      if (
        fileIsInRoutesDirectory(id, userConfig.routesDirectory) ||
        id.includes(tsrSplit)
      ) {
        return true
      }
      return false
    },

    vite: {
      configResolved(config) {
        ROOT = config.root

        userConfig = getConfig(options, ROOT)
      },
    },

    rspack(_compiler) {
      ROOT = process.cwd()
      userConfig = getConfig(options, ROOT)
    },

    webpack(compiler) {
      ROOT = process.cwd()
      userConfig = getConfig(options, ROOT)

      if (
        userConfig.autoCodeSplitting &&
        compiler.options.mode === 'production'
      ) {
        compiler.hooks.done.tap(PLUGIN_NAME, () => {
          console.info('✅ ' + PLUGIN_NAME + ': code-splitting done!')
          setTimeout(() => {
            process.exit(0)
          })
        })
      }
    },
  }
}
