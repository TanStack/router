/**
 * Step 1 of `tanStackStartRsbuild`'s setup: the Rsbuild config of a Start
 * app (resolved base, output directories and router basepath, the
 * environments, `define`s, the dev server's SSR middleware).
 */
import { isAbsolute, resolve } from 'node:path'
import {
  applyResolvedBaseAndOutput,
  applyResolvedRouterBasepath,
} from '../config-context'
import { createServerFnBasePath, normalizePublicBase } from '../planning'
import {
  RSBUILD_ENVIRONMENT_NAMES,
  createRsbuildEnvironmentPlan,
  createRsbuildResolvedEntryAliases,
  resolveRsbuildOutputDirectory,
} from './planning'
import { createServerSetup } from './server-middleware'
import type { TanStackStartRsbuildPluginCoreOptions } from './types'
import type { RsbuildPluginAPI } from '@rsbuild/core'
import type { TanStackStartRsbuildInputConfig } from './schema'
import type { ScriptFormat } from '@tanstack/router-core'
import type { StartConfigContext } from '../config-context'

/** Resolves the Start config against the app's Rsbuild config and merges Start's environments and settings into it. */
export function modifyStartRsbuildConfig(
  api: RsbuildPluginAPI,
  opts: {
    configContext: StartConfigContext
    corePluginOpts: TanStackStartRsbuildPluginCoreOptions
    startPluginOpts: TanStackStartRsbuildInputConfig
    scriptFormat: ScriptFormat
    rscEnabled: boolean
  },
): void {
  const {
    configContext,
    corePluginOpts,
    startPluginOpts,
    scriptFormat,
    rscEnabled,
  } = opts
  const { getConfig, resolvedStartConfig } = configContext
  api.modifyRsbuildConfig((rsbuildConfig, { mergeRsbuildConfig }) => {
    // Rsbuild passes `root` on as written; its resolved root (against its
    // `cwd`) is `rootPath`. Canonical (no trailing separator), as the
    // virtual modules' paths must match Rspack's module paths.
    const root = resolve(
      typeof rsbuildConfig.root === 'string' && isAbsolute(rsbuildConfig.root)
        ? rsbuildConfig.root
        : api.context.rootPath,
    )

    const serverBase = rsbuildConfig.server?.base
    const assetPrefix = rsbuildConfig.output?.assetPrefix
    const publicBase = normalizePublicBase(
      typeof serverBase === 'string'
        ? serverBase
        : typeof assetPrefix === 'string' && assetPrefix !== 'auto'
          ? assetPrefix
          : undefined,
    )
    const rootDistPath = rsbuildConfig.output?.distPath
    const clientDistPath =
      rsbuildConfig.environments?.[RSBUILD_ENVIRONMENT_NAMES.client]?.output
        ?.distPath
    const serverDistPath =
      rsbuildConfig.environments?.[RSBUILD_ENVIRONMENT_NAMES.server]?.output
        ?.distPath

    applyResolvedBaseAndOutput({
      resolvedStartConfig,
      root,
      publicBase,
      clientOutputDirectory: resolveRsbuildOutputDirectory({
        distPath: clientDistPath,
        rootDistPath,
        fallback: 'dist/client',
        subdirectory: 'client',
      }),
      serverOutputDirectory: resolveRsbuildOutputDirectory({
        distPath: serverDistPath,
        rootDistPath,
        fallback: 'dist/server',
        subdirectory: 'server',
      }),
    })

    const { startConfig } = getConfig()
    const routerBasepath = applyResolvedRouterBasepath({
      resolvedStartConfig,
      startConfig,
    })

    const resolvedEntryPlan = configContext.resolveEntries()
    const isDev = api.context.action === 'dev'
    const isPreview = api.context.action === 'preview'

    const entryAliases = createRsbuildResolvedEntryAliases({
      entryPaths: resolvedEntryPlan.entryPaths,
    })

    const environmentPlan = createRsbuildEnvironmentPlan({
      root,
      entryAliases,
      clientOutputDirectory: resolvedStartConfig.outputDirectories.client,
      serverOutputDirectory: resolvedStartConfig.outputDirectories.server,
      publicBase: resolvedStartConfig.basePaths.publicBase,
      environmentOverrides: corePluginOpts.rsbuild?.environments,
      scriptFormat,
      rsc: rscEnabled,
      dev: isDev,
    })
    const serverFnBase = createServerFnBasePath({
      routerBasepath,
      serverFnBase: startConfig.serverFns.base,
    })
    const inlineCssEnabled =
      !isDev && startConfig.server.build.inlineCss.enabled

    return mergeRsbuildConfig(rsbuildConfig, {
      source: {
        ...(rscEnabled
          ? {
              include: [
                // RSC needs SWC to inspect package code in node_modules so directives such as "use client" can be discovered.
                // This follows Rsbuild's documented broad include form for compiling node_modules, with core-js excluded:
                // https://rsbuild.rs/config/source/include#compile-node_modules
                //
                // TODO: Once the Rspack rule matching needed here is ready, narrow this to React-aware packages, for example via
                // descriptionData: { "peerDependencies.react": /./ }, so unrelated dependencies are not sent through swc-loader.
                {
                  not: /[\\/]core-js[\\/]/,
                },
              ],
            }
          : {}),
        define: {
          'process.env.TSS_SERVER_FN_BASE': JSON.stringify(serverFnBase),
          'import.meta.env.TSS_SERVER_FN_BASE': JSON.stringify(serverFnBase),
          'process.env.TSS_ROUTER_BASEPATH': JSON.stringify(routerBasepath),
          'import.meta.env.TSS_ROUTER_BASEPATH': JSON.stringify(routerBasepath),
          // In dev, SPA mode answers the shell (as Vite's dev server);
          // a build leaves it to the prerendered shell (#8543)
          ...(isDev
            ? {
                'process.env.TSS_SHELL': JSON.stringify(
                  startConfig.spa?.enabled ? 'true' : 'false',
                ),
                'import.meta.env.TSS_SHELL': JSON.stringify(
                  startConfig.spa?.enabled ? 'true' : 'false',
                ),
              }
            : {}),
          'process.env.TSS_DEV_SERVER': JSON.stringify(
            isDev ? 'true' : 'false',
          ),
          'import.meta.env.TSS_DEV_SERVER': JSON.stringify(
            isDev ? 'true' : 'false',
          ),
          // Rsbuild dev already injects emitted CSS asset hrefs, so keep
          // Start's synthetic `/@tanstack-start/styles.css` path disabled.
          'process.env.TSS_DEV_SSR_STYLES_ENABLED': JSON.stringify('false'),
          'import.meta.env.TSS_DEV_SSR_STYLES_ENABLED': JSON.stringify('false'),
          'process.env.TSS_DEV_SSR_STYLES_BASEPATH': JSON.stringify(
            resolvedStartConfig.basePaths.publicBase,
          ),
          'import.meta.env.TSS_DEV_SSR_STYLES_BASEPATH': JSON.stringify(
            resolvedStartConfig.basePaths.publicBase,
          ),
          'process.env.TSS_INLINE_CSS_ENABLED': JSON.stringify(
            inlineCssEnabled ? 'true' : 'false',
          ),
          'import.meta.env.TSS_INLINE_CSS_ENABLED': JSON.stringify(
            inlineCssEnabled ? 'true' : 'false',
          ),
          'process.env.TSS_DISABLE_CSRF_MIDDLEWARE_WARNING': JSON.stringify(
            startConfig.serverFns.disableCsrfMiddlewareWarning
              ? 'true'
              : 'false',
          ),
          'import.meta.env.TSS_DISABLE_CSRF_MIDDLEWARE_WARNING': JSON.stringify(
            startConfig.serverFns.disableCsrfMiddlewareWarning
              ? 'true'
              : 'false',
          ),
        },
      },
      server: {
        ...(rsbuildConfig.server?.printUrls === undefined ||
        rsbuildConfig.server.printUrls === true
          ? { printUrls: ({ urls }: { urls: Array<string> }) => urls }
          : {}),
        // Off unless the app turns it on (#8544): compressed SSR streams
        // reach the browser only when they end (the SSR middleware's
        // srvx response does not flush the compression middleware), and
        // @rsbuild/core < 2.0.5 corrupted the SSR response headers.
        // `rsbuildConfig` already holds Rsbuild's default (`true`), so
        // read the app's own config.
        ...(api.getRsbuildConfig('original').server?.compress === undefined
          ? { compress: false }
          : {}),
        // SSR apps render every route on the server — disable HTML
        // fallback so rsbuild doesn't intercept /_serverFn/ URLs.
        htmlFallback: false,
        // server.setup returned callback runs after built-in middleware
        // but BEFORE fallback middleware — the ideal slot for SSR.
        // Preview always installs the middleware since it is the only SSR
        // handler; dev can opt out when a custom server hosts SSR.
        ...(isPreview ||
        (isDev && startPluginOpts.rsbuild?.installDevServerMiddleware !== false)
          ? {
              setup: createServerSetup({
                serverFnBasePath: serverFnBase,
                serverOutputDirectory:
                  resolvedStartConfig.outputDirectories.server,
                publicBase: resolvedStartConfig.basePaths.publicBase,
              }),
            }
          : {}),
      },
      ...(isDev
        ? {
            dev: {
              lazyCompilation: false,
              ...(rscEnabled ? { liveReload: false } : {}),
            },
          }
        : {}),
      environments: environmentPlan.environments,
      resolve: {
        alias: environmentPlan.alias,
      },
    })
  })
}
