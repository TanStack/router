/**
 * The RSC steps of `tanStackStartRsbuild`'s setup: Rspack's layer rules and
 * native RSC plugins (step 7), and the RSC build's manifest placeholder
 * replacement in the server assets (step 8b).
 */
import { rebuildModules } from '@tanstack/router-utils/compiler'
import { CLIENT_REFERENCED_IDS_PLACEHOLDER } from '../server-fns/resolver'
import {
  RSBUILD_ENVIRONMENT_NAMES,
  RSBUILD_RSC_LAYERS,
  RSBUILD_RSC_LAYER_RESOLVE,
} from './planning'
import { START_MANIFEST_PLACEHOLDER } from './virtual-modules'
import { tapServerFnResolverRebuild } from './server-fn-resolver-rebuild'
import { enableSwcReactServerComponents } from './swc-rsc'
import type { registerClientBuildCapture } from './normalized-client-build'
import type { registerStartCompiler } from './start-compiler'
import type {
  ModifyRspackConfigFn,
  RsbuildDevServer,
  RsbuildPluginAPI,
  Rspack,
  rspack as rspackNamespaceType,
} from '@rsbuild/core'
import type { VirtualModuleState } from './virtual-modules'
import type { StartConfigContext } from '../config-context'

type RspackNamespace = typeof rspackNamespaceType
type RscPluginPair = ReturnType<
  NonNullable<RspackNamespace['experiments']['rsc']>['createPlugins']
>
type RspackConfig = Parameters<ModifyRspackConfigFn>[0]
type RspackCompiler = Rspack.Compiler
type RspackCompilationExtended = Rspack.Compilation
type RspackAsset = ReturnType<RspackCompilationExtended['getAssets']>[number]

/** What the RSC steps keep for the plugin's life: the native plugin pair (created once) and the dev server. */
export interface RscState {
  // RSC plugin instances — created lazily when rspack namespace is available
  plugins: RscPluginPair | undefined
  // Reference to the dev server for RSC HMR socket writes
  devServer: Pick<RsbuildDevServer, 'sockWrite'> | null
}

