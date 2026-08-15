import { join } from 'pathe'
import {
  applyResolvedBaseAndOutput,
  applyResolvedRouterBasepath,
  createStartConfigContext,
} from '../config-context'
import { createServerFnBasePath, normalizePublicBase } from '../planning'
import { generateSerializationAdaptersModule } from '../serialization-adapters-module'
import { parseStartConfig } from './schema'
import {
  createBunDefine,
  createBunResolvedEntryAliases,
  resolveBunOutputDirectories,
} from './planning'
import { createBunVirtualModuleStore, VIRTUAL_MODULES } from './virtual-modules'
import { createBunCompilerHosts } from './start-compiler-host'
import { createBunRouterSession } from './start-router-plugin'
import {
  buildBunClient,
  buildBunServer,
  copyBunPublicAssets,
  writeBunHostEntry,
  type BunBuildContext,
} from './build-pipeline'
import { postBuildWithBun } from './post-build'
import { runBunNitroBuild } from './nitro-bridge'
import { runBunStandaloneCompile } from './standalone-compile'
import { createBunDevServer } from './dev-server'
import {
  hmrEventForScope,
  rebuildScopeForChange,
  shouldRegenerateRoutes,
} from './hmr-protocol'
import { rewriteImportMetaHot } from './hmr-runtime'
import { createBunProdServer } from './static-host'
import { createEnvDefine, loadBunEnvFiles } from './load-env'
import { transformFrameworkJsx } from './framework-jsx-plugin'
import type { ServerFn } from '../start-compiler/types'
import type {
  BunCoreOptions,
  TanStackStartBunPluginCoreOptions,
} from './types'
import type { TanStackStartBunInputConfig } from './schema'
import type { TanStackStartBunAdapter } from './types'

/** Merge `bun` options field-wise (primary overrides fallback). */
function mergeBunCoreOptions(
  primary?: BunCoreOptions,
  fallback?: BunCoreOptions,
): BunCoreOptions | undefined {
  if (!primary && !fallback) {
    return undefined
  }
  return {
    clientOutDir: primary?.clientOutDir ?? fallback?.clientOutDir,
    serverOutDir: primary?.serverOutDir ?? fallback?.serverOutDir,
    publicBase: primary?.publicBase ?? fallback?.publicBase,
    publicDir: primary?.publicDir ?? fallback?.publicDir,
    port: primary?.port ?? fallback?.port,
    hostname: primary?.hostname ?? fallback?.hostname,
    minify: primary?.minify ?? fallback?.minify,
    plugins: primary?.plugins ?? fallback?.plugins,
    clientPlugins: primary?.clientPlugins ?? fallback?.clientPlugins,
    serverPlugins: primary?.serverPlugins ?? fallback?.serverPlugins,
    css: primary?.css ?? fallback?.css,
    nitro: primary?.nitro ?? fallback?.nitro,
    standalone: primary?.standalone ?? fallback?.standalone,
  }
}

