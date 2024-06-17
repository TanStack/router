import { fileURLToPath, pathToFileURL } from 'node:url'
import { z } from 'zod'
import {
  configSchema as generatorConfigSchema,
  getConfig as getGeneratorConfig,
} from '@tanstack/router-generator'
import { compileAst } from './ast'
import { createServerFnCompiler } from './compilers'
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

const debug = Boolean(process.env.TSR_VITE_DEBUG)

const getConfig = async (inlineConfig: Partial<Config>, root: string) => {
  const config = await getGeneratorConfig(inlineConfig, root)

  return configSchema.parse({ ...config, ...inlineConfig })
}

export function TanStackStartVite(
  inlineConfig: Partial<Config> = {},
): Array<Plugin> {
  return [TanStackStartViteCreateServerFn(inlineConfig)]
}

export function TanStackStartViteCreateServerFn(
  inlineConfig: Partial<Config> = {},
): Plugin {
  let ROOT: string = process.cwd()
  let userConfig: Config

  return {
    name: 'vite-plugin-tanstack-start-create-server-fn',
    enforce: 'pre',
    configResolved: async (config) => {
      ROOT = config.root
      userConfig = await getConfig(inlineConfig, ROOT)
    },
    async transform(code, id) {
      if (!userConfig.experimental?.enableCodeSplitting) {
        return null
      }

      const url = pathToFileURL(id)
      url.searchParams.delete('v')
      id = fileURLToPath(url).replace(/\\/g, '/')

      const compile = compileAst({
        root: ROOT,
      })

      if (code.includes('createServerFn')) {
        if (code.includes('@react-refresh')) {
          throw new Error(
            `We detected that the '@vitejs/plugin-react' was passed before '@tanstack/start-vite-plugin'. Please make sure that '@tanstack/router-vite-plugin' is passed before '@vitejs/plugin-react' and try again: 
e.g.

plugins: [
  TanStackStartVite(), // Place this before viteReact()
  viteReact(),
]
`,
          )
        }

        if (debug) console.info('Handling createServerFn for id: ', id)
        const compiled = await createServerFnCompiler({
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
