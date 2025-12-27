import { VIRTUAL_MODULES } from '@tanstack/start-server-core'
import { TRANSFORM_ID_REGEX, VITE_ENVIRONMENT_NAMES } from '../constants'
import {
  KindDetectionPatterns,
  LookupKindsPerEnv,
  StartCompiler,
  detectKindsInCode,
} from './compiler'
import { cleanId } from './utils'
import type { CompileStartFrameworkOptions } from '../types'
import type { LookupConfig, LookupKind } from './compiler'
import type { GenerateFunctionIdFnOptional, ServerFn } from './types'
import type { PluginOption } from 'vite'

// Derive transform code filter from KindDetectionPatterns (single source of truth)
function getTransformCodeFilterForEnv(env: 'client' | 'server'): Array<RegExp> {
  const validKinds = LookupKindsPerEnv[env]
  const patterns: Array<RegExp> = []
  for (const [kind, pattern] of Object.entries(KindDetectionPatterns) as Array<
    [LookupKind, RegExp]
  >) {
    if (validKinds.has(kind)) {
      patterns.push(pattern)
    }
  }
  return patterns
}

const getLookupConfigurationsForEnv = (
  env: 'client' | 'server',
  framework: CompileStartFrameworkOptions,
): Array<LookupConfig> => {
  // Common configs for all environments
  const commonConfigs: Array<LookupConfig> = [
    {
      libName: `@tanstack/${framework}-start`,
      rootExport: 'createServerFn',
      kind: 'Root',
    },
    {
      libName: `@tanstack/${framework}-start`,
      rootExport: 'createIsomorphicFn',
      kind: 'IsomorphicFn',
    },
    {
      libName: `@tanstack/${framework}-start`,
      rootExport: 'createServerOnlyFn',
      kind: 'ServerOnlyFn',
    },
    {
      libName: `@tanstack/${framework}-start`,
      rootExport: 'createClientOnlyFn',
      kind: 'ClientOnlyFn',
    },
  ]

  if (env === 'client') {
    return [
      {
        libName: `@tanstack/${framework}-start`,
        rootExport: 'createMiddleware',
        kind: 'Root',
      },
      {
        libName: `@tanstack/${framework}-start`,
        rootExport: 'createStart',
        kind: 'Root',
      },
      ...commonConfigs,
    ]
  } else {
    // Server-only: add ClientOnly JSX component lookup
    return [
      ...commonConfigs,
      {
        libName: `@tanstack/${framework}-router`,
        rootExport: 'ClientOnly',
        kind: 'ClientOnlyJSX',
      },
    ]
  }
}
const SERVER_FN_LOOKUP = 'server-fn-module-lookup'

function resolveViteId(id: string) {
  return `\0${id}`
}

const validateServerFnIdVirtualModule = `virtual:tanstack-start-validate-server-fn-id`

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

/**
 * Generates the manifest module code for server functions.
 * @param serverFnsById - Map of function IDs to their server function info
 * @param includeClientReferencedCheck - Whether to include isClientReferenced flag and runtime check.
 *   This is needed when SSR is NOT the provider, so server-only-referenced functions in the manifest
 *   can be blocked from client HTTP requests.
 */
function generateManifestModule(
  serverFnsById: Record<string, ServerFn>,
  includeClientReferencedCheck: boolean,
): string {
  const manifestEntries = Object.entries(serverFnsById)
    .map(([id, fn]) => {
      const baseEntry = `'${id}': {
                functionName: '${fn.functionName}',
        importer: () => import(${JSON.stringify(fn.extractedFilename)})${
          includeClientReferencedCheck
            ? `,
        isClientReferenced: ${fn.isClientReferenced ?? true}`
            : ''
        }
      }`
      return baseEntry
    })
    .join(',')

  const getServerFnByIdParams = includeClientReferencedCheck ? 'id, opts' : 'id'
  const clientReferencedCheck = includeClientReferencedCheck
    ? `
      // If called from client, only allow client-referenced functions
      if (opts?.fromClient && !serverFnInfo.isClientReferenced) {
        throw new Error('Server function not accessible from client: ' + id)
      }
`
    : ''

  return `
    const manifest = {${manifestEntries}}

    export async function getServerFnById(${getServerFnByIdParams}) {
              const serverFnInfo = manifest[id]
              if (!serverFnInfo) {
                throw new Error('Server function info not found for ' + id)
              }
${clientReferencedCheck}
              const fnModule = await serverFnInfo.importer()

              if (!fnModule) {
                console.info('serverFnInfo', serverFnInfo)
                throw new Error('Server function module not resolved for ' + id)
              }

              const action = fnModule[serverFnInfo.functionName]

              if (!action) {
                  console.info('serverFnInfo', serverFnInfo)
                  console.info('fnModule', fnModule)

                throw new Error(
                  \`Server function module export not resolved for serverFn ID: \${id}\`,
                )
              }
              return action
            }
          `
}

