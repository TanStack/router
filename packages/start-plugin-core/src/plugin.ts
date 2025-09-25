import { trimPathRight } from '@tanstack/router-core'
import { VIRTUAL_MODULES } from '@tanstack/start-server-core'
import { TanStackServerFnPluginEnv } from '@tanstack/server-functions-plugin'
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
}

export interface ResolvedStartConfig {
  root: string
  startFilePath: string | undefined
  routerFilePath: string
  srcDirectory: string
}

export type GetConfigFn = () => {
  startConfig: TanStackStartOutputConfig
  resolvedStartConfig: ResolvedStartConfig
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
  }

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

  return [
    {
      name: 'tanstack-start-core:config',
      enforce: 'pre',
      async config(viteConfig, { command }) {
        const viteAppBase = trimPathRight(viteConfig.base || '/')
        globalThis.TSS_APP_BASE = viteAppBase

        const root = viteConfig.root || process.cwd()
        resolvedStartConfig.root = root

        const { startConfig } = getConfig()
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
              return startPackageName in peerDependencies
            }

            return false
          },
        })

        return {
          base: viteAppBase,
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
                      ?.build?.rollupOptions?.input ?? ENTRY_POINTS.server,
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

            ...defineReplaceEnv('TSS_SERVER_FN_BASE', startConfig.serverFns.base),
            ...defineReplaceEnv('TSS_CLIENT_OUTPUT_DIR', getClientOutputDirectory(viteConfig)),
            ...defineReplaceEnv('TSS_APP_BASE', viteAppBase),
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
              const serverBundle = getBundle(VITE_ENVIRONMENT_NAMES.server)
              await postServerBuild({ builder, startConfig, serverBundle })
            },
          },
        }
      },
    },
    tanStackStartRouter(startPluginOpts, getConfig, corePluginOpts),
    // N.B. TanStackStartCompilerPlugin must be before the TanStackServerFnPluginEnv
    startCompilerPlugin(corePluginOpts.framework),
    createServerFnPlugin(corePluginOpts.framework),

    TanStackServerFnPluginEnv({
      // This is the ID that will be available to look up and import
      // our server function manifest and resolve its module
      manifestVirtualImportId: VIRTUAL_MODULES.serverFnManifest,
      client: {
        getRuntimeCode: () =>
          `import { createClientRpc } from '@tanstack/${corePluginOpts.framework}-start/client'`,
        replacer: (d) => `createClientRpc('${d.functionId}')`,
        envName: VITE_ENVIRONMENT_NAMES.client,
      },
      server: {
        getRuntimeCode: () =>
          `import { createServerRpc } from '@tanstack/${corePluginOpts.framework}-start/server'`,
        replacer: (d) => `createServerRpc('${d.functionId}', ${d.fn})`,
        envName: VITE_ENVIRONMENT_NAMES.server,
      },
    }),
    loadEnvPlugin(),
    startManifestPlugin({
      getClientBundle: () => getBundle(VITE_ENVIRONMENT_NAMES.client),
    }),
    devServerPlugin({ getConfig }),
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
