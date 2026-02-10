import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

import { joinPaths } from '@tanstack/router-core'
import { NodeRequest, sendNodeResponse } from 'srvx/node'
import path from 'pathe'
import { joinURL } from 'ufo'
import { ENTRY_POINTS, VITE_ENVIRONMENT_NAMES } from '../constants'
import { resolveEntry } from '../resolve-entries'
import { parseStartConfig } from '../schema'
import { createRouteTreeModuleDeclaration } from '../start-router-plugin/route-tree-module-declaration'
import { createInjectedHeadScriptsPlugin } from './injected-head-scripts-plugin'
import { resolveLoaderPath } from './resolve-loader-path'
import {
  SERVER_FN_MANIFEST_TEMP_FILE,
  createServerFnManifestRspackPlugin,
  createServerFnResolverPlugin,
} from './start-compiler-plugin'
import {
  createStartManifestRspackPlugin,
  createStartManifestVirtualModulePlugin,
} from './start-manifest-plugin'
import { postServerBuildRsbuild } from './post-server-build'
import { tanStackStartRouterRsbuild } from './start-router-plugin'
import type { TanStackStartInputConfig } from '../schema'
import type {
  GetConfigFn,
  ResolvedStartConfig,
  TanStackStartVitePluginCoreOptions,
} from '../types'

type RsbuildPlugin = {
  name: string
  setup: (api: any) => void
}

const MODULE_FEDERATION_RSBUILD_PLUGIN_NAME =
  'rsbuild:module-federation-enhanced'

function hasModuleFederationPlugin(config: any): boolean {
  if (config?.moduleFederation?.options) {
    return true
  }

  if (!Array.isArray(config?.plugins)) {
    return false
  }

  return config.plugins.some((plugin: any) => {
    return plugin?.name === MODULE_FEDERATION_RSBUILD_PLUGIN_NAME
  })
}

function isFullUrl(str: string): boolean {
  try {
    new URL(str)
    return true
  } catch {
    return false
  }
}

function defineReplaceEnv<TKey extends string, TValue extends string>(
  key: TKey,
  value: TValue,
): { [P in `process.env.${TKey}` | `import.meta.env.${TKey}`]: TValue } {
  return {
    [`process.env.${key}`]: JSON.stringify(value),
    [`import.meta.env.${key}`]: JSON.stringify(value),
  } as { [P in `process.env.${TKey}` | `import.meta.env.${TKey}`]: TValue }
}

function mergeRspackConfig(base: any, next: any) {
  return {
    ...base,
    ...next,
    plugins: [...(base?.plugins ?? []), ...(next?.plugins ?? [])],
    module: {
      ...base?.module,
      ...next?.module,
      rules: [...(base?.module?.rules ?? []), ...(next?.module?.rules ?? [])],
    },
    resolve: {
      ...base?.resolve,
      ...next?.resolve,
      alias: {
        ...(base?.resolve?.alias ?? {}),
        ...(next?.resolve?.alias ?? {}),
      },
    },
  }
}

function mergeEnvConfig(base: any, next: any) {
  return {
    ...base,
    ...next,
    source: {
      ...base?.source,
      ...next?.source,
      alias: {
        ...(base?.source?.alias ?? {}),
        ...(next?.source?.alias ?? {}),
      },
      define: {
        ...(base?.source?.define ?? {}),
        ...(next?.source?.define ?? {}),
      },
    },
    output: {
      ...base?.output,
      ...next?.output,
      distPath: {
        ...(base?.output?.distPath ?? {}),
        ...(next?.output?.distPath ?? {}),
      },
    },
    tools: {
      ...base?.tools,
      ...next?.tools,
      rspack: mergeRspackConfig(base?.tools?.rspack, next?.tools?.rspack),
    },
  }
}

