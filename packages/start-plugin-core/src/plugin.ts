import { joinPaths } from '@tanstack/router-core'
import { VIRTUAL_MODULES } from '@tanstack/start-server-core'
import { TanStackServerFnPlugin } from '@tanstack/server-functions-plugin'
import * as vite from 'vite'
import { crawlFrameworkPkgs } from 'vitefu'
import { join } from 'pathe'
import { escapePath } from 'tinyglobby'
import { startManifestPlugin } from './start-manifest-plugin/plugin'
import { startCompilerPlugin } from './start-compiler-plugin/plugin'
import { ENTRY_POINTS, VITE_ENVIRONMENT_NAMES } from './constants'
import { tanStackStartRouter } from './start-router-plugin/plugin'
import { loadEnvPlugin } from './load-env-plugin/plugin'
import { devServerPlugin } from './dev-server-plugin/plugin'
import { previewServerPlugin } from './preview-server-plugin/plugin'
import { parseStartConfig } from './schema'
import { resolveEntry } from './resolve-entries'
import {
  getClientOutputDirectory,
  getServerOutputDirectory,
} from './output-directory'
import { postServerBuild } from './post-server-build'
import { createServerFnPlugin } from './create-server-fn-plugin/plugin'
import type { ViteEnvironmentNames } from './constants'
import type {
  TanStackStartInputConfig,
  TanStackStartOutputConfig,
} from './schema'
import type { PluginOption } from 'vite'
import type { CompileStartFrameworkOptions } from './start-compiler-plugin/compilers'

export interface TanStackStartVitePluginCoreOptions {
  framework: CompileStartFrameworkOptions
  defaultEntryPaths: {
    client: string
    server: string
    start: string
  }
  serverFn?: {
    directive?: string
    ssr?: {
      getServerFnById?: string
    }
    providerEnv?: string
  }
}

export interface ResolvedStartConfig {
  root: string
  startFilePath: string | undefined
  routerFilePath: string
  srcDirectory: string
  viteAppBase: string
}

export type GetConfigFn = () => {
  startConfig: TanStackStartOutputConfig
  resolvedStartConfig: ResolvedStartConfig
}

function isFullUrl(str: string): boolean {
  try {
    new URL(str)
    return true
  } catch {
    return false
  }
}

