import { fileURLToPath, pathToFileURL } from 'node:url'
import { logDiff } from '@tanstack/router-utils'

import { VIRTUAL_MODULES } from '@tanstack/start-server-core'
import { compileStartOutputFactory } from './compilers'
import type { Plugin } from 'vite'
import type { CompileStartFrameworkOptions } from './compilers'

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
  'createServerFileRoute',
  'createServerRootRoute',
]

const tokenRegex = new RegExp(transformFuncs.join('|'))

export function startCompilerPlugin(
  framework: CompileStartFrameworkOptions,
  inputOpts?: {
    client?: {
      envName?: string
    }
    server?: {
      envName?: string
    }
  },
): Plugin {
  const opts = {
    client: {
      envName: 'client',
      ...inputOpts?.client,
    },
    server: {
      envName: 'server',
      ...inputOpts?.server,
    },
  }

  return {
    name: 'vite-plugin-tanstack-start-create-server-fn',
    enforce: 'pre',
    applyToEnvironment(env) {
      return [opts.client.envName, opts.server.envName].includes(env.name)
    },
    transform: {
      filter: {
        code: tokenRegex,
        id: {
          exclude: VIRTUAL_MODULES.serverFnManifest,
        },
      },
      handler(code, id) {
        const env =
          this.environment.name === opts.client.envName
            ? 'client'
            : this.environment.name === opts.server.envName
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
          framework,
        })
      },
    },
  }
}

function transformCode(opts: {
  code: string
  id: string
  env: 'server' | 'client'
  framework: CompileStartFrameworkOptions
}) {
  const { code, env, framework } = opts
  let { id } = opts

  const url = pathToFileURL(id)
  url.searchParams.delete('v')
  id = fileURLToPath(url).replace(/\\/g, '/')

  if (debug) console.info(`${env} Compiling Start: `, id)

  const compileStartOutput = compileStartOutputFactory(framework)
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
