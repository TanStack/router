import { pathToFileURL } from 'node:url'
import { TRANSFORM_ID_REGEX } from '../constants'
import { detectKindsInCode } from '../start-compiler/compiler'
import { getTransformCodeFilterForEnv } from '../start-compiler/config'
import {
  createStartCompiler,
  matchesCodeFilters,
  mergeServerFnsById,
} from '../start-compiler/host'
import { loadModuleForRsbuildCompiler } from '../start-compiler/load-module'
import { cleanId } from '../start-compiler/utils'
import { RSBUILD_ENVIRONMENT_NAMES } from './planning'
import type { RsbuildPluginAPI } from '@rsbuild/core'
import type { CompileStartFrameworkOptions } from '../types'
import type {
  DevServerFnModuleSpecifierEncoder,
  GenerateFunctionIdFnOptional,
  ServerFn,
} from '../start-compiler/types'

type RsbuildTransformContext = Parameters<
  Parameters<RsbuildPluginAPI['transform']>[1]
>[0]

/**
 * Rsbuild dev server fn ref strategy: uses file:// URLs for absolute paths.
 * These are directly importable by Node's ESM VM runner without any bundler
 * path conventions (unlike Vite's /@id/ prefix).
 */
const rsbuildDevServerFnModuleSpecifierEncoder: DevServerFnModuleSpecifierEncoder =
  ({ extractedFilename }) => pathToFileURL(extractedFilename).href

export interface StartCompilerHostOptions {
  framework: CompileStartFrameworkOptions
  root: string
  providerEnvName: string
  generateFunctionId?: GenerateFunctionIdFnOptional
  serverFnsById?: Record<string, ServerFn>
  onServerFnsByIdChange?: () => void
}

/**
 * Registers the shared StartCompiler as rsbuild transforms for client + ssr environments.
 *
 * Uses `api.transform()` to hook into the rsbuild loader pipeline, and the
 * transform context's native `resolve()` for module resolution.
 */
export function registerStartCompilerTransforms(
  api: RsbuildPluginAPI,
  opts: StartCompilerHostOptions,
): {
  serverFnsById: Record<string, ServerFn>
} {
  const compilers = new Map<string, ReturnType<typeof createStartCompiler>>()
  const serverFnsById = opts.serverFnsById ?? {}

  const onServerFnsById = (d: Record<string, ServerFn>) => {
    mergeServerFnsById(serverFnsById, d)
    opts.onServerFnsByIdChange?.()
  }

  const isDev = api.context.action === 'dev'
  const mode = isDev ? 'dev' : 'build'

  const environments: Array<{
    name: string
    type: 'client' | 'server'
  }> = [
    { name: RSBUILD_ENVIRONMENT_NAMES.client, type: 'client' },
    { name: RSBUILD_ENVIRONMENT_NAMES.server, type: 'server' },
  ]

  // Pre-compute code filter patterns per environment type
  const codeFilters: Record<'client' | 'server', Array<RegExp>> = {
    client: getTransformCodeFilterForEnv('client'),
    server: getTransformCodeFilterForEnv('server'),
  }

  for (const env of environments) {
    const envCodeFilters = codeFilters[env.type]

    api.transform(
      {
        test: TRANSFORM_ID_REGEX[0],
        environments: [env.name],
        order: 'pre',
      },
      async (ctx: RsbuildTransformContext) => {
        const code = ctx.code
        const id = ctx.resourcePath + (ctx.resourceQuery || '')

        // Quick string-level check: does this file contain any patterns for this env?
        if (!matchesCodeFilters(code, envCodeFilters)) {
          return code
        }

        let compiler = compilers.get(env.name)
        if (!compiler) {
          compiler = createStartCompiler({
            env: env.type,
            envName: env.name,
            root: opts.root,
            mode,
            framework: opts.framework,
            providerEnvName: opts.providerEnvName,
            generateFunctionId: opts.generateFunctionId,
            onServerFnsById,
            getKnownServerFns: () => serverFnsById,
            encodeModuleSpecifierInDev: isDev
              ? rsbuildDevServerFnModuleSpecifierEncoder
              : undefined,
            loadModule: async (moduleId: string) => {
              await loadModuleForRsbuildCompiler({
                compiler: compiler!,
                id: moduleId,
              })
            },
            resolveId: async (
              source: string,
              importer?: string,
            ): Promise<string | null> => {
              const context = importer
                ? importer.replace(/[/\\][^/\\]*$/, '')
                : opts.root

              return await new Promise((resolve, reject) => {
                ctx.resolve(context, source, (error, resolved) => {
                  if (error) {
                    reject(error)
                    return
                  }

                  if (!resolved) {
                    resolve(null)
                    return
                  }

                  resolve(cleanId(resolved))
                })
              })
            },
          })
          compilers.set(env.name, compiler)
        }

        const detectedKinds = detectKindsInCode(code, env.type)
        const result = await compiler.compile({ id, code, detectedKinds })

        if (!result) {
          return code
        }

        return {
          code: result.code,
          map: result.map ?? null,
        }
      },
    )
  }

  return { serverFnsById }
}
