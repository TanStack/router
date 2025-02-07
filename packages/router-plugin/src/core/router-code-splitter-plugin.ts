import { isAbsolute, join, normalize } from 'node:path'

import { fileURLToPath, pathToFileURL } from 'node:url'
import { logDiff } from '@tanstack/router-utils'
import { getConfig } from './config'
import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitVirtualRoute,
} from './code-splitter/compilers'
import { splitPrefixes } from './constants'

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

const splitPrefixesArray = Object.values(splitPrefixes)

export const unpluginRouterCodeSplitterFactory: UnpluginFactory<
  Partial<Config> | undefined
> = (options = {}, { framework }) => {
  let ROOT: string = process.cwd()
  let userConfig = options as Config

  const isProduction = process.env.NODE_ENV === 'production'

  const handleCompilingFile = (
    code: string,
    id: string,
  ): UnpluginTransformResult => {
    if (debug) console.info('Compiling Route: ', id)

    const compiledReferenceRoute = compileCodeSplitReferenceRoute({
      code,
      root: ROOT,
      filename: id,
      isProduction,
    })

    if (debug) {
      logDiff(code, compiledReferenceRoute.code)
      console.log('Output:\n', compiledReferenceRoute.code + '\n\n')
    }

    return compiledReferenceRoute
  }

  const handleSplittingFile = (
    code: string,
    id: string,
  ): UnpluginTransformResult => {
    if (debug) console.info('Splitting Route: ', id)

    let result: UnpluginTransformResult = { code: 'empty' }

    if (id.includes(splitPrefixes.ROUTE_COMPONENT)) {
      result = compileCodeSplitVirtualRoute({
        code,
        root: ROOT,
        filename: id,
        splitTargets: ['component'],
      })
    } else if (id.includes(splitPrefixes.ROUTE_LOADER)) {
      result = compileCodeSplitVirtualRoute({
        code,
        root: ROOT,
        filename: id,
        splitTargets: ['loader'],
      })
    }

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

      if (splitPrefixesArray.some((prefix) => id.includes(prefix))) {
        return handleSplittingFile(code, id)
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

        return handleCompilingFile(code, id)
      }

      return null
    },

    transformInclude(id) {
      if (!userConfig.autoCodeSplitting) {
        return undefined
      }

      if (
        fileIsInRoutesDirectory(id, userConfig.routesDirectory) ||
        splitPrefixesArray.some((prefix) => id.includes(prefix))
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
