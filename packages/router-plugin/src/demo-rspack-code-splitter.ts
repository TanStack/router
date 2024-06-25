import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { compileAst } from './ast'
import { compileFile, splitFile } from './compilers'
import { getConfig } from './config'
import { splitPrefix } from './constants'

import type { Config } from './config'
import type {
  UnpluginContextMeta,
  UnpluginFactory,
  RspackPluginInstance,
} from 'unplugin'

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

const PLUGIN_NAME = 'unplugin:router-rspack-code-splitter'

export const unpluginRsPackRouterCodeSplitterFactory: UnpluginFactory<
  Partial<Config> | undefined
> = (options = {}, { framework }) => {
  const debug = Boolean(process.env.TSR_VITE_DEBUG)

  let ROOT: string = process.cwd()
  let userConfig = options as Config

  const handleSplittingFile = async (code: string, id: string) => {
    const compiledAst = compileAst({
      root: ROOT,
    })

    if (debug) console.info('Splitting route: ', id)

    const compiled = await splitFile({
      code,
      compileAst: compiledAst,
      filename: id,
    })

    if (debug) console.info('Split Output', id)

    return compiled
  }

  const handleCompilingFile = async (code: string, id: string) => {
    const compiledAst = compileAst({
      root: ROOT,
    })

    if (debug) console.info('Handling createRoute: ', id)

    const compiled = await compileFile({
      code,
      compileAst: compiledAst,
      filename: id,
    })

    if (debug) console.info('Compiled Output', id)

    return compiled
  }

  return {
    name: 'router-rspack-code-splitter-plugin',
    enforce: 'pre',

    async rspack(compiler) {
      ROOT = process.cwd()
      userConfig = await getConfig(options, ROOT)

      // I think somewhere here, I'm mean to strip out the `tsr-split:` prefix from the id
      // compiler.options.module.rules.push({
      //   scheme: splitPrefix,
      //   type: 'javascript',
      //   test: (id) => id.startsWith(splitPrefix + ':'),
      //   parser: {
      //     javascript: ['javascript'],
      //   },
      // })

      // https://www.rspack.dev/api/plugin-api/normal-module-factory-hooks
      // 🎉 this does its job
      compiler.hooks.beforeCompile.tap(PLUGIN_NAME, (self) => {
        self.normalModuleFactory.hooks.beforeResolve.tap(
          PLUGIN_NAME,
          (resolveData) => {
            if (resolveData.request.startsWith(splitPrefix + ':')) {
              resolveData.request = resolveData.request.replace(
                splitPrefix + ':',
                '',
              )
            }
          },
        )
      })

      // ---
    },

    async transform(code, id) {
      const url = pathToFileURL(id)
      url.searchParams.delete('v')
      id = fileURLToPath(url).replace(/\\/g, '/')

      if (id.includes(splitPrefix)) {
        const splitFileCode = await handleSplittingFile(code, id)
        return splitFileCode
      } else if (
        fileIsInRoutesDirectory(id, userConfig.routesDirectory) &&
        (code.includes('createRoute(') || code.includes('createFileRoute('))
      ) {
        const compiledFileCode = await handleCompilingFile(code, id)
        return compiledFileCode
      }

      return null
    },

    resolveId(id) {
      if (!userConfig.experimental?.enableCodeSplitting) {
        return null
      }

      if (id.startsWith(splitPrefix + ':')) {
        return id.replace(splitPrefix + ':', '')
      }
      return null
    },
  }
}
