import type { Environment } from 'vite'
import { TRANSFORM_ID_REGEX } from '../constants'
import type { ModuleLoaderApi } from '../module-loader-plugin/plugin'
import { findModuleLoaderApi, stripQueryString } from '../plugin-utils'
import { ServerFnCompiler } from './compiler'
import type { LookupConfig, LookupKind } from './compiler'
import type { CompileStartFrameworkOptions } from '../start-compiler-plugin/compilers'
import type { PluginOption } from 'vite'

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

export function createServerFnPlugin(opts: {
  framework: CompileStartFrameworkOptions
  directive: string
  environments: Array<{ name: string; type: 'client' | 'server' }>
}): PluginOption {
  // Store compilers per environment name to handle concurrent transforms correctly
  const compilers: Record<string, ServerFnCompiler> = {}

  function perEnvServerFnPlugin(environment: {
    name: string
    type: 'client' | 'server'
  }): PluginOption {
    // in server environments, we don't transform middleware calls
    const transformCodeFilter =
      environment.type === 'client'
        ? [/\.\s*handler\(/, /\.\s*createMiddleware\(\)/]
        : [/\.\s*handler\(/]

    let loaderApi: ModuleLoaderApi | undefined
    let viteEnv: Environment | undefined
    let ctxLoad:
      | ((options: { id: string }) => Promise<{ code: string | null }>)
      | undefined
    let ctxResolve:
      | ((
          source: string,
          importer?: string,
        ) => Promise<{ id: string; external?: boolean | 'absolute' } | null>)
      | undefined

    return {
      name: `tanstack-start-core::server-fn:${environment.name}`,
      enforce: 'pre',
      applyToEnvironment(env) {
        return env.name === environment.name
      },
      transform: {
        filter: {
          id: {
            include: TRANSFORM_ID_REGEX,
          },
          code: {
            include: transformCodeFilter,
          },
        },
        async handler(code, id) {
          const env = this.environment
          const envName = env.name

          let compiler = compilers[envName]
          if (!compiler) {
            loaderApi = findModuleLoaderApi(env.plugins)
            viteEnv = env
            ctxLoad = this.load.bind(this)
            ctxResolve = this.resolve.bind(this)

            compiler = new ServerFnCompiler({
              env: environment.type,
              directive: opts.directive,
              lookupKinds: LookupKindsPerEnv[environment.type],
              lookupConfigurations: getLookupConfigurationsForEnv(
                environment.type,
                opts.framework,
              ),
              loadModule: async (moduleId: string) => {
                const ctxLoadForEnv =
                  viteEnv!.mode === 'build' ? ctxLoad : undefined
                const moduleCode = await loaderApi!.loadModuleCode(
                  viteEnv!,
                  moduleId,
                  ctxLoadForEnv,
                )
                compiler!.ingestModule({ code: moduleCode, id: moduleId })
              },
              resolveId: async (
                source: string,
                importer: string | undefined,
              ) => {
                const r = await ctxResolve!(source, importer)
                if (r && !r.external) {
                  return stripQueryString(r.id)
                }
                return null
              },
            })
            compilers[envName] = compiler
          }

          id = stripQueryString(id)
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

  return opts.environments.map(perEnvServerFnPlugin)
}