/** Step 7 (RSC): the layer rules and the native RSC plugins of each environment, and the dev server for RSC HMR. */
export function registerRsc(
  api: RsbuildPluginAPI,
  state: RscState,
  opts: {
    resolvedStartConfig: StartConfigContext['resolvedStartConfig']
    virtualModuleState: VirtualModuleState
    getClientBuild: ReturnType<
      typeof registerClientBuildCapture
    >['getClientBuild']
  },
): void {
  const { resolvedStartConfig, virtualModuleState, getClientBuild } = opts
  // ---------------------------------------------------------------
  // 7. RSC: rspack layer rules + native RSC plugins
  //    When RSC is enabled, we add:
  //    - issuerLayer rule for react-server condition propagation
  //    - SWC reactServerComponents: true
  //    - rspack ServerPlugin (server env) / ClientPlugin (client env)
  //    The Coordinator inside createPlugins() handles compilation
  //    ordering (server→client→server-actions) automatically.
  // ---------------------------------------------------------------
  api.modifyRspackConfig((config, utils) => {
    const envName = utils.environment.name
    const isServerEnv = envName === RSBUILD_ENVIRONMENT_NAMES.server
    const isClientEnv = envName === RSBUILD_ENVIRONMENT_NAMES.client

    // Create RSC plugin pair lazily (once per build)
    if (!state.plugins) {
      state.plugins = utils.rspack.experiments.rsc.createPlugins()
    }

    if (isServerEnv) {
      // --- issuerLayer rule: modules imported from RSC layer
      // get react-server resolve condition ---
      const moduleRules = (config.module.rules ??= [])
      const root = resolvedStartConfig.root || process.cwd()

      // Split server-fn provider modules are the actual RSC execution
      // boundary in Start's layered model. They must compile in the
      // RSC layer so React and react-server-dom-rspack resolve their
      // react-server exports without forcing the whole SSR graph into
      // react-server conditions.
      moduleRules.push({
        resourceQuery: /(?:^|[?&])tss-serverfn-split(?:&|$)/,
        layer: RSBUILD_RSC_LAYERS.rsc,
        resolve: RSBUILD_RSC_LAYER_RESOLVE,
      })

      // All modules imported from the RSC layer inherit
      // the react-server condition (transitive propagation), except
      // route split virtual modules. Those remain ordinary SSR/client
      // route code, split and shared alike: no provider module imports
      // them (and the layer's route modules are never split: the router
      // planner does not run there), so the compiler resolves every module
      // of the layer with these options.
      moduleRules.push({
        issuerLayer: RSBUILD_RSC_LAYERS.rsc,
        resourceQuery: {
          not: [/(?:^|[?&])tsr-split(?:=|&|$)/],
        },
        resolve: RSBUILD_RSC_LAYER_RESOLVE,
      })

      // The RSC ServerPlugin injects imports like
      // `react-server-dom-rspack/server` into transformed modules.
      // Some modules in the server graph resolve from real package paths
      // outside the app root, so relying on the default relative
      // `node_modules` lookup is not enough. Seed resolve.modules with the
      // app root explicitly, without package-manager-specific heuristics.
      seedResolveModules(config, [`${root}/node_modules`, 'node_modules'])

      // Add ServerPlugin with HMR callback
      config.plugins.push(
        new state.plugins.ServerPlugin({
          cssLink: {
            precedence: false,
            props: {
              'data-rsc-css-href': '',
            },
          },
          onServerComponentChanges: () => {
            // Send rsc:update to connected clients for HMR
            state.devServer?.sockWrite('custom', {
              event: 'rsc:update',
            })
          },
        }),
      )

      config.plugins.push({
        apply(compiler: RspackCompiler) {
          tapServerFnResolverRebuild(compiler, {
            name: 'TanStackStartRscServerFnResolverRebuild',
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

      config.plugins.push({
        apply(compiler: RspackCompiler) {
          // The dev manifest write count this compiler last rebuilt from
          let rebuiltAtWriteCount: number | undefined

          compiler.hooks.finishMake.tapPromise(
            {
              name: 'TanStackStartRscManifestRebuild',
              // The native RSC ServerPlugin completes the client-entry
              // handoff during its finishMake hook. Rebuild the manifest
              // after that point so it reflects the client build: the
              // build transform emits the final source instead of the
              // placeholder, and dev picks up a manifest written while
              // this compilation was already running (the client and
              // server compile concurrently).
              stage: 10,
            },
            async (compilation: RspackCompilationExtended) => {
              const clientBuild = getClientBuild()

              if (!clientBuild) {
                return
              }

              virtualModuleState.updateManifest(clientBuild)

              if (api.context.action === 'dev') {
                // only when the manifest changed: rebuilding an
                // unchanged module can rebuild the whole chunk graph
                const writeCount = virtualModuleState.getDevManifestWriteCount()
                if (writeCount === rebuiltAtWriteCount) {
                  return
                }
                rebuiltAtWriteCount = writeCount
              }

              await rebuildModules(
                compilation,
                new Set([virtualModuleState.manifestPath]),
                (r) => r,
              )
            },
          )
        },
      })
    }

    if (isClientEnv) {
      // Add ClientPlugin — the Coordinator links it to the
      // ServerPlugin's compilation state
      config.plugins.push(new state.plugins.ClientPlugin())
    }

    // --- SWC reactServerComponents ---
    // Enable RSC directive detection where the native RSC plugins need it.
    // In the server build, scope it to the actual RSC provider subtree so
    // ordinary route-split modules (e.g. ?tsr-split=component) stay out of
    // RSC validation unless they are really imported by a provider module.
    if (isServerEnv) {
      enableSwcReactServerComponents(config, 'rsc-subtree')
    } else if (isClientEnv) {
      enableSwcReactServerComponents(config, 'all')
    }
  })

  // Capture dev server reference for RSC HMR socket writes
  if (api.context.action === 'dev') {
    api.onBeforeStartDevServer(({ server }) => {
      state.devServer = server
    })
  }
}

/** Step 8b (RSC build): the server assets' manifest and client-referenced ids placeholders, once the client build is known. */
export function registerRscManifestReplacement(
  api: RsbuildPluginAPI,
  opts: {
    compiler: ReturnType<typeof registerStartCompiler>
    virtualModuleState: VirtualModuleState
    getClientBuild: ReturnType<
      typeof registerClientBuildCapture
    >['getClientBuild']
  },
): void {
  const { compiler, virtualModuleState, getClientBuild } = opts
  // ---------------------------------------------------------------
  // 8b. Manifest asset replacement fallback (RSC build only)
  //     Rsbuild's native RSC coordinator interleaves server and client
  //     compilers, so the server manifest module can compile before Start's
  //     normalized client build stats exist. Keep final replacement in the
  //     server asset pipeline, after the client processAssets capture has a
  //     chance to run.
  // ---------------------------------------------------------------
  const manifestPlaceholderLiteral = JSON.stringify(START_MANIFEST_PLACEHOLDER)
  const clientIdsPlaceholderLiteral = JSON.stringify(
    CLIENT_REFERENCED_IDS_PLACEHOLDER,
  )
  const clientReferencedIdsLiteral = () =>
    compiler.session()?.clientReferencedIdsLiteral() ?? '[]'
  api.modifyRspackConfig((config, utils) => {
    if (utils.environment.name !== RSBUILD_ENVIRONMENT_NAMES.server) return

    config.plugins.push({
      apply(compiler: RspackCompiler) {
        compiler.hooks.compilation.tap(
          'TanStackStartManifestReplace',
          (compilation: RspackCompilationExtended) => {
            compilation.hooks.processAssets.tap(
              {
                name: 'TanStackStartManifestReplace',
                stage:
                  utils.rspack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE,
              },
              () => {
                let assetsWithPlaceholder:
                  | Array<{ asset: RspackAsset; sourceStr: string }>
                  | undefined

                for (const asset of compilation.getAssets()) {
                  if (!asset.name.endsWith('.js')) {
                    continue
                  }

                  const sourceStr = String(asset.source.source())
                  if (
                    !sourceStr.includes(manifestPlaceholderLiteral) &&
                    !sourceStr.includes(clientIdsPlaceholderLiteral)
                  ) {
                    continue
                  }

                  if (!assetsWithPlaceholder) {
                    assetsWithPlaceholder = []
                  }
                  assetsWithPlaceholder.push({
                    asset,
                    sourceStr,
                  })
                }

                if (!assetsWithPlaceholder) {
                  return
                }

                const clientBuild = getClientBuild()
                if (!clientBuild) {
                  throw new Error(
                    'TanStack Start could not replace the rsbuild RSC server manifest placeholder because the client build was unavailable',
                  )
                }

                const manifestValueLiteral =
                  virtualModuleState.generateManifestValueLiteral(clientBuild)
                // the server fn resolver's client-origin gate (J4.2): the
                // client compiled, so its references are known
                const clientIdsLiteral = clientReferencedIdsLiteral()

                for (const { asset, sourceStr } of assetsWithPlaceholder) {
                  compilation.updateAsset(
                    asset.name,
                    new utils.rspack.sources.RawSource(
                      sourceStr
                        .replace(
                          manifestPlaceholderLiteral,
                          manifestValueLiteral,
                        )
                        .replaceAll(
                          clientIdsPlaceholderLiteral,
                          clientIdsLiteral,
                        ),
                    ),
                  )
                }
              },
            )
          },
        )
      },
    })
  })
}

function seedResolveModules(
  config: RspackConfig,
  entries: Array<string>,
): void {
  const resolveModules = (config.resolve.modules ??= [])

  for (const entry of entries) {
    if (!resolveModules.includes(entry)) {
      resolveModules.push(entry)
    }
  }
}