export function TanStackStartVitePluginCore(
  corePluginOpts: TanStackStartVitePluginCoreOptions,
  startPluginOpts: TanStackStartInputConfig,
): Array<PluginOption> {
  const resolvedStartConfig: ResolvedStartConfig = {
    root: '',
    startFilePath: undefined,
    routerFilePath: '',
    srcDirectory: '',
    viteAppBase: '',
  }

  const directive = corePluginOpts.serverFn?.directive ?? 'use server'

  let startConfig: TanStackStartOutputConfig | null
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
    return { startConfig, resolvedStartConfig }
  }

  const capturedBundle: Partial<
    Record<ViteEnvironmentNames, vite.Rollup.OutputBundle>
  > = {}

  function getBundle(envName: ViteEnvironmentNames): vite.Rollup.OutputBundle {
    const bundle = capturedBundle[envName]
    if (!bundle) {
      throw new Error(`No bundle captured for environment: ${envName}`)
    }
    return bundle
  }

  const environments: Array<{ name: string; type: 'client' | 'server' }> = [
    { name: VITE_ENVIRONMENT_NAMES.client, type: 'client' },
    { name: VITE_ENVIRONMENT_NAMES.server, type: 'server' },
  ]
  if (
    corePluginOpts.serverFn?.providerEnv &&
    !environments.find((e) => e.name === corePluginOpts.serverFn?.providerEnv)
  ) {
    environments.push({
      name: corePluginOpts.serverFn.providerEnv,
      type: 'server',
    })
  }
  return [
    {
      name: 'tanstack-start-core:config',
      enforce: 'pre',
      async config(viteConfig, { command }) {
        resolvedStartConfig.viteAppBase = viteConfig.base ?? '/'
        if (!isFullUrl(resolvedStartConfig.viteAppBase)) {
          resolvedStartConfig.viteAppBase = joinPaths([
            '/',
            viteConfig.base,
            '/',
          ])
        }
        const root = viteConfig.root || process.cwd()
        resolvedStartConfig.root = root

        const { startConfig } = getConfig()
        if (startConfig.router.basepath === undefined) {
          if (!isFullUrl(resolvedStartConfig.viteAppBase)) {
            startConfig.router.basepath =
              resolvedStartConfig.viteAppBase.replace(/^\/|\/$/g, '')
          } else {
            startConfig.router.basepath = '/'
          }
        } else {
          if (command === 'serve' && !viteConfig.server?.middlewareMode) {
            // when serving, we must ensure that router basepath and viteAppBase are aligned
            if (
              !joinPaths(['/', startConfig.router.basepath, '/']).startsWith(
                joinPaths(['/', resolvedStartConfig.viteAppBase, '/']),
              )
            ) {
              this.error(
                '[tanstack-start]: During `vite dev`, `router.basepath` must start with the vite `base` config value',
              )
            }
          }
        }

        const TSS_SERVER_FN_BASE = joinPaths([
          '/',
          startConfig.router.basepath,
          startConfig.serverFns.base,
          '/',
        ])
        const resolvedSrcDirectory = join(root, startConfig.srcDirectory)
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

        const clientAlias = vite.normalizePath(
          clientEntryPath ?? corePluginOpts.defaultEntryPaths.client,
        )
        const serverAlias = vite.normalizePath(
          serverEntryPath ?? corePluginOpts.defaultEntryPaths.server,
        )
        const startAlias = vite.normalizePath(
          startFilePath ?? corePluginOpts.defaultEntryPaths.start,
        )
        const routerAlias = vite.normalizePath(routerFilePath)

        const entryAliasConfiguration: Record<
          (typeof ENTRY_POINTS)[keyof typeof ENTRY_POINTS],
          string
        > = {
          [ENTRY_POINTS.client]: clientAlias,
          [ENTRY_POINTS.server]: serverAlias,
          [ENTRY_POINTS.start]: startAlias,
          [ENTRY_POINTS.router]: routerAlias,
        }

        const startPackageName =
          `@tanstack/${corePluginOpts.framework}-start` as const

        // crawl packages that have start in "peerDependencies"
        // see https://github.com/svitejs/vitefu/blob/d8d82fa121e3b2215ba437107093c77bde51b63b/src/index.js#L95-L101

        // this is currently uncached; could be implemented similarly as vite handles lock file changes
        // see https://github.com/vitejs/vite/blob/557f797d29422027e8c451ca50dd84bf8c41b5f0/packages/vite/src/node/optimizer/index.ts#L1282

        const crawlFrameworkPkgsResult = await crawlFrameworkPkgs({
          root: process.cwd(),
          isBuild: command === 'build',
          isFrameworkPkgByJson(pkgJson) {
            const peerDependencies = pkgJson['peerDependencies']

            if (peerDependencies) {
              if (
                startPackageName in peerDependencies ||
                '@tanstack/start-client-core' in peerDependencies
              ) {
                return true
              }
            }

            return false
          },
        })

        return {
          // see https://vite.dev/config/shared-options.html#apptype
          // this will prevent vite from injecting middlewares that we don't want
          appType: viteConfig.appType ?? 'custom',
          environments: {
            [VITE_ENVIRONMENT_NAMES.client]: {
              consumer: 'client',
              build: {
                rollupOptions: {
                  input: {
                    main: ENTRY_POINTS.client,
                  },
                },
                outDir: getClientOutputDirectory(viteConfig),
              },
              optimizeDeps: {
                exclude: crawlFrameworkPkgsResult.optimizeDeps.exclude,
                // Ensure user code can be crawled for dependencies
                entries: [clientAlias, routerAlias].map((entry) =>
                  // Entries are treated as `tinyglobby` patterns so need to be escaped
                  escapePath(entry),
                ),
              },
            },
            [VITE_ENVIRONMENT_NAMES.server]: {
              consumer: 'server',
              build: {
                ssr: true,
                rollupOptions: {
                  input:
                    viteConfig.environments?.[VITE_ENVIRONMENT_NAMES.server]
                      ?.build?.rollupOptions?.input ?? serverAlias,
                },
                outDir: getServerOutputDirectory(viteConfig),
                commonjsOptions: {
                  include: [/node_modules/],
                },
                copyPublicDir:
                  viteConfig.environments?.[VITE_ENVIRONMENT_NAMES.server]
                    ?.build?.copyPublicDir ?? false,
              },
              optimizeDeps: {
                // Ensure user code can be crawled for dependencies
                entries: [serverAlias, startAlias, routerAlias].map((entry) =>
                  // Entries are treated as `tinyglobby` patterns so need to be escaped
                  escapePath(entry),
                ),
              },
            },
          },

          resolve: {
            noExternal: [
              // ENTRY_POINTS.start,
              '@tanstack/start**',
              `@tanstack/${corePluginOpts.framework}-start**`,
              ...crawlFrameworkPkgsResult.ssr.noExternal.sort(),
            ],
            alias: {
              ...entryAliasConfiguration,
            },
          },
          /* prettier-ignore */
          define: {
            // define is an esbuild function that replaces the any instances of given keys with the given values
            // i.e: __FRAMEWORK_NAME__ can be replaced with JSON.stringify("TanStack Start")
            // This is not the same as injecting environment variables.

            ...defineReplaceEnv('TSS_SERVER_FN_BASE', TSS_SERVER_FN_BASE),
            ...defineReplaceEnv('TSS_CLIENT_OUTPUT_DIR', getClientOutputDirectory(viteConfig)),
            ...defineReplaceEnv('TSS_ROUTER_BASEPATH', startConfig.router.basepath),
            ...(command === 'serve' ? defineReplaceEnv('TSS_SHELL', startConfig.spa?.enabled ? 'true' : 'false') : {}),
            ...defineReplaceEnv('TSS_DEV_SERVER', command === 'serve' ? 'true' : 'false'),
          },
          builder: {
            sharedPlugins: true,
            async buildApp(builder) {
              const client = builder.environments[VITE_ENVIRONMENT_NAMES.client]
              const server = builder.environments[VITE_ENVIRONMENT_NAMES.server]

              if (!client) {
                throw new Error('Client environment not found')
              }

              if (!server) {
                throw new Error('SSR environment not found')
              }

              if (!client.isBuilt) {
                // Build the client bundle first
                await builder.build(client)
              }
              if (!server.isBuilt) {
                // Build the SSR bundle
                await builder.build(server)
              }
            },
          },
        }
      },
      buildApp: {
        order: 'post',
        async handler(builder) {
          const { startConfig } = getConfig()
          await postServerBuild({ builder, startConfig })
        },
      },
    },
    tanStackStartRouter(startPluginOpts, getConfig, corePluginOpts),
    // N.B. TanStackStartCompilerPlugin must be before the TanStackServerFnPlugin
    startCompilerPlugin({ framework: corePluginOpts.framework, environments }),
    createServerFnPlugin({
      framework: corePluginOpts.framework,
      directive,
      environments,
    }),

    TanStackServerFnPlugin({
      // This is the ID that will be available to look up and import
      // our server function manifest and resolve its module
      manifestVirtualImportId: VIRTUAL_MODULES.serverFnManifest,
      directive,
      generateFunctionId: startPluginOpts?.serverFns?.generateFunctionId,
      callers: [
        {
          envConsumer: 'client',
          getRuntimeCode: () =>
            `import { createClientRpc } from '@tanstack/${corePluginOpts.framework}-start/client-rpc'`,
          replacer: (d) => `createClientRpc('${d.functionId}')`,
          envName: VITE_ENVIRONMENT_NAMES.client,
        },
        {
          envConsumer: 'server',
          getRuntimeCode: () =>
            `import { createSsrRpc } from '@tanstack/${corePluginOpts.framework}-start/ssr-rpc'`,
          envName: VITE_ENVIRONMENT_NAMES.server,
          replacer: (d) => `createSsrRpc('${d.functionId}')`,
          getServerFnById: corePluginOpts.serverFn?.ssr?.getServerFnById,
        },
      ],
      provider: {
        getRuntimeCode: () =>
          `import { createServerRpc } from '@tanstack/${corePluginOpts.framework}-start/server-rpc'`,
        replacer: (d) => `createServerRpc('${d.functionId}', ${d.fn})`,
        envName:
          corePluginOpts.serverFn?.providerEnv || VITE_ENVIRONMENT_NAMES.server,
      },
    }),
    loadEnvPlugin(),
    startManifestPlugin({
      getClientBundle: () => getBundle(VITE_ENVIRONMENT_NAMES.client),
      getConfig,
    }),
    devServerPlugin({ getConfig }),
    previewServerPlugin(),
    {
      name: 'tanstack-start:core:capture-bundle',
      applyToEnvironment(e) {
        return (
          e.name === VITE_ENVIRONMENT_NAMES.client ||
          e.name === VITE_ENVIRONMENT_NAMES.server
        )
      },
      enforce: 'post',
      generateBundle(_options, bundle) {
        const environment = this.environment.name as ViteEnvironmentNames
        if (!Object.values(VITE_ENVIRONMENT_NAMES).includes(environment)) {
          throw new Error(`Unknown environment: ${environment}`)
        }
        capturedBundle[environment] = bundle
      },
    },
  ]
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
