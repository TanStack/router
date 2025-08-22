import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { logDiff } from '@tanstack/router-utils'

import { VIRTUAL_MODULES } from '@tanstack/start-server-core'
import { normalizePath } from 'vite'
import path from 'pathe'
import { VITE_ENVIRONMENT_NAMES } from '../constants'
import { compileStartOutputFactory } from './compilers'
import { transformFuncs } from './constants'
import type { Plugin } from 'vite'
import type { CompileStartFrameworkOptions } from './compilers'

const debug =
  process.env.TSR_VITE_DEBUG &&
  ['true', 'start-plugin'].includes(process.env.TSR_VITE_DEBUG)

export type TanStackStartViteOptions = {
  globalMiddlewareEntry: string
}

const tokenRegex = new RegExp(transformFuncs.join('|'))

const require = createRequire(import.meta.url)

function resolveRuntimeFiles(opts: { package: string; files: Array<string> }) {
  const pkgRoot = resolvePackage(opts.package)
  const basePath = path.join(pkgRoot, 'dist', 'esm')

  return opts.files.map((file) => normalizePath(path.join(basePath, file)))
}

function resolvePackage(packageName: string): string {
  const pkgRoot = path.dirname(require.resolve(packageName + '/package.json'))
  return pkgRoot
}

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
      envName: VITE_ENVIRONMENT_NAMES.client,
      ...inputOpts?.client,
    },
    server: {
      envName: VITE_ENVIRONMENT_NAMES.server,
      ...inputOpts?.server,
    },
  }

  const compileStartOutput = compileStartOutputFactory(framework)

  return {
    name: 'tanstack-start-core:compiler',
    enforce: 'pre',
    applyToEnvironment(env) {
      return [opts.client.envName, opts.server.envName].includes(env.name)
    },
    transform: {
      filter: {
        code: tokenRegex,
        id: {
          exclude: [
            VIRTUAL_MODULES.serverFnManifest,
            // N.B. the following files either just re-export or provide the runtime implementation of those functions
            // we do not want to include them in the transformation
            // however, those packages (especially start-client-core ATM) also USE these functions
            // (namely `createIsomorphicFn` in `packages/start-client-core/src/getRouterInstance.ts`) and thus need to be transformed
            ...resolveRuntimeFiles({
              package: '@tanstack/start-client-core',
              files: [
                'index.js',
                'createIsomorphicFn.js',
                'envOnly.js',
                'createServerFn.js',
                'createMiddleware.js',
                'serverFnFetcher.js',
              ],
            }),
            ...resolveRuntimeFiles({
              package: '@tanstack/start-server-core',
              files: [
                'index.js',
                'server-functions-handler.js',
                'serverRoute.js',
              ],
            }),
            ...resolveRuntimeFiles({
              package: `@tanstack/${framework}-start-client`,
              files: ['index.js'],
            }),
          ],
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

        const url = pathToFileURL(id)
        url.searchParams.delete('v')
        id = fileURLToPath(url).replace(/\\/g, '/')

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
      },
    },
  }
}
