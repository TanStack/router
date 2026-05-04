import { AsyncLocalStorage } from 'node:async_hooks'
import { pathToFileURL } from 'node:url'
import { TRANSFORM_ID_REGEX } from '../constants'
import { detectKindsInCode } from '../start-compiler/compiler'
import { getTransformCodeFilterForEnv } from '../start-compiler/config'
import {
  createStartCompiler,
  matchesCodeFilters,
  mergeServerFnsById,
} from '../start-compiler/host'
import { cleanId } from '../start-compiler/utils'
import { RSBUILD_ENVIRONMENT_NAMES } from './planning'
import type { RsbuildPluginAPI, Rspack } from '@rsbuild/core'
import type {
  CompileStartFrameworkOptions,
  StartCompilerImportTransform,
} from '../types'
import type {
  DevServerFnModuleSpecifierEncoder,
  GenerateFunctionIdFnOptional,
  ServerFn,
} from '../start-compiler/types'

type RsbuildTransformContext = Parameters<
  Parameters<RsbuildPluginAPI['transform']>[1]
>[0]
type RsbuildInputFileSystem = NonNullable<Rspack.Compiler['inputFileSystem']>

/**
 * Rsbuild dev server fn ref strategy: uses file:// URLs for absolute paths.
 * These are directly importable by Node's ESM VM runner without any bundler
 * path conventions (unlike Vite's /@id/ prefix).
 */
const rsbuildDevServerFnModuleSpecifierEncoder: DevServerFnModuleSpecifierEncoder =
  ({ extractedFilename }) => pathToFileURL(extractedFilename).href

export interface StartCompilerHostOptions {
  framework: CompileStartFrameworkOptions
  root: string | (() => string)
  providerEnvName: string
  generateFunctionId?: GenerateFunctionIdFnOptional
  compilerTransforms?: Array<StartCompilerImportTransform> | undefined
  serverFnProviderModuleDirectives?: ReadonlyArray<string> | undefined
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
  const inputFileSystems = new Map<string, RsbuildInputFileSystem>()
  const transformContextStorage =
    new AsyncLocalStorage<RsbuildTransformContext>()
  const serverFnsById = opts.serverFnsById ?? {}
  const getRoot = () =>
    typeof opts.root === 'function' ? opts.root() : opts.root

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
    server: getTransformCodeFilterForEnv('server', {
      compilerTransforms: opts.compilerTransforms,
    }),
  }

  for (const env of environments) {
    const envCodeFilters = codeFilters[env.type]
    const compilerTransforms =
      env.name === RSBUILD_ENVIRONMENT_NAMES.server
        ? opts.compilerTransforms
        : undefined
    const serverFnProviderModuleDirectives =
      env.name === opts.providerEnvName
        ? opts.serverFnProviderModuleDirectives
        : undefined

    api.transform(
      {
        test: TRANSFORM_ID_REGEX[0],
        environments: [env.name],
        order: 'pre',
      },
      async (ctx: RsbuildTransformContext) => {
        return transformContextStorage.run(ctx, async () => {
          const code = ctx.code
          const id = ctx.resourcePath + (ctx.resourceQuery || '')

          // Quick string-level check: does this file contain any patterns for this env?
          if (!matchesCodeFilters(code, envCodeFilters)) {
            return code
          }

          let compiler = compilers.get(env.name)
          if (!compiler) {
            const root = getRoot()

            compiler = createStartCompiler({
              env: env.type,
              envName: env.name,
              root,
              mode,
              framework: opts.framework,
              providerEnvName: opts.providerEnvName,
              generateFunctionId: opts.generateFunctionId,
              compilerTransforms,
              serverFnProviderModuleDirectives,
              onServerFnsById,
              getKnownServerFns: () => serverFnsById,
              encodeModuleSpecifierInDev: isDev
                ? rsbuildDevServerFnModuleSpecifierEncoder
                : undefined,
              loadModule: async (moduleId: string) => {
                const activeCtx = transformContextStorage.getStore()
                if (!activeCtx) {
                  throw new Error(
                    `could not load module ${moduleId}: missing active rsbuild transform context for ${env.name}`,
                  )
                }

                const inputFileSystem = inputFileSystems.get(env.name)
                if (!inputFileSystem) {
                  throw new Error(
                    `could not load module ${moduleId}: missing rspack input filesystem for ${env.name}`,
                  )
                }

                const cleanedId = cleanId(moduleId)
                activeCtx.addDependency(cleanedId)
                const loaded = await readFileFromInputFileSystem(
                  inputFileSystem,
                  cleanedId,
                )
                const moduleCode = Buffer.isBuffer(loaded)
                  ? loaded.toString('utf8')
                  : loaded

                compiler!.ingestModule({ code: moduleCode, id: cleanedId })
              },
              resolveId: async (
                source: string,
                importer?: string,
              ): Promise<string | null> => {
                const activeCtx = transformContextStorage.getStore()
                if (!activeCtx) {
                  throw new Error(
                    `could not resolve ${source}: missing active rsbuild transform context for ${env.name}`,
                  )
                }

                const context = importer
                  ? importer.replace(/[/\\][^/\\]*$/, '')
                  : getRoot()

                return await new Promise((resolve, reject) => {
                  activeCtx.resolve(context, source, (error, resolved) => {
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

          const detectedKinds = detectKindsInCode(code, env.type, {
            compilerTransforms,
          })
          const result = await compiler.compile({ id, code, detectedKinds })

          if (!result) {
            return code
          }

          return {
            code: result.code,
            map: result.map ?? null,
          }
        })
      },
    )
  }

  api.modifyRspackConfig((config, utils) => {
    config.plugins.push({
      apply(compiler: Rspack.Compiler) {
        if (compiler.inputFileSystem) {
          inputFileSystems.set(utils.environment.name, compiler.inputFileSystem)
        }

        compiler.hooks.watchRun.tap(
          'TanStackStartCompilerModuleInvalidation',
          (watchCompiler) => {
            const startCompiler = compilers.get(utils.environment.name)

            if (!startCompiler) {
              return
            }

            for (const file of watchCompiler.modifiedFiles ?? []) {
              startCompiler.invalidateModule(file)
            }

            for (const file of watchCompiler.removedFiles ?? []) {
              startCompiler.invalidateModule(file)
            }
          },
        )
      },
    })
  })

  return { serverFnsById }
}

function readFileFromInputFileSystem(
  inputFileSystem: RsbuildInputFileSystem,
  file: string,
): Promise<string | Buffer> {
  return new Promise((resolve, reject) => {
    inputFileSystem.readFile(file, (error, data) => {
      if (error) {
        reject(error)
        return
      }

      if (data == null) {
        reject(new Error(`could not read module source for ${file}`))
        return
      }

      resolve(data)
    })
  })
}
