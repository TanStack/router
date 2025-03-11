import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { logDiff } from '@tanstack/router-utils'
import { compileStartOutput } from './compilers'
import type { Plugin } from 'vite'

const debug =
  process.env.TSR_VITE_DEBUG &&
  ['true', 'react-start-plugin'].includes(process.env.TSR_VITE_DEBUG)

export type TanStackStartViteOptions = {
  globalMiddlewareEntry: string
}

const transformFuncs = [
  'createServerFn',
  'createMiddleware',
  'serverOnly',
  'clientOnly',
  'createIsomorphicFn',
]
const tokenRegex = new RegExp(transformFuncs.join('|'))
// const eitherFuncRegex = new RegExp(
//   `(function ${transformFuncs.join('|function ')})`,
// )

export function createTanStackStartPlugin(opts: TanStackStartViteOptions): {
  client: Array<Plugin>
  ssr: Array<Plugin>
  server: Array<Plugin>
} {
  const globalMiddlewarePlugin = (): Plugin => {
    let entry: string | null = null
    let resolvedGlobalMiddlewareEntry: string | null = null
    let globalMiddlewareEntryExists = false
    let ROOT: string = process.cwd()
    return {
      name: 'vite-plugin-tanstack-start-ensure-global-middleware',
      enforce: 'pre',
      configResolved: (config) => {
        ROOT = config.root
        entry = path.resolve(ROOT, (config as any).router.handler)
        resolvedGlobalMiddlewareEntry = path.resolve(
          ROOT,
          opts.globalMiddlewareEntry,
        )
        globalMiddlewareEntryExists = existsSync(resolvedGlobalMiddlewareEntry)

        if (!entry) {
          throw new Error(
            '@tanstack/react-start-plugin: No server entry found!',
          )
        }
      },
      transform(code, id) {
        if (entry && id.includes(entry)) {
          if (globalMiddlewareEntryExists) {
            return {
              code: `${code}\n\nimport '${path.resolve(ROOT, opts.globalMiddlewareEntry)}'`,
              map: null,
            }
          }
        }
        return null
      },
    }
  }

  return {
    client: [
      globalMiddlewarePlugin(),
      TanStackStartServerFnsAndMiddleware({ ...opts, env: 'client' }),
    ],
    ssr: [
      globalMiddlewarePlugin(),
      TanStackStartServerFnsAndMiddleware({ ...opts, env: 'ssr' }),
    ],
    server: [
      globalMiddlewarePlugin(),
      TanStackStartServerFnsAndMiddleware({ ...opts, env: 'server' }),
    ],
  }
}

export function TanStackStartServerFnsAndMiddleware(opts: {
  env: 'server' | 'ssr' | 'client'
}): Plugin {
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
      // const includesEitherFunc = eitherFuncRegex.test(code)

      if (
        !includesToken
        // includesEitherFunc
        // /node_modules/.test(id)
      ) {
        return null
      }

      if (code.includes('@react-refresh')) {
        throw new Error(
          `We detected that the '@vitejs/plugin-react' was passed before '@tanstack/react-start-plugin'. Please make sure that '@tanstack/router-vite-plugin' is passed before '@vitejs/plugin-react' and try again: 
e.g.

plugins: [
  TanStackStartVite(), // Place this before viteReact()
  viteReact(),
]
`,
        )
      }

      if (debug) console.info(`${opts.env} Compiling Start: `, id)

      const compiled = compileStartOutput({
        code,
        root: ROOT,
        filename: id,
        env: opts.env,
      })

      if (debug) {
        logDiff(code, compiled.code)
        console.log('Output:\n', compiled.code + '\n\n')
      }

      return compiled
    },
  }
}
