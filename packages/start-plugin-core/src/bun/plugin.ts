import { mkdir, writeFile } from 'node:fs/promises'
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
  BUN_ENVIRONMENT_NAMES,
  createBunDefine,
  createBunResolvedEntryAliases,
  resolveBunOutputDirectories,
} from './planning'
import { createBunVirtualModuleStore, VIRTUAL_MODULES } from './virtual-modules'
import { createBunCompilerHosts } from './start-compiler-host'
import { createBunImportProtectionPlugin } from './import-protection'
import { createBunRouterSession } from './start-router-plugin'
import { createBunAliasAndVirtualPlugin } from './bun-plugins'
import { createCssAssetsPlugin } from './css-assets-plugin'
import {
  enrichBunClientBuildFromSourcemaps,
  normalizeBunClientBuild,
  toClientRelativeFileName,
} from './normalized-client-build'
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
import {
  createBunProdServer,
  generateHostEntrySource,
} from './static-host'
import type { ServerFn } from '../start-compiler/types'
import type { TanStackStartBunPluginCoreOptions } from './types'
import type { TanStackStartBunInputConfig } from './schema'
import type { TanStackStartBunAdapter } from './types'

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
    const publicBase = normalizePublicBase(
      startPluginOpts.bun?.publicBase ??
        corePluginOpts.bun?.publicBase ??
        '/',
    )
    const outDirs = resolveBunOutputDirectories({
      root,
      clientOutDir:
        startPluginOpts.bun?.clientOutDir ?? corePluginOpts.bun?.clientOutDir,
      serverOutDir:
        startPluginOpts.bun?.serverOutDir ?? corePluginOpts.bun?.serverOutDir,
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

    const define = createBunDefine({
      serverFnBase,
      routerBasepath,
      publicBase: resolvedStartConfig.basePaths.publicBase,
      isDev: mode === 'dev',
      inlineCssEnabled,
    })

    const serverFnsById: Record<string, ServerFn> = {}
    const virtualModules = createBunVirtualModuleStore()

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
      preprocessCode: (code, id, env) =>
        routerSession.getCodeSplitterRuntime(env).transformReference(code, id),
    })

    return {
      startConfig,
      resolvedStartConfig,
      entryAliases,
      define,
      serverFnsById,
      virtualModules,
      compilers,
      routerSession,
      outDirs,
      publicBase: resolvedStartConfig.basePaths.publicBase,
      refreshResolver,
      setPluginAdapters,
    }
  }

  async function buildClient(ctx: Awaited<ReturnType<typeof prepare>>) {
    await mkdir(ctx.outDirs.client, { recursive: true })
    ctx.setPluginAdapters('client')

    const bunOpts = startPluginOpts.bun ?? corePluginOpts.bun
    const cssPlugin = createCssAssetsPlugin({
      root: ctx.resolvedStartConfig.root,
      clientOutDir: ctx.outDirs.client,
      publicBase: ctx.publicBase,
      css: bunOpts?.css,
      srcDirectory: ctx.resolvedStartConfig.srcDirectory,
    })
    const extraPlugins = [
      ...(bunOpts?.plugins ?? []),
      ...(bunOpts?.clientPlugins ?? []),
    ]

    const result = await Bun.build({
      entrypoints: [ctx.entryAliases.client],
      outdir: ctx.outDirs.client,
      target: 'browser',
      format: 'esm',
      packages: 'bundle',
      splitting: true,
      sourcemap: 'linked',
      minify: false,
      naming: {
        entry: 'assets/[name]-[hash].js',
        chunk: 'assets/[name]-[hash].js',
        asset: 'assets/[name]-[hash].[ext]',
      },
      define: ctx.define,
      plugins: [
        ...extraPlugins,
        cssPlugin,
        createBunAliasAndVirtualPlugin({
          aliases: ctx.entryAliases.alias,
          virtualModules: ctx.virtualModules,
        }),
        ctx.routerSession.createCodeSplitterPlugin('client'),
        ctx.compilers.createTransformPlugin('client'),
        createBunImportProtectionPlugin({
          envName: BUN_ENVIRONMENT_NAMES.client,
          envType: 'client',
          root: ctx.resolvedStartConfig.root,
          srcDirectory: ctx.resolvedStartConfig.srcDirectory,
          importProtection: ctx.startConfig.importProtection,
        }),
      ],
    })

    if (!result.success) {
      const message = result.logs.map(String).join('\n')
      throw new Error(`[tanstack-start-bun] Client build failed:\n${message}`)
    }

    const outputs = result.outputs.map((o) => ({
      path: o.path,
      fileName: toClientRelativeFileName(o.path, ctx.outDirs.client),
      kind: o.kind,
      sourcemapPath: `${o.path}.map`,
    }))

    let clientBuild = normalizeBunClientBuild({
      outputs,
      clientOutDir: ctx.outDirs.client,
    })
    clientBuild = await enrichBunClientBuildFromSourcemaps({
      clientBuild,
      outputs,
    })

    ctx.virtualModules.updateManifest({
      clientBuild,
      publicBase: ctx.publicBase,
      scriptFormat: 'module',
      inlineCss: {
        enabled: ctx.startConfig.server.build.inlineCss.enabled,
        transformAssets: ctx.startConfig.server.build.inlineCss.transformAssets,
      },
    })
    ctx.refreshResolver()

    return { result, clientBuild }
  }

  async function buildServer(ctx: Awaited<ReturnType<typeof prepare>>) {
    await mkdir(ctx.outDirs.server, { recursive: true })
    ctx.setPluginAdapters('server')

    const bunOpts = startPluginOpts.bun ?? corePluginOpts.bun
    const cssPlugin = createCssAssetsPlugin({
      root: ctx.resolvedStartConfig.root,
      clientOutDir: ctx.outDirs.client,
      publicBase: ctx.publicBase,
      css: bunOpts?.css,
      srcDirectory: ctx.resolvedStartConfig.srcDirectory,
    })
    const extraPlugins = [
      ...(bunOpts?.plugins ?? []),
      ...(bunOpts?.serverPlugins ?? []),
    ]

    const result = await Bun.build({
      entrypoints: [ctx.entryAliases.server],
      outdir: ctx.outDirs.server,
      target: 'bun',
      format: 'esm',
      // Bundle deps so #tanstack-* aliases inside start-server-core resolve
      // at build time via createBunAliasAndVirtualPlugin.
      packages: 'bundle',
      splitting: false,
      sourcemap: 'linked',
      naming: {
        entry: 'server.js',
      },
      define: ctx.define,
      plugins: [
        ...extraPlugins,
        cssPlugin,
        createBunAliasAndVirtualPlugin({
          aliases: ctx.entryAliases.alias,
          virtualModules: ctx.virtualModules,
        }),
        ctx.routerSession.createCodeSplitterPlugin('server'),
        ctx.compilers.createTransformPlugin('server'),
        createBunImportProtectionPlugin({
          envName: BUN_ENVIRONMENT_NAMES.server,
          envType: 'server',
          root: ctx.resolvedStartConfig.root,
          srcDirectory: ctx.resolvedStartConfig.srcDirectory,
          importProtection: ctx.startConfig.importProtection,
        }),
      ],
    })

    if (!result.success) {
      const message = result.logs.map(String).join('\n')
      throw new Error(`[tanstack-start-bun] Server build failed:\n${message}`)
    }

    return result
  }

  return {
    async build(opts) {
      const root = opts?.root ?? process.cwd()
      const ctx = await prepare(root, 'build')
      await buildClient(ctx)
      await buildServer(ctx)
      await writeFile(
        join(ctx.outDirs.server, 'host.js'),
        generateHostEntrySource(),
        'utf8',
      )

      const nitroOpt =
        startPluginOpts.bun?.nitro ?? corePluginOpts.bun?.nitro
      let clientOutDirForPostBuild = ctx.outDirs.client

      // Nitro after dual Bun.build; prerender after Nitro so public dir is final.
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

      const standaloneOpt =
        startPluginOpts.bun?.standalone ?? corePluginOpts.bun?.standalone
      // Always embed dist/client (not Nitro .output/public).
      if (standaloneOpt) {
        const result = await runBunStandaloneCompile({
          root,
          clientOutDir: ctx.outDirs.client,
          serverOutDir: ctx.outDirs.server,
          standalone: standaloneOpt,
        })
        console.info(
          `[tanstack-start-bun] standalone executable → ${result.outfile}`,
        )
      }
    },

    async dev(opts) {
      const root = opts?.root ?? process.cwd()
      const ctx = await prepare(root, 'dev')

      // Initial builds so SSR has a server entry and client assets (fallback)
      await buildClient(ctx)
      await buildServer(ctx)

      return createBunDevServer({
        root,
        port: opts?.port ?? startPluginOpts.bun?.port ?? 3000,
        hostname:
          opts?.hostname ?? startPluginOpts.bun?.hostname ?? '0.0.0.0',
        clientOutDir: ctx.outDirs.client,
        serverOutDir: ctx.outDirs.server,
        publicBase: ctx.publicBase,
        framework: corePluginOpts.framework,
        clientEntryPath: ctx.entryAliases.client,
        esmDev: true,
        transformAppModule: async (code, absPath) => {
          let next = ctx.routerSession
            .getCodeSplitterRuntime('client')
            .transformReference(code, absPath)
          // StartCompiler transform for serverFn discovery on the fly
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
          Object.keys(ctx.serverFnsById).forEach((k) => {
            delete ctx.serverFnsById[k]
          })

          const scope = rebuildScopeForChange(change.kind)
          if (shouldRegenerateRoutes(change.kind)) {
            await ctx.routerSession.generate()
          }

          if (scope === 'client' || scope === 'both') {
            await buildClient(ctx)
          }
          if (scope === 'server' || scope === 'both') {
            await buildServer(ctx)
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
      const outDirs = resolveBunOutputDirectories({
        root,
        clientOutDir:
          startPluginOpts.bun?.clientOutDir ?? corePluginOpts.bun?.clientOutDir,
        serverOutDir:
          startPluginOpts.bun?.serverOutDir ?? corePluginOpts.bun?.serverOutDir,
      })
      return createBunProdServer({
        clientOutDir: outDirs.client,
        serverOutDir: outDirs.server,
        port: opts?.port ?? startPluginOpts.bun?.port ?? 3000,
        hostname:
          opts?.hostname ?? startPluginOpts.bun?.hostname ?? '0.0.0.0',
      })
    },
  }
}
