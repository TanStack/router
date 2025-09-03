import path from 'node:path'
import { trimPathRight } from '@tanstack/router-core'
import { VIRTUAL_MODULES } from '@tanstack/start-server-core'
import { TanStackServerFnPluginEnv } from '@tanstack/server-functions-plugin'
import * as vite from 'vite'
import { crawlFrameworkPkgs } from 'vitefu'
import { join } from 'pathe'
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
import type { TanStackStartInputConfig } from './schema'
import type { PluginOption } from 'vite'
import type { CompileStartFrameworkOptions } from './start-compiler-plugin/compilers'

export interface TanStackStartVitePluginCoreOptions {
  framework: CompileStartFrameworkOptions
  defaultEntryPaths: {
    client: string
    server: string
  }
}

export function TanStackStartVitePluginCore(
  corePluginOpts: TanStackStartVitePluginCoreOptions,
  startPluginOpts: TanStackStartInputConfig,
): Array<PluginOption> {
  const startConfig = parseStartConfig(startPluginOpts)

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
    tanStackStartRouter({
      ...startConfig.router,
      target: corePluginOpts.framework,
      autoCodeSplitting: true,
    }),
    {
      name: 'tanstack-start-core:config',
      async config(viteConfig, { command }) {
        const viteAppBase = trimPathRight(viteConfig.base || '/')
        globalThis.TSS_APP_BASE = viteAppBase

        const root = viteConfig.root || process.cwd()
        const resolvedSrcDirectory = join(root, startConfig.srcDirectory)

        const routerFilePath = resolveEntry({
          type: 'router entry',
          configuredEntry: startConfig.router.entry,
          defaultEntry: 'router',
          root,
          resolvedSrcDirectory,
          required: true,
        })
        const clientEntryPath = resolveEntry({
          type: 'client entry',
          configuredEntry: startConfig.client.entry,
          defaultEntry: 'client',
          root,
          resolvedSrcDirectory,
          required: false,
        })

        const serverEntryPath = resolveEntry({
          type: 'server entry',
          configuredEntry: startConfig.server.entry,
          defaultEntry: 'server',
          root,
          resolvedSrcDirectory,
          required: false,
        })

        let clientAlias: string
        if (clientEntryPath) {
          clientAlias = vite.normalizePath(
            path.join('/@fs', path.resolve(root, clientEntryPath)),
          )
        } else {
          clientAlias = corePluginOpts.defaultEntryPaths.client
        }
        let serverAlias: string
        if (serverEntryPath) {
          serverAlias = vite.normalizePath(path.resolve(root, serverEntryPath))
        } else {
          serverAlias = corePluginOpts.defaultEntryPaths.server
        }
        const entryAliasConfiguration: Record<
          (typeof ENTRY_POINTS)[keyof typeof ENTRY_POINTS],
          string
        > = {
          [ENTRY_POINTS.router]: routerFilePath,
          [ENTRY_POINTS.client]: clientAlias,
          [ENTRY_POINTS.server]: serverAlias,
        }

        // TODO
        /* const nitroOutputPublicDir = await (async () => {
          // Create a dummy nitro app to get the resolved public output path
          const dummyNitroApp = await createNitro({
            preset: startConfig.target,
            compatibilityDate: '2024-12-01',
          })

          const nitroOutputPublicDir = dummyNitroApp.options.output.publicDir
          await dummyNitroApp.close()

          return nitroOutputPublicDir
        })()*/

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
            },
          },
          resolve: {
            noExternal: [
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
    createServerFnPlugin(corePluginOpts.framework),
    // N.B. TanStackStartCompilerPlugin must be before the TanStackServerFnPluginEnv
    startCompilerPlugin(corePluginOpts.framework),
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
    devServerPlugin({ startConfig }),
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
