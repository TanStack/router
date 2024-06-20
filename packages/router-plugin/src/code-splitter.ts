import { isAbsolute, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { compileAst } from './ast'
import { compileFile, splitFile } from './compilers'
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

export const unpluginRouterCodeSplitterFactory: UnpluginFactory<
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
    enforce: 'pre',
    resolveId(source) {
      if (framework !== 'vite') return source
      if (!userConfig.experimental?.enableCodeSplitting) {
        return null
      }

      if (source.startsWith(splitPrefix + ':')) {
        return source.replace(splitPrefix + ':', '')
      }
      return null
    },
    async transform(code, id) {
      if (framework !== 'vite') return code
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
    vite: {
      async configResolved(config) {
        ROOT = config.root
        userConfig = await getConfig(options, ROOT)
      },
    },
    async rspack() {
      userConfig = await getConfig(options, ROOT)
    },
  }
}
