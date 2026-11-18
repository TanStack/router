import { AsyncLocalStorage } from 'node:async_hooks'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { z } from 'zod'
import { TRANSFORM_ID_REGEX } from '../constants'
import { getTransformCodeFilterForEnv } from '../start-compiler/config'
import { createHydrateCompilerPlugin } from '../hydrate-when-transform'
import { createStartCompiler, mergeServerFnsById } from '../start-compiler/host'
import { cleanId } from '../start-compiler/utils'
import { SERVER_FN_BUILD_INFO_FIELD } from './start-compiler-metadata'
import type { RsbuildPluginAPI, Rspack } from '@rsbuild/core'
import type { StartCompilerLoaderOptions } from './start-compiler-loader'
import type {
  CompileStartFrameworkOptions,
  StartCompilerImportTransform,
  StartCompilerPlugin,
} from '../types'
import type {
  DevServerFnModuleSpecifierEncoder,
  GenerateFunctionIdFnOptional,
  ServerFn,
} from '../start-compiler/types'

type RsbuildInputFileSystem = NonNullable<Rspack.Compiler['inputFileSystem']>
type StartCompilerEnvironment = {
  name: string
  type: 'client' | 'server'
}

const serverFnSchema = z.object({
  functionName: z.string(),
  functionId: z.string(),
  extractedFilename: z.string(),
  filename: z.string(),
  isClientReferenced: z.boolean().optional(),
})

const serverFnBuildInfoSchema = z.object({
  version: z.literal(1),
  serverFnsById: z.record(z.string(), serverFnSchema),
})

/**
 * In Rsbuild dev, use file:// URLs for absolute server function paths.
 * These are directly importable by Node's ESM VM runner without any bundler
 * path conventions (unlike Vite's /@id/ prefix).
 */
const rsbuildDevServerFnModuleSpecifierEncoder: DevServerFnModuleSpecifierEncoder =
  ({ extractedFilename }) => pathToFileURL(extractedFilename).href

const currentDir = dirname(fileURLToPath(import.meta.url))
const compilerLoaderFilename = 'start-compiler-loader.js'

function resolveCompilerLoader(): string {
  return resolve(currentDir, compilerLoaderFilename)
}

function readServerFnBuildInfo(
  module: Rspack.Module,
): Record<string, ServerFn> | null {
  const result = serverFnBuildInfoSchema.safeParse(
    module.buildInfo[SERVER_FN_BUILD_INFO_FIELD],
  )
  if (!result.success) {
    return null
  }

  return result.data.serverFnsById
}

export interface StartCompilerHostOptions {
  framework: CompileStartFrameworkOptions
  root: string | (() => string)
  environments: Array<StartCompilerEnvironment>
  providerEnvName: string
  generateFunctionId?: GenerateFunctionIdFnOptional
  compilerTransforms?: Array<StartCompilerImportTransform> | undefined
  compilerPlugins?: Array<StartCompilerPlugin> | undefined
  serverFnProviderModuleDirectives?: ReadonlyArray<string> | undefined
  serverFnsById?: Record<string, ServerFn>
  onServerFnsByIdChange?: () => void
}

/**
 * Registers the shared StartCompiler as a pre loader for each Start environment.
 *
 * The loader transforms source and writes metadata in the same invocation.
 * Compiler instances and queues remain scoped to their environment.
 */
