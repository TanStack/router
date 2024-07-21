import { isAbsolute, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitVirtualRoute,
} from './compilers'
import { getConfig } from './config'
import { splitPrefix } from './constants'

import type { Config } from './config'
import type { UnpluginContextMeta, UnpluginFactory } from 'unplugin'

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function fileIsInRoutesDirectory(filePath: string, routesDirectory: string) {
  const routesDirectoryPath = isAbsolute(routesDirectory)
    ? routesDirectory
    : join(process.cwd(), routesDirectory)

  return filePath.startsWith(routesDirectoryPath)
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
const JoinedSplitPrefix = splitPrefix + ':'

export const unpluginRouterCodeSplitterFactory: UnpluginFactory<
  Partial<Config> | undefined
> = (options = {}, { framework }) => {
  const debug = Boolean(process.env.TSR_VITE_DEBUG)

  let ROOT: string = process.cwd()
  let userConfig = options as Config

  const handleSplittingFile = (code: string, id: string) => {
    if (debug) console.info('Splitting route: ', id)

    const compiledVirtualRoute = compileCodeSplitVirtualRoute({
      code,
      root: ROOT,
      filename: id,
    })

    if (debug) console.info('')
    if (debug) console.info('Split Output')
    if (debug) console.info('')
    if (debug) console.info(compiledVirtualRoute.code)
    if (debug) console.info('')
    if (debug) console.info('')
    if (debug) console.info('')

    return compiledVirtualRoute
  }

  const handleCompilingFile = (code: string, id: string) => {
    if (debug) console.info('Handling createRoute: ', id)

    const compiledReferenceRoute = compileCodeSplitReferenceRoute({
      code,
      root: ROOT,
      filename: id,
    })

    if (debug) console.info('')
    if (debug) console.info('Compiled Output')
    if (debug) console.info('')
    if (debug) console.info(compiledReferenceRoute.code)
    if (debug) console.info('')
    if (debug) console.info('')
    if (debug) console.info('')

    return compiledReferenceRoute
  }

  return {
    name: 'router-code-splitter-plugin',
    enforce: 'pre',

    resolveId(source) {
      if (!userConfig.experimental?.enableCodeSplitting) {
        return null
      }

      if (source.startsWith(splitPrefix + ':')) {
        return source.replace(splitPrefix + ':', '')
      }
      return null
    },

    async transform(code, id) {
      if (!userConfig.experimental?.enableCodeSplitting) {
        return null
      }

      const url = pathToFileURL(id)
      url.searchParams.delete('v')
      id = fileURLToPath(url).replace(/\\/g, '/')

      if (id.includes(splitPrefix)) {
        return await handleSplittingFile(code, id)
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

        return await handleCompilingFile(code, id)
      }

      return null
    },

    transformInclude(transformId) {
      if (!userConfig.experimental?.enableCodeSplitting) {
        return undefined
      }

      let id = transformId

      if (id.startsWith(JoinedSplitPrefix)) {
        id = id.replace(JoinedSplitPrefix, '')
      }

      if (
        fileIsInRoutesDirectory(id, userConfig.routesDirectory) ||
        id.includes(splitPrefix)
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

    rspack(compiler) {
      ROOT = process.cwd()

      compiler.hooks.beforeCompile.tap(PLUGIN_NAME, (self) => {
        self.normalModuleFactory.hooks.beforeResolve.tap(
          PLUGIN_NAME,
          (resolveData) => {
            if (resolveData.request.includes(JoinedSplitPrefix)) {
              resolveData.request = resolveData.request.replace(
                JoinedSplitPrefix,
                '',
              )
            }
          },
        )
      })

      userConfig = getConfig(options, ROOT)
    },

    webpack(compiler) {
      ROOT = process.cwd()

      compiler.hooks.beforeCompile.tap(PLUGIN_NAME, (self) => {
        self.normalModuleFactory.hooks.beforeResolve.tap(
          PLUGIN_NAME,
          (resolveData) => {
            if (resolveData.request.includes(JoinedSplitPrefix)) {
              resolveData.request = resolveData.request.replace(
                JoinedSplitPrefix,
                '',
              )
            }
          },
        )
      })

      userConfig = getConfig(options, ROOT)

      if (
        userConfig.experimental?.enableCodeSplitting &&
        compiler.options.mode === 'production'
      ) {
        compiler.hooks.done.tap(PLUGIN_NAME, (stats) => {
          console.info('✅ ' + PLUGIN_NAME + ': code-splitting done!')
          setTimeout(() => {
            process.exit(0)
          })
        })
      }
    },
  }
}