/** Create the experimental TanStack Start Bun bundler adapter. */
export function tanStackStartBun(
  corePluginOpts: TanStackStartBunPluginCoreOptions,
  startPluginOpts: TanStackStartBunInputConfig = {},
): TanStackStartBunAdapter {
  const configContext = createStartConfigContext({
    corePluginOpts,
    startPluginOpts,
    parseConfig: parseStartConfig,
  })

  async function prepare(root: string, mode: 'dev' | 'build') {
    const envMode = mode === 'dev' ? 'development' : 'production'
    const loadedEnv = loadBunEnvFiles({ root, mode: envMode })
    const serverEnvDefine = createEnvDefine(loadedEnv)
    const clientEnvDefine = createEnvDefine(loadedEnv, { publicOnly: true })

    const bunOpts = mergeBunCoreOptions(
      startPluginOpts.bun,
      corePluginOpts.bun,
    )

    const publicBase = normalizePublicBase(bunOpts?.publicBase ?? '/')
    const outDirs = resolveBunOutputDirectories({
      root,
      clientOutDir: bunOpts?.clientOutDir,
      serverOutDir: bunOpts?.serverOutDir,
    })

    applyResolvedBaseAndOutput({
      resolvedStartConfig: configContext.resolvedStartConfig,
      root,
      publicBase,
      clientOutputDirectory: outDirs.client,
      serverOutputDirectory: outDirs.server,
    })

    const { startConfig, resolvedStartConfig } = configContext.getConfig()
    const routerBasepath = applyResolvedRouterBasepath({
      resolvedStartConfig,
      startConfig,
    })

    const entryPlan = configContext.resolveEntries()
    const entryAliases = createBunResolvedEntryAliases({
      entryPaths: entryPlan.entryPaths,
    })

    const serverFnBase = createServerFnBasePath({
      routerBasepath,
      serverFnBase: startConfig.serverFns.base,
    })

    const inlineCssEnabled =
      mode === 'build' && startConfig.server.build.inlineCss.enabled

    const defineOpts = {
      serverFnBase,
      routerBasepath,
      publicBase: resolvedStartConfig.basePaths.publicBase,
      isDev: mode === 'dev',
      inlineCssEnabled,
      spaEnabled: startConfig.spa?.enabled === true,
      disableCsrfMiddlewareWarning:
        startConfig.serverFns.disableCsrfMiddlewareWarning === true,
    }

    const define = createBunDefine({
      ...defineOpts,
      extraDefine: serverEnvDefine,
    })
    const clientDefine = createBunDefine({
      ...defineOpts,
      extraDefine: clientEnvDefine,
    })

    const serverFnsById: Record<string, ServerFn> = {}
    const virtualModules = createBunVirtualModuleStore()
    const emittedCss = new Map<string, string>()
    const emittedCssAssets: Array<{
      sourcePath: string
      fileName: string
      css: string
    }> = []

    const setPluginAdapters = (runtime: 'client' | 'server') => {
      virtualModules.set(
        VIRTUAL_MODULES.pluginAdapters,
        generateSerializationAdaptersModule({
          adapters: corePluginOpts.serializationAdapters,
          runtime,
        }),
      )
    }
    setPluginAdapters('server')

    const refreshResolver = () => {
      virtualModules.updateServerFnResolver(serverFnsById, {
        includeClientReferencedCheck: !corePluginOpts.ssrIsProvider,
      })
    }
    refreshResolver()

    const routerSession = createBunRouterSession({
      root,
      framework: corePluginOpts.framework,
      routerConfig: startConfig.router,
      prerenderEnabled: startConfig.prerender?.enabled === true,
      isProduction: mode === 'build',
    })
    await routerSession.generate()

    const compilers = createBunCompilerHosts({
      root,
      framework: corePluginOpts.framework,
      providerEnvName: corePluginOpts.providerEnvironmentName,
      mode,
      ssrIsProvider: corePluginOpts.ssrIsProvider,
      serverFnsById,
      onRegistryChange: refreshResolver,
      compilerTransforms: corePluginOpts.compilerTransforms,
      serverFnProviderModuleDirectives:
        corePluginOpts.serverFnProviderModuleDirectives,
      transformJsx: (code, id, env) =>
        transformFrameworkJsx({
          code,
          id,
          env,
          framework: corePluginOpts.framework,
          root,
        }),
      preprocessCode: (code, id, env) =>
        routerSession.getCodeSplitterRuntime(env).transformReference(code, id),
    })

    const ctx: BunBuildContext = {
      startConfig,
      resolvedStartConfig,
      entryAliases,
      define,
      clientDefine,
      virtualModules,
      compilers,
      routerSession,
      outDirs,
      publicBase: resolvedStartConfig.basePaths.publicBase,
      refreshResolver,
      setPluginAdapters,
      mode,
      bunOpts,
      emittedCss,
      emittedCssAssets,
      framework: corePluginOpts.framework,
    }

    return { ctx, serverFnsById }
  }

  return {
    async build(opts) {
      const root = opts?.root ?? process.cwd()
      const { ctx } = await prepare(root, 'build')
      await buildBunClient(ctx)
      await copyBunPublicAssets({
        root,
        clientOutDir: ctx.outDirs.client,
        publicDir: ctx.bunOpts?.publicDir,
      })
      await buildBunServer(ctx)
      await writeBunHostEntry(ctx.outDirs.server)

      const nitroOpt = ctx.bunOpts?.nitro
      let clientOutDirForPostBuild = ctx.outDirs.client

      if (nitroOpt) {
        const nitroResult = await runBunNitroBuild({
          root,
          clientOutDir: ctx.outDirs.client,
          serverEntry: join(ctx.outDirs.server, 'server.js'),
          publicBase: ctx.publicBase,
          nitro: nitroOpt,
        })
        clientOutDirForPostBuild = nitroResult.publicDir
      }

      await postBuildWithBun({
        startConfig: ctx.startConfig,
        serverOutDir: ctx.outDirs.server,
        clientOutDir: clientOutDirForPostBuild,
      })

      const standaloneOpt = ctx.bunOpts?.standalone
      if (standaloneOpt) {
        if (nitroOpt) {
          console.warn(
            '[tanstack-start-bun] bun.nitro + bun.standalone: standalone always embeds dist/client (not .output/public).',
          )
        }
        const result = await runBunStandaloneCompile({
          root,
          clientOutDir: ctx.outDirs.client,
          serverOutDir: ctx.outDirs.server,
          standalone: standaloneOpt,
          publicBase: ctx.publicBase,
        })
        console.info(
          `[tanstack-start-bun] standalone executable → ${result.outfile}`,
        )
      }
    },

    async dev(opts) {
      const root = opts?.root ?? process.cwd()
      const { ctx, serverFnsById } = await prepare(root, 'dev')

      await buildBunClient(ctx)
      await copyBunPublicAssets({
        root,
        clientOutDir: ctx.outDirs.client,
        publicDir: ctx.bunOpts?.publicDir,
      })
      await buildBunServer(ctx)

      return createBunDevServer({
        root,
        port: opts?.port ?? ctx.bunOpts?.port ?? 3000,
        hostname:
          opts?.hostname ?? ctx.bunOpts?.hostname ?? '0.0.0.0',
        clientOutDir: ctx.outDirs.client,
        serverOutDir: ctx.outDirs.server,
        publicBase: ctx.publicBase,
        framework: corePluginOpts.framework,
        clientEntryPath: ctx.entryAliases.client,
        aliases: ctx.entryAliases.alias,
        define: ctx.clientDefine,
        esmDev: true,
        emittedCss: ctx.emittedCss,
        transformAppModule: async (code, absPath) => {
          const splitter = ctx.routerSession.getCodeSplitterRuntime('client')
          let next =
            absPath.includes('tsr-split') || absPath.includes('tsr-shared')
              ? splitter.transformVirtual(code, absPath)
              : splitter.transformReference(code, absPath)
          const { detectKindsInCode } = await import(
            '../start-compiler/compiler'
          )
          const { getTransformCodeFilterForEnv } = await import(
            '../start-compiler/config'
          )
          const { matchesCodeFilters } = await import(
            '../start-compiler/host'
          )
          const env = 'client' as const
          const filters = getTransformCodeFilterForEnv(env)
          if (matchesCodeFilters(next, filters)) {
            const kinds = detectKindsInCode(next, env)
            if (kinds.size > 0) {
              const result = await ctx.compilers.client.compile({
                code: next,
                id: absPath,
                detectedKinds: kinds,
              })
              if (result?.code) {
                next = result.code
              }
            }
          }
          return rewriteImportMetaHot(next)
        },
        rebuild: async (change) => {
          Object.keys(serverFnsById).forEach((k) => {
            delete serverFnsById[k]
          })

          const scope = rebuildScopeForChange(change.kind)
          if (shouldRegenerateRoutes(change.kind)) {
            await ctx.routerSession.generate()
          }

          // Client-only + ESM middleware: skip full Bun.build; SSE update is enough.
          if (scope === 'client') {
            return {
              scope,
              event: 'update' as const,
              modules: change.path
                ? [`/@fs${change.path.replace(/\\/g, '/')}`]
                : undefined,
              skipServerReload: true,
            }
          }

          if (scope === 'both') {
            await buildBunClient(ctx)
            await buildBunServer(ctx)
          } else if (scope === 'server') {
            await buildBunServer(ctx)
          }

          return {
            scope,
            event: hmrEventForScope(scope),
            modules: change.path
              ? [`/@fs${change.path.replace(/\\/g, '/')}`]
              : undefined,
          }
        },
        invalidate: (ids) => ctx.compilers.invalidate(ids),
      })
    },

    async serve(opts) {
      const root = opts?.root ?? process.cwd()
      const bunOpts = mergeBunCoreOptions(
        startPluginOpts.bun,
        corePluginOpts.bun,
      )
      const outDirs = resolveBunOutputDirectories({
        root,
        clientOutDir: bunOpts?.clientOutDir,
        serverOutDir: bunOpts?.serverOutDir,
      })
      return createBunProdServer({
        clientOutDir: outDirs.client,
        serverOutDir: outDirs.server,
        port: opts?.port ?? bunOpts?.port ?? 3000,
        hostname: opts?.hostname ?? bunOpts?.hostname ?? '0.0.0.0',
      })
    },
  }
}
