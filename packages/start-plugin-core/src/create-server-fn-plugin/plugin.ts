import { TRANSFORM_ID_REGEX } from '../constants'
import {
  KindDetectionPatterns,
  LookupKindsPerEnv,
  ServerFnCompiler,
  detectKindsInCode,
} from './compiler'
import type { CompileStartFrameworkOptions } from '../types'
import type { LookupConfig, LookupKind } from './compiler'
import type { PluginOption } from 'vite'

function cleanId(id: string): string {
  // Remove null byte prefix used by Vite/Rollup for virtual modules
  if (id.startsWith('\0')) {
    id = id.slice(1)
  }
  const queryIndex = id.indexOf('?')
  return queryIndex === -1 ? id : id.substring(0, queryIndex)
}

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
    return commonConfigs
  }
}
const SERVER_FN_LOOKUP = 'server-fn-module-lookup'

function buildDirectiveSplitParam(directive: string) {
  return `tsr-directive-${directive.replace(/[^a-zA-Z0-9]/g, '-')}`
}

export function createServerFnPlugin(opts: {
  framework: CompileStartFrameworkOptions
  directive: string
  environments: Array<{ name: string; type: 'client' | 'server' }>
}): PluginOption {
  const compilers: Record<string /* envName */, ServerFnCompiler> = {}
  const directiveSplitParam = buildDirectiveSplitParam(opts.directive)

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
            const mode = 
              this.environment.mode === 'build' ? 'build' : ('dev' as const)
            compiler = new ServerFnCompiler({
              env: environment.type,
              directive: opts.directive,
              lookupKinds: LookupKindsPerEnv[environment.type],
              lookupConfigurations: getLookupConfigurationsForEnv(
                environment.type,
                opts.framework,
              ),
              mode,
              loadModule: async (id: string) => {
                if (this.environment.mode === 'build') {
                  const loaded = await this.load({ id })
                  if (!loaded.code) {
                    throw new Error(`could not load module ${id}`)
                  }
                  compiler!.ingestModule({ code: loaded.code, id })
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

          const isProviderFile = id.includes(directiveSplitParam)

          // Detect which kinds are present in this file before parsing
          const detectedKinds = detectKindsInCode(code, environment.type)

          id = cleanId(id)
          const result = await compiler.compile({
            id,
            code,
            isProviderFile,
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
  ]
}
