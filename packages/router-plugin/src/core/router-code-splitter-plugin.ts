import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { existsSync, readFileSync } from 'node:fs'
import { getConfig } from './config'
import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitVirtualRoute,
} from './code-splitter/compilers'
import { splitToken } from './constants'
import type { ModuleNode } from 'vite'

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
// a regex for either ?splitToken or &splitToken
const splitTokenRegex = new RegExp(`[?&]${splitToken}`)

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
    transform(code, id) {
      if (!userConfig.autoCodeSplitting) {
        return null
      }

      const url = pathToFileURL(id)
      url.searchParams.delete('v')
      id = fileURLToPath(url).replace(/\\/g, '/')

      if (id.includes(splitToken)) {
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

    transformInclude(transformId) {
      if (!userConfig.autoCodeSplitting) {
        return undefined
      }

      if (
        fileIsInRoutesDirectory(transformId, userConfig.routesDirectory) ||
        transformId.includes(splitToken)
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
      // handleHotUpdate({ file, server, modules }) {
      //   return []
      // },
    },

    rspack(compiler) {
      ROOT = process.cwd()
    },

    webpack(compiler) {
      ROOT = process.cwd()

      compiler.hooks.beforeCompile.tap(PLUGIN_NAME, (self) => {
        self.normalModuleFactory.hooks.beforeResolve.tap(
          PLUGIN_NAME,
          (resolveData: { request: string }) => {
            if (resolveData.request.match(splitTokenRegex)) {
              resolveData.request = resolveData.request.replace(
                splitTokenRegex,
                '',
              )
            }
          },
        )
      })

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
