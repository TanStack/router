import { TRANSFORM_ID_REGEX } from '../constants'
import { ServerFnCompiler } from './compiler'
import type { LookupConfig, LookupKind } from './compiler'
import type { CompileStartFrameworkOptions } from '../start-compiler-plugin/compilers'
import type { PluginOption } from 'vite'

function cleanId(id: string): string {
  return id.split('?')[0]!
}

const LookupKindsPerEnv: Record<'client' | 'server', Set<LookupKind>> = {
  client: new Set(['Middleware', 'ServerFn'] as const),
  server: new Set(['ServerFn'] as const),
}

const getLookupConfigurationsForEnv = (
  env: 'client' | 'server',
  framework: CompileStartFrameworkOptions,
): Array<LookupConfig> => {
  const createServerFnConfig: LookupConfig = {
    libName: `@tanstack/${framework}-start`,
    rootExport: 'createServerFn',
  }
  if (env === 'client') {
    return [
      {
        libName: `@tanstack/${framework}-start`,
        rootExport: 'createMiddleware',
      },
      {
        libName: `@tanstack/${framework}-start`,
        rootExport: 'createStart',
      },

      createServerFnConfig,
    ]
  } else {
    return [createServerFnConfig]
  }
}
const SERVER_FN_LOOKUP = 'server-fn-module-lookup'
export function createServerFnPlugin(opts: {
  framework: CompileStartFrameworkOptions
  directive: string
  environments: Array<{ name: string; type: 'client' | 'server' }>
}): PluginOption {
  const compilers: Record<string /* envName */, ServerFnCompiler> = {}

  function perEnvServerFnPlugin(environment: {
    name: string
    type: 'client' | 'server'
  }): PluginOption {
    // in server environments, we don't transform middleware calls
    const transformCodeFilter =
      environment.type === 'client'
        ? [/\.\s*handler\(/, /\.\s*createMiddleware\(\)/]
        : [/\.\s*handler\(/]

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
            compiler = new ServerFnCompiler({
              env: environment.type,
              directive: opts.directive,
              lookupKinds: LookupKindsPerEnv[environment.type],
              lookupConfigurations: getLookupConfigurationsForEnv(
                environment.type,
                opts.framework,
              ),
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

          id = cleanId(id)
          const result = await compiler.compile({ id, code })
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
