import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { logDiff } from '@tanstack/router-utils'

import { VIRTUAL_MODULES } from '@tanstack/start-server-core'
import { normalizePath } from 'vite'
import path from 'pathe'
import { makeIdFiltersToMatchWithQuery } from '@rolldown/pluginutils'
import { TRANSFORM_ID_REGEX, VITE_ENVIRONMENT_NAMES } from '../constants'
import { compileStartOutputFactory } from './compilers'
import { transformFuncs } from './constants'
import type { ViteEnvironmentNames } from '../constants'
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
): Plugin {
  const compileStartOutput = compileStartOutputFactory(framework)

  return {
    name: 'tanstack-start-core:compiler',
    enforce: 'pre',
    applyToEnvironment(env) {
      return [
        VITE_ENVIRONMENT_NAMES.client,
        VITE_ENVIRONMENT_NAMES.server,
      ].includes(env.name as ViteEnvironmentNames)
    },
    transform: {
      filter: {
        code: tokenRegex,
        id: {
          include: TRANSFORM_ID_REGEX,
          exclude: [
            VIRTUAL_MODULES.serverFnManifest,
            // N.B. the following files either just re-export or provide the runtime implementation of those functions
            // we do not want to include them in the transformation
            // however, those packages (especially start-client-core ATM) also USE these functions
            // (namely `createIsomorphicFn` in `packages/start-client-core/src/getRouterInstance.ts`) and thus need to be transformed
            ...makeIdFiltersToMatchWithQuery([
              ...resolveRuntimeFiles({
                package: '@tanstack/start-client-core',
                files: [
                  'index.js',
                  'createIsomorphicFn.js',
                  'envOnly.js',
                  'serverFnFetcher.js',
                  'createStart.js',
                  'createMiddleware.js',
                ],
              }),
              ...resolveRuntimeFiles({
                package: '@tanstack/start-server-core',
                files: ['index.js', 'server-functions-handler.js'],
              }),
            ]),
          ],
        },
      },
      handler(code, id) {
        const env =
          this.environment.name === VITE_ENVIRONMENT_NAMES.client
            ? 'client'
            : this.environment.name === VITE_ENVIRONMENT_NAMES.server
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
