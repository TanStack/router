import { fileURLToPath, pathToFileURL } from 'node:url'
import { logDiff } from '@tanstack/router-utils'
import { compileStartOutput } from './compilers'

import type { Plugin } from 'vite'

const debug =
  process.env.TSR_VITE_DEBUG &&
  ['true', 'start-plugin'].includes(process.env.TSR_VITE_DEBUG)

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

// TODO: Bring these back
// (() => {
//   let entry: string | null = null
//   let ROOT: string = process.cwd()
//   return {
//     name: 'vite-plugin-tanstack-start-server-entry-client',
//     enforce: 'pre',
//     configResolved: (config) => {
//       ROOT = config.root
//       entry = path.resolve(ROOT, (config as any).router.handler)

//       if (!entry) {
//         throw new Error('@tanstack/start-plugin: No server entry found!')
//       }
//     },
//     transform(code, id) {
//       if (entry && id.includes(entry)) {
//         return {
//           code: `${code}\n\nimport '${path.resolve(ROOT, opts.globalMiddlewareEntry)}'`,
//           map: null,
//         }
//       }
//       return null
//     },
//   }
// })(),

export function TanStackStartCompilerPlugin(opts?: {
  client?: {
    envName?: string
  }
  server?: {
    envName?: string
  }
}): Plugin {
  opts = {
    client: {
      envName: 'client',
      ...opts?.client,
    },
    server: {
      envName: 'server',
      ...opts?.server,
    },
  }

  return {
    name: 'vite-plugin-tanstack-start-create-server-fn',
    enforce: 'pre',
    applyToEnvironment(env) {
      return [opts.client?.envName, opts.server?.envName].includes(env.name)
    },
    transform(code, id) {
      const env =
        this.environment.name === opts.client?.envName
          ? 'client'
          : this.environment.name === opts.server?.envName
            ? 'server'
            : (() => {
                throw new Error(
                  `Environment ${this.environment.name} not configured`,
                )
              })()

      return transformCode({
        code,
        id,
        env,
      })
    },
  }
}

function transformCode(opts: {
  code: string
  id: string
  env: 'server' | 'client'
}) {
  const { code, env } = opts
  let { id } = opts

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
      `We detected that the '@vitejs/plugin-react' was passed before '@tanstack/start-plugin'. Please make sure that '@tanstack/router-vite-plugin' is passed before '@vitejs/plugin-react' and try again:
      e.g.

      plugins: [
        TanStackStartVite(), // Place this before viteReact()
        viteReact(),
      ]
      `,
    )
  }

  if (debug) console.info(`${env} Compiling Start: `, id)

  const compiled = compileStartOutput({
    code,
    filename: id,
    env,
  })

  if (debug) {
    logDiff(code, compiled.code)
    console.log('Output:\n', compiled.code + '\n\n')
  }

  return compiled
}