export interface StartCompilerPluginOptions {
  framework: CompileStartFrameworkOptions
  environments: Array<{ name: string; type: 'client' | 'server' }>
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
  const compilers: Record<string /* envName */, StartCompiler> = {}

  // Shared registry of server functions across all environments
  const serverFnsById: Record<string, ServerFn> = {}

  const onServerFnsById = (d: Record<string, ServerFn>) => {
    Object.assign(serverFnsById, d)
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
          let compiler = compilers[this.environment.name]
          if (!compiler) {
            // Default to 'dev' mode for unknown environments (conservative: no caching)
            const mode = this.environment.mode === 'build' ? 'build' : 'dev'
            compiler = new StartCompiler({
              env: environment.type,
              envName: environment.name,
              root,
              lookupKinds: LookupKindsPerEnv[environment.type],
              lookupConfigurations: getLookupConfigurationsForEnv(
                environment.type,
                opts.framework,
              ),
              mode,
              framework: opts.framework,
              providerEnvName: opts.providerEnvName,
              generateFunctionId: opts.generateFunctionId,
              onServerFnsById,
              getKnownServerFns: () => serverFnsById,
              loadModule: async (id: string) => {
                if (this.environment.mode === 'build') {
                  const loaded = await this.load({ id })
                  // Handle modules with no runtime code (e.g., type-only exports).
                  // After TypeScript compilation, these become empty modules.
                  // Create an empty module info instead of throwing.
                  const code = loaded.code ?? ''
                  compiler!.ingestModule({ code, id })
                } else if (this.environment.mode === 'dev') {
                  /**
                   * in dev, vite does not return code from `ctx.load()`
                   * so instead, we need to take a different approach
                   * we must force vite to load the module and run it through the vite plugin pipeline
                   * we can do this by using the `fetchModule` method
                   * the `captureServerFnModuleLookupPlugin` captures the module code via its transform hook and invokes analyzeModuleAST
                   */
                  await this.environment.fetchModule(
                    id + '?' + SERVER_FN_LOOKUP,
                  )
                } else {
                  throw new Error(
                    `could not load module ${id}: unknown environment mode ${this.environment.mode}`,
                  )
                }
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
            compilers[this.environment.name] = compiler
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
        const compiler = compilers[this.environment.name]

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
          const compiler = compilers[this.environment.name]
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
        handler(id) {
          const parsed = parseIdQuery(id)
          if (parsed.query.id && serverFnsById[parsed.query.id]) {
            return `export {}`
          }
          this.error(`Invalid server function ID: ${parsed.query.id}`)
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
          // When SSR is not the provider, SSR callers need to use HTTP to call server functions
          // since they can't directly import from the provider environment
          if (this.environment.name !== opts.providerEnvName) {
            // SSR caller: use HTTP-based getServerFnById
            // This re-exports from the start-server-core package which handles HTTP calls
            return `export { getServerFnById } from '@tanstack/start-server-core/server-fn-ssr-caller'`
          }

          if (this.environment.mode !== 'build') {
            const mod = `
            export async function getServerFnById(id) {
              const validateIdImport = ${JSON.stringify(validateServerFnIdVirtualModule)} + '?id=' + id
              await import(/* @vite-ignore */ '/@id/__x00__' + validateIdImport)
              const decoded = Buffer.from(id, 'base64url').toString('utf8')
              const devServerFn = JSON.parse(decoded)
              const mod = await import(/* @vite-ignore */ devServerFn.file)
              return mod[devServerFn.export]
            }
            `
            return mod
          }

          // When SSR is the provider, server-only-referenced functions aren't in the manifest,
          // so no isClientReferenced check is needed.
          // When SSR is NOT the provider (custom provider env), server-only-referenced
          // functions ARE in the manifest and need the isClientReferenced check to
          // block direct client HTTP requests to server-only-referenced functions.
          const includeClientReferencedCheck = !ssrIsProvider
          return generateManifestModule(
            serverFnsById,
            includeClientReferencedCheck,
          )
        },
      },
    },
  ]
}
