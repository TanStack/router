import { isAbsolute, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createUnplugin } from 'unplugin'

import { compileAst } from './ast'
import { compileFile, splitFile } from './compilers'
import { getConfig } from './config'
import { splitPrefix } from './constants'

import type { PluginOptions } from './config'
import type { UnpluginFactory } from 'unplugin'

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function fileIsInRoutesDirectory(filePath: string, routesDirectory: string) {
  const routesDirectoryPath = isAbsolute(routesDirectory)
    ? routesDirectory
    : join(process.cwd(), routesDirectory)

  return filePath.startsWith(routesDirectoryPath)
}

const bannedBeforeExternalPlugins = [
  {
    identifier: '@react-refresh',
    package: '@vitejs/plugin-react',
    usage: 'viteReact()',
  },
]

export const unpluginFactory: UnpluginFactory<Partial<PluginOptions>> = (
  options = {},
  { framework },
) => {
  const debug = Boolean(process.env.TSR_VITE_DEBUG)

  let ROOT: string = process.cwd()
  let userConfig = options as PluginOptions

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

    if (debug) console.info('')
    if (debug) console.info('Split Output')
    if (debug) console.info('')
    if (debug) console.info(compiled.code)
    if (debug) console.info('')
    if (debug) console.info('')
    if (debug) console.info('')
    if (debug) console.info('')
    if (debug) console.info('')
    if (debug) console.info('')
    if (debug) console.info('')
    if (debug) console.info('')

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

    if (debug) console.info('')
    if (debug) console.info('Compiled Output')
    if (debug) console.info('')
    if (debug) console.info(compiled.code)
    if (debug) console.info('')
    if (debug) console.info('')
    if (debug) console.info('')
    if (debug) console.info('')
    if (debug) console.info('')
    if (debug) console.info('')
    if (debug) console.info('')
    if (debug) console.info('')
    if (debug) console.info('')
    if (debug) console.info('')

    return compiled
  }

  return {
    name: 'router-code-splitter-plugin',
    resolveId(source) {
      if (!userConfig?.experimental?.enableCodeSplitting) {
        return null
      }

      if (source.startsWith(splitPrefix + ':')) {
        return source.replace(splitPrefix + ':', '')
      }
      return null
    },
    async transform(code, id) {
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
          if (code.includes(externalPlugin.identifier)) {
            throw new Error(
              `We detected that the '${externalPlugin.package}' was passed before '@tanstack/router-plugin'. Please make sure that '@tanstack/router-plugin' is passed before '${externalPlugin.package}' and try again: 
e.g.
plugins: [
  TanStackRouter${capitalizeFirst(framework)}(), // Place this before ${externalPlugin.usage}
  ${externalPlugin.usage},
]
`,
            )
          }

          return await handleCompilingFile(code, id)
        }
      }

      return null
    },
    vite: {
      async configResolved(config) {
        ROOT = config.root
        userConfig = await getConfig(options, ROOT)
      },
    },
  }
}

export const unpluginRouterCodeSplitter =
  /* #__PURE__ */ createUnplugin(unpluginFactory)
