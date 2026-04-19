import { joinURL } from 'ufo'
import {
  applyResolvedBaseAndOutput,
  applyResolvedRouterBasepath,
  createStartConfigContext,
} from '../config-context'
import { createServerFnBasePath, normalizePublicBase } from '../planning'
import { parseStartConfig } from './schema'
import {
  RSBUILD_ENVIRONMENT_NAMES,
  RSBUILD_RSC_LAYERS,
  createRsbuildEnvironmentPlan,
  createRsbuildResolvedEntryAliases,
  resolveRsbuildOutputDirectory,
} from './planning'
import { registerStartCompilerTransforms } from './start-compiler-host'
import { registerImportProtection } from './import-protection'
import {
  START_MANIFEST_PLACEHOLDER,
  registerVirtualModules,
} from './virtual-modules'
import { createServerSetup } from './dev-server'
import { registerClientBuildCapture } from './normalized-client-build'
import { registerRouterPlugins } from './start-router-plugin'
import { postBuildWithRsbuild } from './post-build'
import type { ServerFn } from '../start-compiler/types'
import type { TanStackStartRsbuildPluginCoreOptions } from './types'
import type {
  ModifyRspackConfigFn,
  RsbuildDevServer,
  RsbuildPlugin,
  RsbuildPluginAPI,
  Rspack,
  rspack as rspackNamespaceType,
} from '@rsbuild/core'
import type { TanStackStartRsbuildInputConfig } from './schema'

type RspackNamespace = typeof rspackNamespaceType
type RscPluginPair = ReturnType<
  NonNullable<RspackNamespace['experiments']['rsc']>['createPlugins']
>
type RspackConfig = Parameters<ModifyRspackConfigFn>[0]
type RspackCompiler = Rspack.Compiler
type RspackCompilationExtended = Rspack.Compilation
type RspackRule = Rspack.RuleSetRule

