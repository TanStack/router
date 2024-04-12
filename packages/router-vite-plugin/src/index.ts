import { isAbsolute, join, normalize, resolve } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { z } from 'zod'
import {
  generator,
  configSchema as generatorConfigSchema,
  getConfig as getGeneratorConfig,
} from '@tanstack/router-generator'
import { compileFile, makeCompile, splitFile } from './compilers'
import { splitPrefix } from './constants'
import type { Plugin } from 'vite'

export const configSchema = generatorConfigSchema.extend({
  enableRouteGeneration: z.boolean().optional(),
  experimental: z
    .object({
      enableCodeSplitting: z.boolean().optional(),
    })
    .optional(),
})

export type Config = z.infer<typeof configSchema>

const CONFIG_FILE_NAME = 'tsr.config.json'
const debug = false as any

const getConfig = async (inlineConfig: Partial<Config>, root: string) => {
  const config = await getGeneratorConfig(inlineConfig, root)

  return configSchema.parse({ ...inlineConfig, ...config })
}

export function TanStackRouterVite(
  inlineConfig: Partial<Config> = {},
): Array<Plugin> {
  return [
    TanStackRouterViteGenerator(inlineConfig),
    TanStackRouterViteCodeSplitter(inlineConfig),
  ]
}

let lock = false

export function TanStackRouterViteGenerator(
  inlineConfig: Partial<Config> = {},
): Plugin {
  let ROOT: string = process.cwd()
  let userConfig: Config

  const generate = async () => {
    if (lock) {
      return
    }
    lock = true
    try {
      await generator(userConfig)
    } catch (err) {
      console.error(err)
      console.info()
    }
    lock = false
  }

  const handleFile = async (
    file: string,
    event: 'create' | 'update' | 'delete',
  ) => {
    const filePath = normalize(file)
    if (filePath === join(ROOT, CONFIG_FILE_NAME)) {
      userConfig = await getConfig(inlineConfig, ROOT)
      return
    }
    if (
      event === 'update' &&
      filePath === resolve(userConfig.generatedRouteTree)
    ) {
      // skip generating routes if the generated route tree is updated
      return
    }
    const routesDirectoryPath = isAbsolute(userConfig.routesDirectory)
      ? userConfig.routesDirectory
      : join(ROOT, userConfig.routesDirectory)
    if (filePath.startsWith(routesDirectoryPath)) {
      await generate()
    }
  }

  return {
    name: 'vite-plugin-tanstack-router-generator',
    configResolved: async (config) => {
      ROOT = config.root
      userConfig = await getConfig(inlineConfig, ROOT)

      if (userConfig.enableRouteGeneration ?? true) {
        await generate()
      }
    },
    watchChange: async (file, context) => {
      if (userConfig.enableRouteGeneration ?? true) {
        if (['create', 'update', 'delete'].includes(context.event)) {
          await handleFile(file, context.event)
        }
      }
    },
  }
}

function fileIsInRoutesDirectory(filePath: string, routesDirectory: string) {
  const routesDirectoryPath = isAbsolute(routesDirectory)
    ? routesDirectory
    : join(process.cwd(), routesDirectory)

  return filePath.startsWith(routesDirectoryPath)
}

export function TanStackRouterViteCodeSplitter(
  inlineConfig: Partial<Config> = {},
): Plugin {
  let ROOT: string = process.cwd()
  let userConfig: Config

  return {
    name: 'vite-plugin-tanstack-router-code-splitter',
    enforce: 'pre',
    configResolved: async (config) => {
      ROOT = config.root
      userConfig = await getConfig(inlineConfig, ROOT)
    },
    resolveId(source) {
      if (!userConfig.experimental?.enableCodeSplitting) {
        return null
      }

      if (source.startsWith(splitPrefix + ':')) {
        return source.replace(splitPrefix + ':', '')
      }
      return null
    },
    async transform(code, id, transformOptions) {
      if (!userConfig.experimental?.enableCodeSplitting) {
        return null
      }

      const url = pathToFileURL(id)
      url.searchParams.delete('v')
      id = fileURLToPath(url).replace(/\\/g, '/')

      const compile = makeCompile({
        root: ROOT,
      })

      if (id.includes(splitPrefix)) {
        if (debug) console.info('Splitting route: ', id)
        // const ref = new URLSearchParams(id.split('?')[1]).get('ref') || ''

        const compiled = await splitFile({
          code,
          compile,
          filename: id,
          // ref,
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
      } else if (
        fileIsInRoutesDirectory(id, userConfig.routesDirectory) &&
        (code.includes('createRoute(') || code.includes('createFileRoute('))
      ) {
        if (code.includes('@react-refresh')) {
          throw new Error(
            `We detected that the '@vitejs/plugin-react' was passed before '@tanstack/router-vite-plugin'. Please make sure that '@tanstack/router-vite-plugin' is passed before '@vitejs/plugin-react' and try again: 
e.g.

plugins: [
  TanStackRouterVite(), // Place this before viteReact()
  viteReact(),
]
`,
          )
        }

        if (debug) console.info('Handling createRoute: ', id)
        const compiled = await compileFile({
          code,
          compile,
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

      return null
    },
  }
}
