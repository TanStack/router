import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { joinURL } from 'ufo'
import { rebuildModules } from '@tanstack/router-utils/compiler'
import { createStartConfigContext } from '../config-context'
import { normalizePath } from '../utils'
import { addWorkspaceWatchIgnored } from './watch-ignored'
import { parseStartConfig, rsbuildClientOutputSchema } from './schema'
import {
  RSBUILD_CLIENT_ASSETS_DIR,
  RSBUILD_ENVIRONMENT_NAMES,
} from './planning'
import { registerStartCompiler } from './start-compiler'
import { registerVirtualModules } from './virtual-modules'
import { registerClientBuildCapture } from './normalized-client-build'
import { tapServerFnResolverRebuild } from './server-fn-resolver-rebuild'
import { postBuildWithRsbuild } from './post-build'
import { modifyStartRsbuildConfig } from './rsbuild-config'
import { registerRsc, registerRscManifestReplacement } from './rsc'
import type { TanStackStartRsbuildPluginCoreOptions } from './types'
import type { RsbuildPlugin, RsbuildPluginAPI, Rspack } from '@rsbuild/core'
import type { TanStackStartRsbuildInputConfig } from './schema'
import type { ScriptFormat } from '@tanstack/router-core'
import type { RscState } from './rsc'

// Detect whether this plugin source is running from inside the TanStack
// Router monorepo (packages/start-plugin-core/src/rsbuild/plugin.ts). When
// installed from npm in a user app, the path structure is different and
// this evaluates to false. Used to gate dev-only workarounds that only
// matter when workspace package dists are symlinked into node_modules.
const currentDir = dirname(fileURLToPath(import.meta.url))
const isInsideRouterMonoRepo = (() => {
  // src layout: <repo>/packages/start-plugin-core/src/rsbuild → 4 levels up
  // dist layout (CJS/ESM): <repo>/packages/start-plugin-core/dist/<fmt>/rsbuild
  //   → also 4 levels up
  const candidate = resolve(currentDir, '../../../../')
  return candidate.endsWith('/packages') || candidate.endsWith('\\packages')
})()

type RspackCompiler = Rspack.Compiler

