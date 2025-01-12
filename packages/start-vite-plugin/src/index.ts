import { fileURLToPath, pathToFileURL } from 'node:url'

import { compileEliminateDeadCode, compileStartOutput } from './compilers'
import type { findReferencedIdentifiers } from 'babel-dead-code-elimination'
import type { Plugin } from 'vite'
import type { InputOptions } from 'rollup'

const debug = Boolean(process.env.TSR_VITE_DEBUG)

export type TanStackStartViteOptions = {
  env: 'server' | 'client'
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

declare module 'rollup' {
  interface InputOptions {
    __TSR__REF_IDENTS?: ReturnType<typeof findReferencedIdentifiers>
  }
}

export function TanStackStartViteServerFn(
  opts: TanStackStartViteOptions,
): Plugin {
  let ROOT: string = process.cwd()

  let inputOpts: InputOptions | undefined = undefined

  return {
    name: 'vite-plugin-tanstack-start-create-server-fn',
    enforce: 'pre',
    options(options) {
      inputOpts = options
    },
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

      const { compiled, idents } = compileStartOutput({
        code,
        root: ROOT,
        filename: id,
        env: opts.env,
      })
      if (inputOpts) inputOpts.__TSR__REF_IDENTS = idents

      if (debug) console.info('')
      if (debug) console.info('Compiled createServerFn Output')
      if (debug) console.info('')
      if (debug) console.info(compiled.code)
      if (debug) console.info('')
      if (debug) console.info('')
      if (debug) console.info('')

      return compiled
    },
  }
}

export function TanStackStartViteDeadCodeElimination(
  opts: TanStackStartViteOptions,
): Plugin {
  let ROOT: string = process.cwd()

  let inputOpts: InputOptions | undefined = undefined

  return {
    name: 'vite-plugin-tanstack-start-dead-code-elimination',
    enforce: 'post',
    options(options) {
      inputOpts = options
    },
    configResolved: (config) => {
      ROOT = config.root
    },
    transform(code, id) {
      const url = pathToFileURL(id)
      url.searchParams.delete('v')
      id = fileURLToPath(url).replace(/\\/g, '/')

      if (transformFuncs.some((fn) => code.includes(fn))) {
        if (debug) console.info('Handling dead code elimination: ', id)

        if (debug) console.info('')
        if (debug) console.info('Dead Code Elimination Input:')
        if (debug) console.info('')
        if (debug) console.info(code)
        if (debug) console.info('')
        if (debug) console.info('')
        if (debug) console.info('')

        const compiled = compileEliminateDeadCode(
          {
            code,
            root: ROOT,
            filename: id,
            env: opts.env,
          },
          inputOpts?.__TSR__REF_IDENTS,
        )

        if (debug) console.info('')
        if (debug) console.info('Dead Code Elimination Output:')
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
