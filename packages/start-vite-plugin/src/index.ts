import { fileURLToPath, pathToFileURL } from 'url'
import { z } from 'zod'
import { compileFile, makeCompile } from './compilers'
import type { Plugin } from 'vite'

export const configSchema = z.object({})

export type Config = z.infer<typeof configSchema>

const debug = Boolean(process.env.TSR_VITE_DEBUG)

export function TanStackStartVite(
  inlineConfig: Partial<Config> = {},
): Array<Plugin> {
  return [TanStackStartViteServerDirective(inlineConfig)]
}

export function TanStackStartViteServerDirective(
  inlineConfig: Partial<Config> = {},
): Plugin {
  let ROOT: string = process.cwd()

  return {
    name: 'vite-plugin-tanstack-start-server-directive',
    enforce: 'pre',
    configResolved: async (config) => {
      ROOT = config.root
    },
    async transform(code, id) {
      const url = pathToFileURL(id)
      url.searchParams.delete('v')
      id = fileURLToPath(url).replace(/\\/g, '/')

      const compile = makeCompile({
        root: ROOT,
      })

      if (code.includes('createServerFn')) {
        if (code.includes('@react-refresh')) {
          throw new Error(
            `We detected that the '@vitejs/plugin-react' was passed before '@tanstack/start-vite-plugin'. Please make sure that '@tanstack/start-vite-plugin' is passed before '@vitejs/plugin-react' and try again: 
e.g.

plugins: [
  TanStackStartVite(), // Place this before viteReact()
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