export function tanStackStartRsbuild(
  corePluginOpts: TanStackStartRsbuildPluginCoreOptions,
  startPluginOpts: TanStackStartRsbuildInputConfig = {},
): RsbuildPlugin {
  const rscOpts = corePluginOpts.rsc
  const rscEnabled = Boolean(rscOpts)

  const configContext = createStartConfigContext({
    corePluginOpts,
    startPluginOpts,
    parseConfig: parseStartConfig,
  })
  const { getConfig, resolvedStartConfig } = configContext
  const scriptFormat = rsbuildClientOutputSchema.parse(
    startPluginOpts.rsbuild?.client?.output ?? 'module',
  ) satisfies ScriptFormat

  const rscState: RscState = { plugins: undefined, devServer: null }

  let updateServerFnResolver: (() => void) | undefined

  return {
    name: 'tanstack-start-rsbuild',
    setup(api: RsbuildPluginAPI) {
      const startCompilerEnvironments = [
        { name: RSBUILD_ENVIRONMENT_NAMES.client, type: 'client' as const },
        { name: RSBUILD_ENVIRONMENT_NAMES.server, type: 'server' as const },
      ]

      // ---------------------------------------------------------------
      // 1. modifyRsbuildConfig — resolve config, set up environments
      //    (`rsbuild-config.ts`)
      // ---------------------------------------------------------------
      modifyStartRsbuildConfig(api, {
        configContext,
        corePluginOpts,
        startPluginOpts,
        scriptFormat,
        rscEnabled,
      })

      /** The app's entries (import protection: a marked entry is its own violation), lazily: resolved after the config. */
      let entries: Set<string> | null = null
      const entryPaths = (): Set<string> => {
        if (!entries) {
          const { resolvedStartConfig: resolved } = getConfig()
          const { entryPaths: paths } = configContext.resolveEntries()
          entries = new Set(
            [
              resolved.routerFilePath,
              resolved.startFilePath,
              paths.client,
              paths.server,
              paths.router,
              paths.start,
            ]
              .filter((p): p is string => typeof p === 'string')
              .map((p) => normalizePath(p)),
          )
        }
        return entries
      }

      // ---------------------------------------------------------------
      // 2. The compiler: one compile per (environment, layer, module) of
      //    every planner (server fns, env separation, Hydrate, RSC CSS,
      //    route splitting and HMR, import protection), the route
      //    generator, the client route tree
      // ---------------------------------------------------------------
      const compiler = registerStartCompiler(api, {
        getConfig,
        corePluginOpts,
        startPluginOpts,
        environments: startCompilerEnvironments,
        writeVirtualModule: (envName, file, content) =>
          virtualModuleState.writeModule(envName, file, content),
        onServerFnsChange: () => {
          updateServerFnResolver?.()
        },
        isEntry: (file) => entryPaths().has(normalizePath(file)),
      })

      // ---------------------------------------------------------------
      // 3. Virtual modules — manifest, server fn resolver, adapters,
      //    RSC runtime, RSC HMR
      // ---------------------------------------------------------------
      const virtualModuleState = registerVirtualModules(api, {
        getRoot: () => resolvedStartConfig.root,
        getConfig,
        resolverModule: () => compiler.resolverModule(),
        serializationAdapters: corePluginOpts.serializationAdapters,
        getDevClientEntryUrl: (publicBase: string) =>
          joinURL(publicBase, RSBUILD_CLIENT_ASSETS_DIR, 'js/index.js'),
        rscEnabled,
        scriptFormat,
      })
      updateServerFnResolver = virtualModuleState.updateServerFnResolver

      if (!rscEnabled) {
        api.modifyRspackConfig((config, utils) => {
          if (utils.environment.name !== RSBUILD_ENVIRONMENT_NAMES.server) {
            return
          }

          config.plugins.push({
            apply(compiler: RspackCompiler) {
              tapServerFnResolverRebuild(compiler, {
                name: 'TanStackStartServerFnResolverRebuild',
                updateResolver: () => {
                  virtualModuleState.updateServerFnResolver()
                },
                getResolverWriteCount: () =>
                  virtualModuleState.getServerFnResolverWriteCount(),
                rebuildResolver: (compilation) =>
                  rebuildModules(
                    compilation,
                    new Set([virtualModuleState.serverFnResolverPath]),
                    (r) => r,
                  ),
              })
            },
          })
        })
      }

      // ---------------------------------------------------------------
      // 4. Client build stats capture via processAssets
      // ---------------------------------------------------------------
      const { getClientBuild } = registerClientBuildCapture(api, getConfig)

      // ---------------------------------------------------------------
      // 4b. Server manifest module generation (build only)
      //     For ordinary multi-environment builds, Rsbuild can compile the
      //     server environment after the client environment finishes. Generate
      //     the final manifest as module source in that phase instead of
      //     patching emitted server assets afterwards.
      // ---------------------------------------------------------------
      if (api.context.action !== 'dev') {
        // (read when a module is transformed: the virtual paths need the resolved root)
        const matchesManifestPath = (id: string) =>
          normalizePath(id) === normalizePath(virtualModuleState.manifestPath)

        api.transform(
          {
            test: (id: string) => matchesManifestPath(id),
            environments: [RSBUILD_ENVIRONMENT_NAMES.server],
          },
          ({ code }) => {
            const clientBuild = getClientBuild()

            if (clientBuild) {
              return virtualModuleState.generateManifestContent(clientBuild)
            }

            if (!rscEnabled) {
              throw new Error(
                'TanStack Start could not generate the rsbuild server manifest before the client build completed',
              )
            }

            // RSC builds cannot express the required client -> server ordering
            // through MultiCompiler dependencies, so keep the placeholder for
            // the RSC-only asset-patching fallback below.
            return code
          },
        )
      }

      // ---------------------------------------------------------------
      // 6. Dev SSR middleware — registered via server.setup in
      //    modifyRsbuildConfig above (returned callback runs after
      //    built-ins but before fallback middleware)
      // ---------------------------------------------------------------

      // ---------------------------------------------------------------
      // 6b. Dev watcher: ignore workspace package `dist/**` directories.
      //
      //     In a real user app, `@tanstack/react-router` and friends live
      //     inside `node_modules/` and are ignored by Rspack's default
      //     watcher. In this monorepo, pnpm symlinks them to
      //     `packages/*/dist` (realpath outside node_modules), so the
      //     watcher follows them and treats their dist files as live
      //     sources. If anything rewrites those files during dev, Rspack
      //     sees transient half-written modules and fails to resolve
      //     relative imports between them.
      //
      //     Only apply this in monorepo development. In user apps this
      //     is a no-op — their `node_modules/@tanstack/*/dist/**` is
      //     already ignored by Rspack's default watchOptions.
      // ---------------------------------------------------------------
      if (isInsideRouterMonoRepo && api.context.action === 'dev') {
        api.modifyRspackConfig((config) => {
          const workspaceDistRealpaths = resolveWorkspacePackageDistRealpaths()
          if (workspaceDistRealpaths.length === 0) return

          config.watchOptions = {
            ...(config.watchOptions ?? {}),
            ignored: addWorkspaceWatchIgnored(
              config.watchOptions?.ignored,
              workspaceDistRealpaths,
            ),
          }
        })
      }

      // ---------------------------------------------------------------
      // 7. RSC: rspack layer rules + native RSC plugins (`rsc.ts`)
      // ---------------------------------------------------------------
      if (rscEnabled) {
        registerRsc(api, rscState, {
          resolvedStartConfig,
          virtualModuleState,
          getClientBuild,
        })
      }

      // ---------------------------------------------------------------
      // 8. Build ordering — client must complete before server starts
      //    so that the manifest virtual module has real client build stats.
      //    Uses rspack MultiCompiler.setDependencies() under the hood.
      //
      //    IMPORTANT: When RSC is enabled we must NOT set dependencies.
      //    The RSC Coordinator already orchestrates server↔client
      //    compilation ordering by interleaving phases within compiler
      //    hooks. Adding setDependencies(server, [client]) on top of
      //    the Coordinator creates a deadlock: MultiCompiler blocks
      //    the server compiler until client is `done`, but the
      //    Coordinator blocks the client's `make` hook until the
      //    server's entries phase completes — neither can start.
      // ---------------------------------------------------------------
      if (!rscEnabled) {
        api.onAfterCreateCompiler(({ compiler }) => {
          // MultiCompiler has a `compilers` array; single compiler does not
          if ('compilers' in compiler) {
            const serverCompiler = compiler.compilers.find(
              (c) => c.name === RSBUILD_ENVIRONMENT_NAMES.server,
            )
            if (serverCompiler) {
              compiler.setDependencies(serverCompiler, [
                RSBUILD_ENVIRONMENT_NAMES.client,
              ])
            }
          }
        })
      }

      // ---------------------------------------------------------------
      // 8b. Manifest asset replacement fallback (RSC build only, `rsc.ts`)
      // ---------------------------------------------------------------
      if (api.context.action !== 'dev' && rscEnabled) {
        registerRscManifestReplacement(api, {
          compiler,
          virtualModuleState,
          getClientBuild,
        })
      }

      // ---------------------------------------------------------------
      // 9. After client env compiles — refresh resolver + manifest
      // ---------------------------------------------------------------
      api.onAfterEnvironmentCompile(({ environment }) => {
        if (environment.name !== RSBUILD_ENVIRONMENT_NAMES.client) return

        virtualModuleState.updateServerFnResolver()

        const clientBuild = getClientBuild()
        if (clientBuild) {
          virtualModuleState.updateManifest(clientBuild)
        }
      })

      if (api.context.action === 'build') {
        api.onAfterBuild(async () => {
          const { startConfig } = getConfig()

          await postBuildWithRsbuild({
            startConfig,
            clientOutputDirectory: resolvedStartConfig.outputDirectories.client,
            serverOutputDirectory: resolvedStartConfig.outputDirectories.server,
          })
        })
      }
    },
  }
}

/**
 * Return the realpath of every packages/<name>/dist directory in the
 * TanStack Router monorepo. Only meaningful when called from inside the
 * monorepo — in user apps, callers should guard with
 * `isInsideRouterMonoRepo` before invoking this.
 */
function resolveWorkspacePackageDistRealpaths(): Array<string> {
  // currentDir points at either <repo>/packages/start-plugin-core/src/rsbuild
  // or <repo>/packages/start-plugin-core/dist/<fmt>/rsbuild. Four levels up
  // lands on <repo>/packages in both layouts.
  const packagesDir = resolve(currentDir, '../../../../')
  if (!existsSync(packagesDir)) return []

  let entries: Array<string>
  try {
    entries = readdirSync(packagesDir)
  } catch {
    return []
  }

  const dists: Array<string> = []
  for (const entry of entries) {
    const distPath = join(packagesDir, entry, 'dist')
    try {
      if (!statSync(distPath).isDirectory()) continue
    } catch {
      continue
    }
    try {
      dists.push(realpathSync(distPath))
    } catch {
      dists.push(distPath)
    }
  }

  return dists
}
