import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  compileCreateServerFnOutput,
  compileEliminateDeadCode,
} from './compilers'
import type { Plugin } from 'vite'

const debug = Boolean(process.env.TSR_VITE_DEBUG)

export function TanStackStartVite(): Array<Plugin> {
  return [TanStackStartViteCreateServerFn()]
}

export function TanStackStartViteCreateServerFn(): Plugin {
  let ROOT: string = process.cwd()

  return {
    name: 'vite-plugin-tanstack-start-create-server-fn',
    enforce: 'pre',
    configResolved: (config) => {
      ROOT = config.root
    },
    transform(code, id) {
      const url = pathToFileURL(id)
      url.searchParams.delete('v')
      id = fileURLToPath(url).replace(/\\/g, '/')

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

        const compiled = compileCreateServerFnOutput({
          code,
          root: ROOT,
          filename: id,
        })

        if (debug) console.info('')
        if (debug) console.info('Compiled createServerFn Output')
        if (debug) console.info('')
        if (debug) console.info(compiled.code)
        if (debug) console.info('')
        if (debug) console.info('')
        if (debug) console.info('')

        return compiled
      }

      return null
    },
  }
}

export function TanStackStartViteDeadCodeElimination(): Plugin {
  let ROOT: string = process.cwd()

  return {
    name: 'vite-plugin-tanstack-start-dead-code-elimination',
    enforce: 'post',
    configResolved: (config) => {
      ROOT = config.root
    },
    transform(code, id) {
      const url = pathToFileURL(id)
      url.searchParams.delete('v')
      id = fileURLToPath(url).replace(/\\/g, '/')

      if (code.includes('createServerFn')) {
        const compiled = compileEliminateDeadCode({
          code,
          root: ROOT,
          filename: id,
        })

        if (debug) console.info('')
        if (debug) console.info('Output after dead code elimination')
        if (debug) console.info('')
        if (debug) console.info(compiled.code)
        if (debug) console.info('')
        if (debug) console.info('')
        if (debug) console.info('')

        return compiled
      }

      return null
    },
  }
}
