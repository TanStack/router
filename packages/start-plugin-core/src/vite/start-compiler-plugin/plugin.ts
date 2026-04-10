import assert from 'node:assert'
import { VIRTUAL_MODULES } from '@tanstack/start-server-core'
import { resolve as resolvePath } from 'pathe'
import {
  SERVER_FN_LOOKUP,
  TRANSFORM_ID_REGEX,
  VITE_ENVIRONMENT_NAMES,
} from '../../constants'
import { detectKindsInCode } from '../../start-compiler/compiler'
import { getTransformCodeFilterForEnv } from '../../start-compiler/config'
import {
  createStartCompiler,
  mergeServerFnsById,
} from '../../start-compiler/host'
import { loadModuleForViteCompiler } from '../../start-compiler/load-module'
import { generateServerFnResolverModule } from '../../start-compiler/server-fn-resolver-module'
import { cleanId } from '../../start-compiler/utils'
import {
  createViteDevServerFnModuleSpecifierEncoder,
  decodeViteDevServerModuleSpecifier,
} from './module-specifier'
import type { CompileStartFrameworkOptions } from '../../types'
import type {
  GenerateFunctionIdFnOptional,
  ServerFn,
} from '../../start-compiler/types'
import type { PluginOption } from 'vite'

// Re-export from shared constants for backwards compatibility
export { SERVER_FN_LOOKUP }

function resolveViteId(id: string) {
  return `\0${id}`
}

const validateServerFnIdVirtualModule = `virtual:tanstack-start-validate-server-fn-id`

function getDevServerFnValidatorModule(): string {
  return `
export async function getServerFnById(id, _access) {
  const validateIdImport = ${JSON.stringify(validateServerFnIdVirtualModule)} + '?id=' + id
  await import(/* @vite-ignore */ '/@id/__x00__' + validateIdImport)
  const decoded = Buffer.from(id, 'base64url').toString('utf8')
  const devServerFn = JSON.parse(decoded)
  const mod = await import(/* @vite-ignore */ devServerFn.file)
  return mod[devServerFn.export]
}
`
}

function parseIdQuery(id: string): {
  filename: string
  query: {
    [k: string]: string
  }
} {
  if (!id.includes('?')) return { filename: id, query: {} }
  const [filename, rawQuery] = id.split(`?`, 2) as [string, string]
  const query = Object.fromEntries(new URLSearchParams(rawQuery))
  return { filename, query }
}

export interface StartCompilerPluginOptions {
  framework: CompileStartFrameworkOptions
  environments: Array<{
    name: string
    type: 'client' | 'server'
    getServerFnById?: string
  }>
  /**
   * Custom function ID generator (optional).
   */
  generateFunctionId?: GenerateFunctionIdFnOptional
  /**
   * The Vite environment name for the server function provider.
   */
  providerEnvName: string
}