export function registerStartCompilerTransforms(
  api: RsbuildPluginAPI,
  opts: StartCompilerHostOptions,
): {
  serverFnsById: Record<string, ServerFn>
} {
  // Serialize access to each StartCompiler's mutable per-environment caches.
  const compilerQueues = new Map<string, Promise<void>>()
  const transformContextStorage = new AsyncLocalStorage<Rspack.LoaderContext>()
  const serverFnsByEnvironment = new Map<string, Record<string, ServerFn>>()
  const serverFnsById = opts.serverFnsById ?? {}
  const getRoot = () =>
    typeof opts.root === 'function' ? opts.root() : opts.root
  const runCompilerTask = async <T>(
    environmentName: string,
    task: () => Promise<T>,
  ): Promise<T> => {
    const previous = compilerQueues.get(environmentName) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(task)

    compilerQueues.set(
      environmentName,
      next.then(
        () => undefined,
        () => undefined,
      ),
    )

    return next
  }

  const replaceServerFnsByIdFromEnvironmentSnapshots = () => {
    const nextServerFnsById: Record<string, ServerFn> = {}

    for (const snapshot of serverFnsByEnvironment.values()) {
      mergeServerFnsById(nextServerFnsById, snapshot)
    }

    for (const key of Object.keys(serverFnsById)) {
      delete serverFnsById[key]
    }

    Object.assign(serverFnsById, nextServerFnsById)
    opts.onServerFnsByIdChange?.()
  }
  const compilerPlugins = [
    createHydrateCompilerPlugin(),
    ...(opts.compilerPlugins ?? []),
  ]

  const isDev = api.context.action === 'dev'
  const mode = isDev ? 'dev' : 'build'
  const compilerLoader = resolveCompilerLoader()

  const environments = opts.environments

  for (const env of environments) {
    let startCompiler: ReturnType<typeof createStartCompiler>
    const compilerTransforms =
      env.name === opts.providerEnvName ? opts.compilerTransforms : undefined
    const envCodeFilters = getTransformCodeFilterForEnv(env.type, {
      compilerTransforms,
      compilerPlugins,
    })
    const serverFnProviderModuleDirectives =
      env.name === opts.providerEnvName
        ? opts.serverFnProviderModuleDirectives
        : undefined
    let activeServerFnMetadata: Record<string, ServerFn> | undefined
    const onServerFnsById = (d: Record<string, ServerFn>) => {
      mergeServerFnsById(serverFnsById, d)

      if (activeServerFnMetadata) {
        mergeServerFnsById(activeServerFnMetadata, d)
      }

      opts.onServerFnsByIdChange?.()
    }

    const compile: StartCompilerLoaderOptions['compile'] = (ctx, input) =>
      transformContextStorage.run(ctx, async () => {
        const discoveredServerFnsById: Record<string, ServerFn> = {}
        const result = await runCompilerTask(env.name, async () => {
          activeServerFnMetadata = discoveredServerFnsById
          try {
            return await startCompiler.compile(input)
          } finally {
            activeServerFnMetadata = undefined
          }
        })
        return { result, serverFnsById: discoveredServerFnsById }
      })

    api.modifyBundlerChain((chain, utils) => {
      if (utils.environment.name !== env.name) {
        return
      }
      // Register in the same phase as api.transform to preserve pre-loader order.
      chain.module
        .rule('tanstack-start-compiler')
        .test(TRANSFORM_ID_REGEX[0])
        .enforce('pre')
        .use('tanstack-start-compiler')
        .loader(compilerLoader)
        .options({
          env: env.type,
          envName: env.name,
          getRoot,
          compilerPlugins,
          compilerTransforms,
          codeFilters: envCodeFilters,
          compile,
        } satisfies StartCompilerLoaderOptions)
    })

    api.modifyRspackConfig((config, utils) => {
      if (utils.environment.name !== env.name) {
        return
      }

      config.plugins.push({
        apply(compiler: Rspack.Compiler) {
          if (!compiler.inputFileSystem) {
            throw new Error(`missing rspack input filesystem for ${env.name}`)
          }
          const inputFileSystem = compiler.inputFileSystem
          startCompiler = createStartCompiler({
            env: env.type,
            envName: env.name,
            root: getRoot(),
            mode,
            framework: opts.framework,
            providerEnvName: opts.providerEnvName,
            generateFunctionId: opts.generateFunctionId,
            compilerTransforms,
            compilerPlugins,
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

              const cleanedId = cleanId(moduleId)
              activeCtx.addDependency(cleanedId)
              const loaded = await readFileFromInputFileSystem(
                inputFileSystem,
                cleanedId,
              )
              const moduleCode = Buffer.isBuffer(loaded)
                ? loaded.toString('utf8')
                : loaded

              startCompiler.ingestModule({ code: moduleCode, id: cleanedId })
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

          compiler.hooks.finishMake.tap(
            {
              name: 'TanStackStartCompilerCachedServerFnMetadata',
              stage: -20,
            },
            (compilation) => {
              const restoredServerFnsById: Record<string, ServerFn> = {}

              for (const module of compilation.modules) {
                const metadata = readServerFnBuildInfo(module)
                if (!metadata) {
                  continue
                }

                mergeServerFnsById(restoredServerFnsById, metadata)
              }

              serverFnsByEnvironment.set(
                utils.environment.name,
                restoredServerFnsById,
              )
              replaceServerFnsByIdFromEnvironmentSnapshots()
            },
          )

          compiler.hooks.watchRun.tap(
            'TanStackStartCompilerModuleInvalidation',
            (watchCompiler) => {
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
  }

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
