import { fileURLToPath, pathToFileURL } from 'node:url'

import { compileStartOutput } from './compilers'

import { logDiff } from './logger'
import type { Plugin } from 'vite'

const debug = Boolean(process.env.TSR_VITE_DEBUG)

export type TanStackStartViteOptions = {
  env: 'server' | 'ssr' | 'client'
}

const transformFuncs = [
  'createServerFn',
  'createMiddleware',
  'serverOnly',
  'clientOnly',
  'createIsomorphicFn',
]
const tokenRegex = new RegExp(transformFuncs.join('|'))
const eitherFuncRegex = new RegExp(
  `(function ${transformFuncs.join('|function ')})`,
)

export function TanStackStartVitePlugin(
  opts: TanStackStartViteOptions,
): Plugin {
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

      const includesToken = tokenRegex.test(code)
      const includesEitherFunc = eitherFuncRegex.test(code)

      if (
        !includesToken ||
        includesEitherFunc
        // /node_modules/.test(id)
      ) {
        return null
      }

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

      if (debug) console.info('Compiling Start: ', id)

      const compiled = compileStartOutput({
        code,
        root: ROOT,
        filename: id,
        env: opts.env,
      })

      if (debug) {
        logDiff(code, compiled.code)
      }

      return compiled
    },
  }
}