export function startCompilerPlugin(
  opts: StartCompilerPluginOptions,
): PluginOption {
  const compilers = new Map<string, ReturnType<typeof createStartCompiler>>()

  // Shared registry of server functions across all environments
  const serverFnsById: Record<string, ServerFn> = {}

  const onServerFnsById = (d: Record<string, ServerFn>) => {
    mergeServerFnsById(serverFnsById, d)
  }

  let root = process.cwd()
  const resolvedResolverVirtualImportId = resolveViteId(
    VIRTUAL_MODULES.serverFnResolver,
  )

  // Determine which environments need the resolver (getServerFnById)
  // SSR environment always needs the resolver for server-side calls
  // Provider environment needs it for the actual implementation
  const ssrEnvName = VITE_ENVIRONMENT_NAMES.server

  // SSR is the provider when the provider environment is the default server environment
  const ssrIsProvider = opts.providerEnvName === ssrEnvName

  // Environments that need the resolver: SSR (for server calls) and provider (for implementation)
  const appliedResolverEnvironments = new Set(
    ssrIsProvider ? [opts.providerEnvName] : [ssrEnvName, opts.providerEnvName],
  )

  function perEnvServerFnPlugin(environment: {
    name: string
    type: 'client' | 'server'
  }): PluginOption {
    // Derive transform code filter from KindDetectionPatterns (single source of truth)
    const transformCodeFilter = getTransformCodeFilterForEnv(environment.type)
    return {
      name: `tanstack-start-core::server-fn:${environment.name}`,
      enforce: 'pre',
      applyToEnvironment(env) {
        return env.name === environment.name
      },
      configResolved(config) {
        root = config.root
      },
      transform: {
        filter: {
          id: {
            exclude: new RegExp(`${SERVER_FN_LOOKUP}$`),
            include: TRANSFORM_ID_REGEX,
          },
          code: {
            include: transformCodeFilter,
          },
        },
        async handler(code, id) {
          let compiler = compilers.get(this.environment.name)

          if (!compiler) {
            // Default to 'dev' mode for unknown environments (conservative: no caching)
            const mode = this.environment.mode === 'build' ? 'build' : 'dev'

            compiler = createStartCompiler({
              env: environment.type,
              envName: environment.name,
              root,
              mode,
              framework: opts.framework,
              providerEnvName: opts.providerEnvName,
              generateFunctionId: opts.generateFunctionId,
              onServerFnsById,
              getKnownServerFns: () => serverFnsById,
              encodeModuleSpecifierInDev:
                mode === 'dev'
                  ? createViteDevServerFnModuleSpecifierEncoder(root)
                  : undefined,
              loadModule: async (id: string) => {
                await loadModuleForViteCompiler({
                  compiler: compiler!,
                  mode: this.environment.mode,
                  fetchModule:
                    this.environment.mode === 'dev'
                      ? this.environment.fetchModule.bind(this.environment)
                      : undefined,
                  loadModule: this.load.bind(this),
                  id,
                })
              },

              resolveId: async (source: string, importer?: string) => {
                const r = await this.resolve(source, importer)

                if (r) {
                  if (!r.external) {
                    return cleanId(r.id)
                  }
                }

                return null
              },
            })

            compilers.set(this.environment.name, compiler)
          }

          // Detect which kinds are present in this file before parsing
          const detectedKinds = detectKindsInCode(code, environment.type)

          const result = await compiler.compile({
            id,
            code,
            detectedKinds,
          })
          return result
        },
      },

      hotUpdate(ctx) {
        const compiler = compilers.get(this.environment.name)

        ctx.modules.forEach((m) => {
          if (m.id) {
            const deleted = compiler?.invalidateModule(m.id)
            if (deleted) {
              m.importers.forEach((importer) => {
                if (importer.id) {
                  compiler?.invalidateModule(importer.id)
                }
              })
            }
          }
        })
      },
    }
  }

  return [
    ...opts.environments.map(perEnvServerFnPlugin),
    {
      name: 'tanstack-start-core:capture-server-fn-module-lookup',
      // we only need this plugin in dev mode
      apply: 'serve',
      applyToEnvironment(env) {
        return !!opts.environments.find((e) => e.name === env.name)
      },
      transform: {
        filter: {
          id: new RegExp(`${SERVER_FN_LOOKUP}$`),
        },
        handler(code, id) {
          const compiler = compilers.get(this.environment.name)
          compiler?.ingestModule({ code, id: cleanId(id) })
        },
      },
    },
    // Validate server function ID in dev mode
    {
      name: 'tanstack-start-core:validate-server-fn-id',
      apply: 'serve',
      load: {
        filter: {
          id: new RegExp(resolveViteId(validateServerFnIdVirtualModule)),
        },
        async handler(id) {
          const parsed = parseIdQuery(id)
          const fnId = parsed.query.id
          if (fnId && serverFnsById[fnId]) {
            return `export {}`
          }

          // ID not yet registered — the source file may not have been
          // transformed in this dev session yet (e.g. cold restart with
          // cached client). Try to decode the ID, discover the source
          // file, trigger its compilation, and re-check.
          if (fnId) {
            try {
              const decoded = JSON.parse(
                Buffer.from(fnId, 'base64url').toString('utf8'),
              )
              if (
                typeof decoded.file === 'string' &&
                typeof decoded.export === 'string'
              ) {
                // Use the Vite strategy to decode the module specifier
                // back to the original source file path.
                const sourceFile = decodeViteDevServerModuleSpecifier(
                  decoded.file,
                )

                if (sourceFile) {
                  // Resolve to absolute path
                  const absPath = resolvePath(root, sourceFile)

                  // Trigger transform of the source file in this environment,
                  // which will compile createServerFn calls and populate
                  // serverFnsById as a side effect.
                  // This plugin only runs in dev (apply: 'serve'), so mode
                  // must be 'dev' — assert to narrow to DevEnvironment.
                  assert(this.environment.mode === 'dev')
                  await this.environment.fetchModule(absPath)

                  // Re-check after lazy compilation
                  if (serverFnsById[fnId]) {
                    return `export {}`
                  }
                }
              }
            } catch {
              // Decoding or fetching failed — fall through to error
            }
          }

          this.error(`Invalid server function ID: ${fnId}`)
        },
      },
    },
    // Manifest plugin for server environments
    {
      name: 'tanstack-start-core:server-fn-resolver',
      enforce: 'pre',
      applyToEnvironment: (env) => {
        return appliedResolverEnvironments.has(env.name)
      },
      configResolved(config) {
        root = config.root
      },
      resolveId: {
        filter: { id: new RegExp(VIRTUAL_MODULES.serverFnResolver) },
        handler() {
          return resolvedResolverVirtualImportId
        },
      },
      load: {
        filter: { id: new RegExp(resolvedResolverVirtualImportId) },
        handler() {
          if (this.environment.name !== opts.providerEnvName) {
            const mod = opts.environments.find(
              (e) => e.name === this.environment.name,
            )?.getServerFnById
            if (mod) {
              return mod
            } else {
              this.error(
                `No getServerFnById implementation found for caller environment: ${this.environment.name}`,
              )
            }
          }

          if (this.environment.mode !== 'build') {
            return getDevServerFnValidatorModule()
          }

          // When SSR is the provider, server-only-referenced functions aren't in the manifest,
          // so no isClientReferenced check is needed.
          // When SSR is NOT the provider (custom provider env), server-only-referenced
          // functions ARE in the manifest and need the isClientReferenced check to
          // block direct client HTTP requests to server-only-referenced functions.
          return generateServerFnResolverModule({
            serverFnsById,
            includeClientReferencedCheck: !ssrIsProvider,
          })
        },
      },
    },
  ]
}