function getOutputDirectory(
  root: string,
  config: any,
  environmentName: string,
  directoryName: string,
) {
  const envDistPath =
    config.environments?.[environmentName]?.output?.distPath?.root
  if (envDistPath) {
    return path.resolve(root, envDistPath)
  }
  const rootDistPath = config.output?.distPath?.root ?? 'dist'
  return path.resolve(root, rootDistPath, directoryName)
}

function toPluginArray(plugin: any) {
  if (!plugin) return []
  return Array.isArray(plugin) ? plugin : [plugin]
}

export function TanStackStartRsbuildPluginCore(
  corePluginOpts: TanStackStartVitePluginCoreOptions,
  startPluginOpts: TanStackStartInputConfig,
): Array<RsbuildPlugin> {
  const serverFnProviderEnv =
    corePluginOpts.serverFn?.providerEnv || VITE_ENVIRONMENT_NAMES.server
  const ssrIsProvider = serverFnProviderEnv === VITE_ENVIRONMENT_NAMES.server

  const resolvedStartConfig: ResolvedStartConfig = {
    root: '',
    startFilePath: undefined,
    routerFilePath: '',
    srcDirectory: '',
    viteAppBase: '',
    serverFnProviderEnv,
  }

  let startConfig: ReturnType<typeof parseStartConfig> | null = null
  const getConfig: GetConfigFn = () => {
    if (!resolvedStartConfig.root) {
      throw new Error(`Cannot get config before root is resolved`)
    }
    if (!startConfig) {
      startConfig = parseStartConfig(
        startPluginOpts,
        corePluginOpts,
        resolvedStartConfig.root,
      )
    }
    return { startConfig, resolvedStartConfig, corePluginOpts }
  }

  let resolvedServerEntryPath: string | undefined
  let resolvedServerOutputDir: string | undefined
  let resolvedClientOutputDir: string | undefined
  let routeTreeModuleDeclaration: string | null = null
  let routeTreeGeneratedPath: string | null = null

  return [
    {
      name: 'tanstack-start-core:rsbuild-config',
      setup(api) {
        api.modifyRsbuildConfig((config: any) => {
          const root = config.root || process.cwd()
          resolvedStartConfig.root = root

          const { startConfig } = getConfig()
          const assetPrefix = config.output?.assetPrefix ?? '/'
          resolvedStartConfig.viteAppBase = assetPrefix
          if (!isFullUrl(resolvedStartConfig.viteAppBase)) {
            resolvedStartConfig.viteAppBase = joinPaths([
              '/',
              resolvedStartConfig.viteAppBase,
              '/',
            ])
          }

          if (startConfig.router.basepath === undefined) {
            if (!isFullUrl(resolvedStartConfig.viteAppBase)) {
              startConfig.router.basepath =
                resolvedStartConfig.viteAppBase.replace(/^\/|\/$/g, '')
            } else {
              startConfig.router.basepath = '/'
            }
          }

          const TSS_SERVER_FN_BASE = joinPaths([
            '/',
            startConfig.router.basepath,
            startConfig.serverFns.base,
            '/',
          ])

          const resolvedSrcDirectory = path.join(root, startConfig.srcDirectory)
          resolvedStartConfig.srcDirectory = resolvedSrcDirectory

          const startFilePath = resolveEntry({
            type: 'start entry',
            configuredEntry: startConfig.start.entry,
            defaultEntry: 'start',
            resolvedSrcDirectory,
            required: false,
          })
          resolvedStartConfig.startFilePath = startFilePath

          const routerFilePath = resolveEntry({
            type: 'router entry',
            configuredEntry: startConfig.router.entry,
            defaultEntry: 'router',
            resolvedSrcDirectory,
            required: true,
          })
          resolvedStartConfig.routerFilePath = routerFilePath

          const clientEntryPath = resolveEntry({
            type: 'client entry',
            configuredEntry: startConfig.client.entry,
            defaultEntry: 'client',
            resolvedSrcDirectory,
            required: false,
          })

          const serverEntryPath = resolveEntry({
            type: 'server entry',
            configuredEntry: startConfig.server.entry,
            defaultEntry: 'server',
            resolvedSrcDirectory,
            required: false,
          })
          resolvedServerEntryPath =
            serverEntryPath ?? corePluginOpts.defaultEntryPaths.server

          const entryAliasConfiguration: Record<
            (typeof ENTRY_POINTS)[keyof typeof ENTRY_POINTS],
            string
          > = {
            [ENTRY_POINTS.client]:
              clientEntryPath ?? corePluginOpts.defaultEntryPaths.client,
            [ENTRY_POINTS.server]:
              serverEntryPath ?? corePluginOpts.defaultEntryPaths.server,
            [ENTRY_POINTS.start]:
              startFilePath ?? corePluginOpts.defaultEntryPaths.start,
            [ENTRY_POINTS.router]: routerFilePath,
          }
          const resolvedClientEntry =
            entryAliasConfiguration[ENTRY_POINTS.client]
          const resolvedServerEntry =
            entryAliasConfiguration[ENTRY_POINTS.server]

          const clientOutputDir = getOutputDirectory(
            root,
            config,
            VITE_ENVIRONMENT_NAMES.client,
            'client',
          )
          resolvedClientOutputDir = clientOutputDir
          const serverOutputDir = getOutputDirectory(
            root,
            config,
            VITE_ENVIRONMENT_NAMES.server,
            'server',
          )
          resolvedServerOutputDir = serverOutputDir
          const serverFnManifestTempPath = path.join(
            serverOutputDir,
            SERVER_FN_MANIFEST_TEMP_FILE,
          )
          const moduleFederationEnabled = hasModuleFederationPlugin(config)

          const isDev = api.context?.command === 'serve'
          const isBuild = api.context?.command === 'build'
          const defineViteEnv = (key: string, fallback = '') => {
            const value = process.env[key] ?? fallback
            return defineReplaceEnv(key, value)
          }
          const defineValues = {
            ...defineReplaceEnv('TSS_SERVER_FN_BASE', TSS_SERVER_FN_BASE),
            ...defineReplaceEnv('TSS_CLIENT_OUTPUT_DIR', clientOutputDir),
            ...defineReplaceEnv(
              'TSS_ROUTER_BASEPATH',
              startConfig.router.basepath,
            ),
            ...defineReplaceEnv('TSS_BUNDLER', 'rsbuild'),
            ...defineReplaceEnv('TSS_DEV_SERVER', isDev ? 'true' : 'false'),
            ...(isDev
              ? defineReplaceEnv(
                  'TSS_SHELL',
                  startConfig.spa?.enabled ? 'true' : 'false',
                )
              : {}),
            ...defineViteEnv('VITE_NODE_ENV', 'production'),
            ...defineViteEnv('VITE_EXTERNAL_PORT', ''),
            ...(isBuild && startConfig.server.build.staticNodeEnv
              ? {
                  'process.env.NODE_ENV': JSON.stringify(
                    process.env.NODE_ENV ?? 'production',
                  ),
                }
              : {}),
          }

          const routerPlugins = tanStackStartRouterRsbuild(
            startPluginOpts,
            getConfig,
            corePluginOpts,
          )
          const clientRouterConfig = {
            ...startConfig.router,
            routeTreeFileHeader: [],
            routeTreeFileFooter: [],
            plugins: [],
          }
          const generatedRouteTreePath =
            routerPlugins.getGeneratedRouteTreePath()
          const routeTreeModuleDeclarationValue =
            createRouteTreeModuleDeclaration({
              generatedRouteTreePath,
              routerFilePath: resolvedStartConfig.routerFilePath,
              startFilePath: resolvedStartConfig.startFilePath,
              framework: corePluginOpts.framework,
            })
          routeTreeModuleDeclaration = routeTreeModuleDeclarationValue
          routeTreeGeneratedPath = generatedRouteTreePath
          const registerDeclaration = `declare module '@tanstack/${corePluginOpts.framework}-start'`
          if (fs.existsSync(generatedRouteTreePath)) {
            const existingTree = fs.readFileSync(
              generatedRouteTreePath,
              'utf-8',
            )
            if (!existingTree.includes(registerDeclaration)) {
              const staleRouteTreePath = `${generatedRouteTreePath}.stale`
              try {
                fs.renameSync(generatedRouteTreePath, staleRouteTreePath)
                fs.rmSync(staleRouteTreePath)
              } catch (error: any) {
                // Ignore transient concurrent-generation races and continue.
                if (!['ENOENT', 'EBUSY'].includes(error?.code)) {
                  throw error
                }
              }
            }
          }

          const startCompilerLoaderPath = resolveLoaderPath(
            './start-compiler-loader',
          )
          const startStorageContextStubPath = resolveLoaderPath(
            './start-storage-context-stub',
          )
          const clientAliasOverrides = {
            '@tanstack/start-storage-context': startStorageContextStubPath,
          }

          const startClientCoreDistPattern =
            /[\\/]start-client-core[\\/]dist[\\/]esm[\\/]/
          const loaderIncludePaths: Array<string | RegExp> = [
            resolvedStartConfig.srcDirectory,
          ]
          loaderIncludePaths.push(startClientCoreDistPattern)

          const loaderRule = (
            env: 'client' | 'server',
            envName: string,
            manifestPath?: string,
          ) => ({
            test: /\.[cm]?[jt]sx?$/,
            include: loaderIncludePaths,
            enforce: 'pre',
            use: [
              {
                loader: startCompilerLoaderPath,
                options: {
                  env,
                  envName,
                  root,
                  framework: corePluginOpts.framework,
                  providerEnvName: serverFnProviderEnv,
                  generateFunctionId:
                    startPluginOpts?.serverFns?.generateFunctionId,
                  manifestPath,
                },
              },
            ],
          })

          const autoImportPlugins = toPluginArray(routerPlugins.autoImport)

          const clientEnvConfig = {
            source: {
              entry: { index: resolvedClientEntry },
              alias: {
                ...entryAliasConfiguration,
                ...clientAliasOverrides,
              },
              define: defineValues,
            },
            output: {
              target: 'web',
              distPath: {
                root: path.relative(root, clientOutputDir),
              },
            },
            tools: {
              rspack: {
                plugins: [
                  routerPlugins.generatorPlugin,
                  routerPlugins.clientCodeSplitter,
                  ...autoImportPlugins,
                  createStartManifestRspackPlugin({
                    basePath: resolvedStartConfig.viteAppBase,
                    clientOutputDir,
                  }),
                ],
                module: {
                  rules: [
                    loaderRule('client', VITE_ENVIRONMENT_NAMES.client),
                    {
                      include: [routerPlugins.getGeneratedRouteTreePath()],
                      use: [
                        {
                          loader: routerPlugins.routeTreeLoaderPath,
                          options: {
                            routerConfig: clientRouterConfig,
                            root,
                          },
                        },
                      ],
                    },
                  ],
                },
                resolve: {
                  alias: {
                    ...entryAliasConfiguration,
                    ...clientAliasOverrides,
                  },
                },
              },
            },
          }

          const serverEnvConfig = {
            source: {
              entry: { server: resolvedServerEntry },
              alias: entryAliasConfiguration,
              define: defineValues,
            },
            output: {
              target: 'node',
              distPath: {
                root: path.relative(root, serverOutputDir),
              },
            },
            tools: {
              rspack: {
                ...(moduleFederationEnabled
                  ? {
                      target: 'async-node',
                      experiments: {
                        outputModule: false,
                      },
                      output: {
                        module: false,
                        chunkFormat: 'commonjs',
                        chunkLoading: 'async-node',
                        library: {
                          type: 'commonjs-module',
                        },
                      },
                    }
                  : {
                      experiments: {
                        outputModule: true,
                      },
                      output: {
                        module: true,
                        chunkFormat: 'module',
                        chunkLoading: 'import',
                        library: {
                          type: 'module',
                        },
                      },
                    }),
                plugins: [
                  routerPlugins.generatorPlugin,
                  routerPlugins.serverCodeSplitter,
                  ...autoImportPlugins,
                  createServerFnResolverPlugin({
                    environmentName: VITE_ENVIRONMENT_NAMES.server,
                    providerEnvName: serverFnProviderEnv,
                    serverOutputDir,
                  }),
                  createServerFnManifestRspackPlugin({
                    serverOutputDir,
                  }),
                  createInjectedHeadScriptsPlugin(),
                  createStartManifestVirtualModulePlugin({
                    clientOutputDir,
                  }),
                ],
                module: {
                  rules: [
                    loaderRule(
                      'server',
                      VITE_ENVIRONMENT_NAMES.server,
                      serverFnManifestTempPath,
                    ),
                  ],
                },
                resolve: {
                  alias: entryAliasConfiguration,
                },
              },
            },
          }

          const setupMiddlewares = (
            middlewares: Array<any>,
            context: { environments?: Record<string, any> },
          ) => {
            if (startConfig.vite?.installDevServerMiddleware === false) {
              return
            }
            const serverEnv =
              context.environments?.[VITE_ENVIRONMENT_NAMES.server]
            middlewares.push(async (req: any, res: any, next: any) => {
              if (res.headersSent || res.writableEnded) {
                return next()
              }
              if (!serverEnv?.loadBundle) {
                return next()
              }
              try {
                const serverBundle = await serverEnv.loadBundle()
                const serverBuild = serverBundle?.default ?? serverBundle
                if (!serverBuild?.fetch) {
                  return next()
                }
                const requestWithBaseUrl = Object.create(req)
                requestWithBaseUrl.url = joinURL(
                  resolvedStartConfig.viteAppBase,
                  req.url ?? '/',
                )
                const webReq = new NodeRequest({ req: requestWithBaseUrl, res })
                const webRes = await serverBuild.fetch(webReq)
                return sendNodeResponse(res, webRes)
              } catch (error) {
                return next(error)
              }
            })
          }

          const existingSetupMiddlewares = config.dev?.setupMiddlewares
          const mergedSetupMiddlewares = (
            middlewares: Array<any>,
            context: { environments?: Record<string, any> },
          ) => {
            if (typeof existingSetupMiddlewares === 'function') {
              existingSetupMiddlewares(middlewares, context)
            } else if (Array.isArray(existingSetupMiddlewares)) {
              existingSetupMiddlewares.forEach((fn: any) => {
                fn(middlewares, context)
              })
            }
            setupMiddlewares(middlewares, context)
          }

          const nextConfig = {
            ...config,
            environments: {
              ...config.environments,
              [VITE_ENVIRONMENT_NAMES.client]: mergeEnvConfig(
                config.environments?.[VITE_ENVIRONMENT_NAMES.client],
                clientEnvConfig,
              ),
              [VITE_ENVIRONMENT_NAMES.server]: mergeEnvConfig(
                config.environments?.[VITE_ENVIRONMENT_NAMES.server],
                serverEnvConfig,
              ),
            },
            dev: {
              ...config.dev,
              setupMiddlewares: mergedSetupMiddlewares,
            },
          }

          if (!ssrIsProvider) {
            const providerOutputDir = getOutputDirectory(
              root,
              config,
              serverFnProviderEnv,
              serverFnProviderEnv,
            )
            const providerManifestTempPath = path.join(
              providerOutputDir,
              SERVER_FN_MANIFEST_TEMP_FILE,
            )
            nextConfig.environments = {
              ...nextConfig.environments,
              [serverFnProviderEnv]: mergeEnvConfig(
                config.environments?.[serverFnProviderEnv],
                {
                  source: {
                    entry: { provider: resolvedServerEntry },
                    alias: entryAliasConfiguration,
                    define: defineValues,
                  },
                  output: {
                    target: 'node',
                    distPath: {
                      root: path.relative(root, providerOutputDir),
                    },
                  },
                  tools: {
                    rspack: {
                      ...(moduleFederationEnabled
                        ? {
                            target: 'async-node',
                            experiments: {
                              outputModule: false,
                            },
                            output: {
                              module: false,
                              chunkFormat: 'commonjs',
                              chunkLoading: 'async-node',
                              library: {
                                type: 'commonjs-module',
                              },
                            },
                          }
                        : {
                            experiments: {
                              outputModule: true,
                            },
                            output: {
                              module: true,
                              chunkFormat: 'module',
                              chunkLoading: 'import',
                              library: {
                                type: 'module',
                              },
                            },
                          }),
                      plugins: [
                        createServerFnResolverPlugin({
                          environmentName: serverFnProviderEnv,
                          providerEnvName: serverFnProviderEnv,
                          serverOutputDir: providerOutputDir,
                        }),
                        createServerFnManifestRspackPlugin({
                          serverOutputDir: providerOutputDir,
                        }),
                        createInjectedHeadScriptsPlugin(),
                      ],
                      module: {
                        rules: [
                          loaderRule(
                            'server',
                            serverFnProviderEnv,
                            providerManifestTempPath,
                          ),
                        ],
                      },
                      resolve: {
                        alias: entryAliasConfiguration,
                      },
                    },
                  },
                },
              ),
            }
          }

          return nextConfig
        })

        api.onAfterStartProdServer?.(({ server }: { server: any }) => {
          const serverOutputDir = resolvedServerOutputDir
          if (!server?.middlewares?.use || !serverOutputDir) {
            return
          }

          let serverBuild: any = null
          server.middlewares.use(async (req: any, res: any, next: any) => {
            try {
              if (res.headersSent || res.writableEnded) {
                return next()
              }
              if (!resolvedServerEntryPath) {
                return next()
              }

              if (!serverBuild) {
                const outputCandidates = ['server.js', 'server.mjs', 'index.js']
                const outputFilename =
                  outputCandidates.find((candidate) =>
                    fs.existsSync(path.join(serverOutputDir, candidate)),
                  ) ?? 'server.js'
                const serverEntryPath = path.join(
                  serverOutputDir,
                  outputFilename,
                )
                const imported = await import(
                  pathToFileURL(serverEntryPath).toString()
                )
                serverBuild = imported.default ?? imported
              }

              if (!serverBuild?.fetch) {
                return next()
              }
              const requestWithBaseUrl = Object.create(req)
              requestWithBaseUrl.url = joinURL(
                resolvedStartConfig.viteAppBase,
                req.url ?? '/',
              )

              const webReq = new NodeRequest({ req: requestWithBaseUrl, res })
              const webRes: Response = await serverBuild.fetch(webReq)
              return sendNodeResponse(res, webRes)
            } catch (error) {
              next(error)
            }
          })
        })

        api.onAfterBuild?.(async () => {
          const { startConfig } = getConfig()
          const clientOutputDir = resolvedClientOutputDir
          const serverOutputDir = resolvedServerOutputDir
          if (!clientOutputDir || !serverOutputDir) {
            return
          }
          await postServerBuildRsbuild({
            startConfig,
            clientOutputDir,
            serverOutputDir,
          })
          if (routeTreeGeneratedPath && routeTreeModuleDeclaration) {
            if (fs.existsSync(routeTreeGeneratedPath)) {
              const existingTree = fs.readFileSync(
                routeTreeGeneratedPath,
                'utf-8',
              )
              if (!existingTree.includes(routeTreeModuleDeclaration)) {
                fs.appendFileSync(
                  routeTreeGeneratedPath,
                  `\n\n${routeTreeModuleDeclaration}\n`,
                )
              }
            }
          }
        })
      },
    },
  ]
}