export function tanStackStartRsbuild(
  corePluginOpts: TanStackStartRsbuildPluginCoreOptions,
  startPluginOpts: TanStackStartRsbuildInputConfig | undefined,
): RsbuildPlugin {
  const normalizedStartPluginOpts = startPluginOpts ?? {}
  const rscOpts = corePluginOpts.rsc
  const rscEnabled = Boolean(rscOpts)

  const configContext = createStartConfigContext({
    corePluginOpts,
    startPluginOpts: normalizedStartPluginOpts,
    parseConfig: parseStartConfig,
  })
  const { getConfig, resolvedStartConfig } = configContext
  const serverFnProviderEnv = corePluginOpts.providerEnvironmentName
  const ssrIsProvider = corePluginOpts.ssrIsProvider

  // RSC plugin instances — created lazily when rspack namespace is available
  let rscPlugins: RscPluginPair | undefined

  // Reference to the dev server for RSC HMR socket writes
  let devServerRef: Pick<RsbuildDevServer, 'sockWrite'> | null = null
  const serverFnsById: Record<string, ServerFn> = {}
  let updateServerFnResolver: (() => void) | undefined

  return {
    name: 'tanstack-start-rsbuild',
    setup(api: RsbuildPluginAPI) {
      // ---------------------------------------------------------------
      // 1. modifyRsbuildConfig — resolve config, set up environments
      // ---------------------------------------------------------------
      api.modifyRsbuildConfig((rsbuildConfig, { mergeRsbuildConfig }) => {
        const root =
          typeof rsbuildConfig.root === 'string'
            ? rsbuildConfig.root
            : process.cwd()

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

        const entryAliases = createRsbuildResolvedEntryAliases({
          entryPaths: resolvedEntryPlan.entryPaths,
        })

        const environmentPlan = createRsbuildEnvironmentPlan({
          entryAliases,
          clientOutputDirectory: resolvedStartConfig.outputDirectories.client,
          serverOutputDirectory: resolvedStartConfig.outputDirectories.server,
          publicBase: resolvedStartConfig.basePaths.publicBase,
          serverFnProviderEnv,
          environmentOverrides: corePluginOpts.rsbuild?.environments,
          rsc: rscOpts,
          dev: isDev,
        })
        const serverFnBase = createServerFnBasePath({
          routerBasepath,
          serverFnBase: startConfig.serverFns.base,
        })

        return mergeRsbuildConfig(rsbuildConfig, {
          source: {
            define: {
              'process.env.TSS_SERVER_FN_BASE': JSON.stringify(serverFnBase),
              'import.meta.env.TSS_SERVER_FN_BASE':
                JSON.stringify(serverFnBase),
              'process.env.TSS_ROUTER_BASEPATH': JSON.stringify(routerBasepath),
              'import.meta.env.TSS_ROUTER_BASEPATH':
                JSON.stringify(routerBasepath),
              'process.env.TSS_DEV_SERVER': JSON.stringify(
                isDev ? 'true' : 'false',
              ),
              'import.meta.env.TSS_DEV_SERVER': JSON.stringify(
                isDev ? 'true' : 'false',
              ),
              // Rsbuild dev already injects emitted CSS asset hrefs, so keep
              // Start's synthetic `/@tanstack-start/styles.css` path disabled.
              'process.env.TSS_DEV_SSR_STYLES_ENABLED': JSON.stringify('false'),
              'import.meta.env.TSS_DEV_SSR_STYLES_ENABLED':
                JSON.stringify('false'),
              'process.env.TSS_DEV_SSR_STYLES_BASEPATH': JSON.stringify(
                resolvedStartConfig.basePaths.publicBase,
              ),
              'import.meta.env.TSS_DEV_SSR_STYLES_BASEPATH': JSON.stringify(
                resolvedStartConfig.basePaths.publicBase,
              ),
            },
          },
          server: {
            // SSR apps render every route on the server — disable HTML
            // fallback so rsbuild doesn't intercept /_serverFn/ URLs.
            htmlFallback: false,
            // server.setup returned callback runs after built-in middleware
            // but BEFORE fallback middleware — the ideal slot for SSR.
            ...(isDev
              ? {
                  setup: createServerSetup({
                    serverFnBasePath: serverFnBase,
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

      // ---------------------------------------------------------------
      // 2. StartCompiler transforms — server fns, isomorphic fns, etc.
      // ---------------------------------------------------------------
      registerStartCompilerTransforms(api, {
        framework: corePluginOpts.framework,
        // modifyRsbuildConfig copies rsbuildConfig.root into resolvedStartConfig.root,
        // so defer this read until transform time instead of falling back to
        // process.cwd() during plugin setup.
        root: () => resolvedStartConfig.root || process.cwd(),
        providerEnvName: serverFnProviderEnv,
        generateFunctionId:
          normalizedStartPluginOpts.serverFns?.generateFunctionId,
        serverFnsById,
        onServerFnsByIdChange: () => {
          updateServerFnResolver?.()
        },
      })

      registerImportProtection(api, {
        getConfig,
        framework: corePluginOpts.framework,
        environments: [
          { name: RSBUILD_ENVIRONMENT_NAMES.client, type: 'client' },
          { name: RSBUILD_ENVIRONMENT_NAMES.server, type: 'server' },
          ...(serverFnProviderEnv !== RSBUILD_ENVIRONMENT_NAMES.server &&
          !rscEnabled
            ? [{ name: serverFnProviderEnv, type: 'server' as const }]
            : []),
        ],
      })

      // ---------------------------------------------------------------
      // 3. Virtual modules — manifest, server fn resolver, adapters,
      //    RSC runtime, RSC HMR
      // ---------------------------------------------------------------
      const virtualModuleState = registerVirtualModules(api, {
        root: resolvedStartConfig.root || process.cwd(),
        getConfig,
        serverFnsById,
        providerEnvName: serverFnProviderEnv,
        ssrIsProvider,
        serializationAdapters: corePluginOpts.serializationAdapters,
        getDevClientEntryUrl: (publicBase: string) =>
          joinURL(publicBase, 'static/js/index.js'),
        rscEnabled,
      })
      updateServerFnResolver = virtualModuleState.updateServerFnResolver

      // ---------------------------------------------------------------
      // 4. Client build stats capture via processAssets
      // ---------------------------------------------------------------
      const { getClientBuild } = registerClientBuildCapture(api)

      // ---------------------------------------------------------------
      // 4b. Server manifest module generation (build only)
      //     For ordinary multi-environment builds, Rsbuild can compile the
      //     server environment after the client environment finishes. Generate
      //     the final manifest as module source in that phase instead of
      //     patching emitted server assets afterwards.
      // ---------------------------------------------------------------
      if (api.context.action !== 'dev') {
        const manifestPathPattern = new RegExp(
          `^${escapeRegExp(virtualModuleState.manifestPath)}$`,
        )

        api.transform(
          {
            test: manifestPathPattern,
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
      // 5. Router plugin wiring (generator + code splitter)
      // ---------------------------------------------------------------
      registerRouterPlugins(api, {
        getConfig,
        corePluginOpts,
        startPluginOpts: normalizedStartPluginOpts,
      })

      // ---------------------------------------------------------------
      // 6. Dev SSR middleware — registered via server.setup in
      //    modifyRsbuildConfig above (returned callback runs after
      //    built-ins but before fallback middleware)
      // ---------------------------------------------------------------

      // ---------------------------------------------------------------
      // 7. RSC: rspack layer rules + native RSC plugins
      //    When RSC is enabled, we add:
      //    - issuerLayer rule for react-server condition propagation
      //    - SWC reactServerComponents: true
      //    - rspack ServerPlugin (server env) / ClientPlugin (client env)
      //    The Coordinator inside createPlugins() handles compilation
      //    ordering (server→client→server-actions) automatically.
      // ---------------------------------------------------------------
      if (rscEnabled) {
        api.modifyRspackConfig((config, utils) => {
          const envName = utils.environment.name
          const isServerEnv = envName === RSBUILD_ENVIRONMENT_NAMES.server
          const isClientEnv = envName === RSBUILD_ENVIRONMENT_NAMES.client

          // Create RSC plugin pair lazily (once per build)
          if (!rscPlugins) {
            rscPlugins = utils.rspack.experiments.rsc.createPlugins()
          }

          if (isServerEnv) {
            // --- issuerLayer rule: modules imported from RSC layer
            // get react-server resolve condition ---
            const moduleRules = (config.module.rules ??= [])
            const resolveModules = (config.resolve.modules ??= [])
            const root = resolvedStartConfig.root || process.cwd()

            // Split server-fn provider modules are the actual RSC execution
            // boundary in Start's layered model. They must compile in the
            // RSC layer so React and react-server-dom-rspack resolve their
            // react-server exports without forcing the whole SSR graph into
            // react-server conditions.
            moduleRules.push({
              resourceQuery: /(?:^|[?&])tss-serverfn-split(?:&|$)/,
              layer: RSBUILD_RSC_LAYERS.rsc,
              resolve: {
                conditionNames: ['react-server', '...'],
              },
            })

            // All modules imported from the RSC layer inherit
            // the react-server condition (transitive propagation), except
            // route split virtual modules. Those remain ordinary SSR/client
            // route code; only `?tsr-shared=1` modules may be shared with the
            // provider subtree.
            moduleRules.push({
              issuerLayer: RSBUILD_RSC_LAYERS.rsc,
              resourceQuery: {
                not: [/(?:^|[?&])tsr-split(?:=|&|$)/],
              },
              resolve: {
                conditionNames: ['react-server', '...'],
              },
            })

            // The RSC ServerPlugin injects imports like
            // `react-server-dom-rspack/server` into transformed modules.
            // Some modules in the server graph resolve from real package paths
            // outside the app root, so relying on the default relative
            // `node_modules` lookup is not enough. Seed resolve.modules with the
            // app root explicitly, without package-manager-specific heuristics.
            if (!resolveModules.includes(`${root}/node_modules`)) {
              resolveModules.push(`${root}/node_modules`)
            }
            if (!resolveModules.includes('node_modules')) {
              resolveModules.push('node_modules')
            }

            // Add ServerPlugin with HMR callback
            config.plugins.push(
              new rscPlugins.ServerPlugin({
                clientEntryName: 'index',
                runtimeEntryName: 'index',
                injectSsrModulesToEntries: ['index'],
                onServerComponentChanges: () => {
                  // Send rsc:update to connected clients for HMR
                  if (devServerRef) {
                    devServerRef.sockWrite('custom', {
                      event: 'rsc:update',
                    })
                  }
                },
              }),
            )

            config.plugins.push({
              apply(compiler: RspackCompiler) {
                compiler.hooks.finishMake.tapPromise(
                  {
                    name: 'TanStackStartRscServerFnResolverRebuild',
                    stage: -10,
                  },
                  async (compilation: RspackCompilationExtended) => {
                    if (Object.keys(serverFnsById).length === 0) {
                      return
                    }

                    const resolverContent =
                      virtualModuleState.generateCurrentResolverContent(true)
                    const resolverPath = virtualModuleState.serverFnResolverPath
                    virtualModuleState.tryUpdateServerFnResolver(
                      resolverContent,
                    )

                    const modulesToRebuild = Array.from(
                      compilation.modules,
                    ).filter((mod) => mod.identifier().includes(resolverPath))

                    if (modulesToRebuild.length === 0) {
                      return
                    }

                    await Promise.all(
                      modulesToRebuild.map(
                        (mod) =>
                          new Promise<void>((resolve, reject) => {
                            compilation.rebuildModule(
                              mod,
                              (err: Error | null) => {
                                if (err) reject(err)
                                else resolve()
                              },
                            )
                          }),
                      ),
                    )
                  },
                )
              },
            })
          }

          if (isClientEnv) {
            // Add ClientPlugin — the Coordinator links it to the
            // ServerPlugin's compilation state
            config.plugins.push(new rscPlugins.ClientPlugin())
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
            devServerRef = server
          })
        }
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
            const multi = compiler
            const serverCompiler = multi.compilers.find(
              (c) => c.name === RSBUILD_ENVIRONMENT_NAMES.server,
            )
            if (serverCompiler) {
              multi.setDependencies(serverCompiler, [
                RSBUILD_ENVIRONMENT_NAMES.client,
              ])
            }
          }
        })
      }

      // ---------------------------------------------------------------
      // 8b. Manifest asset replacement fallback (RSC build only)
      //     Rsbuild's RSC coordinator interleaves the server and client
      //     compilers, so the server manifest module can still compile before
      //     client build stats exist. Keep the placeholder replacement only for
      //     that RSC-specific path until rspack exposes a cleaner environment-
      //     level handoff for interleaved builds. Non-RSC builds generate the
      //     final manifest module source in the transform hook above.
      // ---------------------------------------------------------------
      if (api.context.action !== 'dev' && rscEnabled) {
        const manifestPlaceholderLiteral = JSON.stringify(
          START_MANIFEST_PLACEHOLDER,
        )
        api.modifyRspackConfig((config, utils) => {
          if (utils.environment.name !== RSBUILD_ENVIRONMENT_NAMES.server)
            return

          config.plugins.push({
            apply(compiler: RspackCompiler) {
              compiler.hooks.compilation.tap(
                'TanStackStartManifestReplace',
                (compilation: RspackCompilationExtended) => {
                  compilation.hooks.processAssets.tap(
                    {
                      name: 'TanStackStartManifestReplace',
                      stage:
                        utils.rspack.Compilation
                          .PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE,
                    },
                    () => {
                      const clientBuild = getClientBuild()
                      if (!clientBuild) return

                      const manifestValueLiteral =
                        virtualModuleState.generateManifestValueLiteral(
                          clientBuild,
                        )

                      for (const asset of compilation.getAssets()) {
                        if (!asset.name.endsWith('.js')) continue
                        const sourceStr = String(asset.source.source())
                        if (!sourceStr.includes(manifestPlaceholderLiteral)) {
                          continue
                        }

                        compilation.updateAsset(
                          asset.name,
                          new utils.rspack.sources.RawSource(
                            sourceStr.replace(
                              manifestPlaceholderLiteral,
                              manifestValueLiteral,
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Walk the rspack config's module.rules and inject
 * `rspackExperiments.reactServerComponents: true` into SWC loaders.
 *
 * Recurses into `oneOf` arrays because rsbuild nests the main SWC loader
 * inside a `oneOf` rule (e.g. separate branches for asset/source vs
 * javascript/auto). Without recursion, only the mimetype-based fallback
 * SWC rule gets the flag — leaving most .js/.ts files without RSC
 * directive detection.
 */
function enableSwcReactServerComponents(
  config: RspackConfig,
  scope: 'all' | 'rsc-subtree',
): void {
  const isRspackRule = (
    rule: NonNullable<RspackConfig['module']['rules']>[number],
  ): rule is RspackRule => !!rule && rule !== '...'
  const getRuleLoaders = (rule: RspackRule) => {
    const { use } = rule
    if (!use) {
      return []
    }

    return typeof use === 'function' ? [] : Array.isArray(use) ? use : [use]
  }
  const getLoaderPath = (loader: ReturnType<typeof getRuleLoaders>[number]) =>
    typeof loader === 'string' ? loader : loader.loader
  const rootRules = (config.module.rules ??= []).filter(isRspackRule)

  function processRules(rules = rootRules): void {
    for (const rule of rules) {
      processRules(
        Array.isArray(rule.oneOf) ? rule.oneOf.filter(isRspackRule) : [],
      )

      const hasSwcLoader = getRuleLoaders(rule).some((loader) =>
        getLoaderPath(loader).includes('swc-loader'),
      )
      if (!hasSwcLoader) continue

      const enableReactServerComponentsOnRule = (nextRule: RspackRule) => {
        for (const loader of getRuleLoaders(nextRule)) {
          if (typeof loader === 'string') {
            continue
          }

          const loaderPath = getLoaderPath(loader)
          if (!loaderPath || !loaderPath.includes('swc-loader')) {
            continue
          }

          const options =
            loader.options && typeof loader.options === 'object'
              ? loader.options
              : (loader.options = {})
          const experiments =
            options.rspackExperiments &&
            typeof options.rspackExperiments === 'object'
              ? options.rspackExperiments
              : (options.rspackExperiments = {})
          const current = experiments.reactServerComponents

          experiments.reactServerComponents =
            current === true || current == null
              ? {}
              : typeof current === 'object' &&
                  current !== null &&
                  !Array.isArray(current)
                ? { ...current }
                : {}
        }
      }

      if (scope === 'all') {
        enableReactServerComponentsOnRule(rule)
        continue
      }

      const originalRule = structuredClone(rule)
      const providerRule = structuredClone(originalRule)
      providerRule.resourceQuery = /(?:^|[?&])tss-serverfn-split(?:&|$)/
      enableReactServerComponentsOnRule(providerRule)

      const routeSplitRule = structuredClone(originalRule)
      routeSplitRule.resourceQuery = /(?:^|[?&])tsr-split(?:=|&|$)/
      routeSplitRule.resolve = {
        conditionNames: ['...'],
      }

      const subtreeRule = structuredClone(originalRule)
      subtreeRule.issuerLayer = RSBUILD_RSC_LAYERS.rsc
      enableReactServerComponentsOnRule(subtreeRule)

      for (const key of Object.keys(rule) as Array<keyof RspackRule>) {
        delete rule[key]
      }
      rule.oneOf = [providerRule, routeSplitRule, subtreeRule, originalRule]
    }
  }

  processRules()
}
