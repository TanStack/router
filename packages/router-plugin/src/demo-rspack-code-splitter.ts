import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'

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

// function capitalizeFirst(str: string): string {
//   return str.charAt(0).toUpperCase() + str.slice(1)
// }

function fileIsInRoutesDirectory(filePath: string, routesDirectory: string) {
  const routesDirectoryPath = isAbsolute(routesDirectory)
    ? routesDirectory
    : join(process.cwd(), routesDirectory)

  return filePath.startsWith(routesDirectoryPath)
}

// type BannedBeforeExternalPlugin = {
//   identifier: string
//   pkg: string
//   usage: string
//   frameworks: Array<UnpluginContextMeta['framework']>
// }

// const bannedBeforeExternalPlugins: Array<BannedBeforeExternalPlugin> = [
//   {
//     identifier: '@react-refresh',
//     pkg: '@vitejs/plugin-react',
//     usage: 'viteReact()',
//     frameworks: ['vite'],
//   },
// ]

// class FoundPluginInBeforeCode extends Error {
//   constructor(externalPlugin: BannedBeforeExternalPlugin, framework: string) {
//     super(`We detected that the '${externalPlugin.pkg}' was passed before '@tanstack/router-plugin'. Please make sure that '@tanstack/router-plugin' is passed before '${externalPlugin.pkg}' and try again:
// e.g.
// plugins: [
//   TanStackRouter${capitalizeFirst(framework)}(), // Place this before ${externalPlugin.usage}
//   ${externalPlugin.usage},
// ]
// `)
//   }
// }

const PLUGIN_NAME = 'router-rspack-code-splitter'
const JoinedSplitPrefix = splitPrefix + ':'

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
    name: PLUGIN_NAME,
    enforce: 'pre',

    async rspack(compiler) {
      ROOT = process.cwd()
      userConfig = await getConfig(options, ROOT)

      // This hooks currently, successfully removes the [tsr-split:] prefix from incoming requests
      // https://www.rspack.dev/api/plugin-api/normal-module-factory-hooks
      // 🎉 this does its job
      compiler.hooks.beforeCompile.tap(PLUGIN_NAME, (self) => {
        self.normalModuleFactory.hooks.beforeResolve.tap(
          PLUGIN_NAME,
          (resolveData) => {
            if (resolveData.request.startsWith(JoinedSplitPrefix)) {
              const request = resolveData.request
              resolveData.request = request.replace(JoinedSplitPrefix, '')
            }
          },
        )
      })
      // TODO: explore replacing the above hook with https://webpack.js.org/plugins/normal-module-replacement-plugin/
    },

    /**
     * This `loadInclude` method only gets called on the `load` method and not on `transform`.
     * https://github.com/unjs/unplugin/blob/a01da85ed2f9924e8361df14a21e887e14bf0e67/src/rspack/index.ts#L65-L78
     *   -> https://github.com/unjs/unplugin/blob/a01da85ed2f9924e8361df14a21e887e14bf0e67/src/utils.ts#L38
     */
    loadInclude(id) {
      return fileIsInRoutesDirectory(id, userConfig.routesDirectory)
    },

    /**
     * TODO: The issue seems to be in the transform method from unplugin.
     * Even with the transform method doing absolute nothing, plugin still errors or with [html-rspack-plugin]
     * https://github.com/unjs/unplugin/blob/a01da85ed2f9924e8361df14a21e887e14bf0e67/src/rspack/index.ts#L81-L88
     *   -> https://github.com/unjs/unplugin/blob/a01da85ed2f9924e8361df14a21e887e14bf0e67/src/utils.ts#L50-L65
     */
    // async transform(code, id) {
    //   console.log('transform.id', id)
    //   return code
    // },

    /**
     * This is the TanStack Router specific transform implementation that so far correctly outputs.
     * */
    // async transform(code, id) {
    //   // return code
    //   const url = pathToFileURL(id)
    //   url.searchParams.delete('v')
    //   id = fileURLToPath(url).replace(/\\/g, '/')

    //   if (id.includes(splitPrefix)) {
    //     const splitFileCode = await handleSplittingFile(code, id)
    //     console.log(id, '\n', splitFileCode.code)
    //     return splitFileCode
    //   } else if (
    //     fileIsInRoutesDirectory(id, userConfig.routesDirectory) &&
    //     (code.includes('createRoute(') || code.includes('createFileRoute('))
    //   ) {
    //     const compiledFileCode = await handleCompilingFile(code, id)
    //     console.log(id, '\n', compiledFileCode.code)
    //     return compiledFileCode
    //   }

    //   return null
    // },
  }
}
