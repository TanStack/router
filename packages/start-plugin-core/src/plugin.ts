import path from 'node:path'
import { createNitro } from 'nitropack'
import { trimPathRight } from '@tanstack/router-core'
import { VIRTUAL_MODULES } from '@tanstack/start-server-core'
import { TanStackServerFnPluginEnv } from '@tanstack/server-functions-plugin'
import * as vite from 'vite'
import { createTanStackConfig } from './schema'
import { nitroPlugin } from './nitro-plugin/plugin'
import { startManifestPlugin } from './start-manifest-plugin/plugin'
import { startCompilerPlugin } from './start-compiler-plugin'
import {
  CLIENT_DIST_DIR,
  SSR_ENTRY_FILE,
  VITE_ENVIRONMENT_NAMES,
} from './constants'
import { tanStackStartRouter } from './start-router-plugin/plugin'
import { loadEnvPlugin } from './load-env-plugin/plugin'
import { devServerPlugin } from './dev-server-plugin/plugin'
import { resolveVirtualEntriesPlugin } from './resolve-virtual-entries-plugin/plugin'
import type { createTanStackStartOptionsSchema } from './schema'
import type { PluginOption, Rollup } from 'vite'
import type { z } from 'zod'
import type { CompileStartFrameworkOptions } from './compilers'

export type TanStackStartInputConfig = z.input<
  ReturnType<typeof createTanStackStartOptionsSchema>
>

const defaultConfig = createTanStackConfig()
export function getTanStackStartOptions(opts?: TanStackStartInputConfig) {
  return defaultConfig.parse(opts)
}

export type TanStackStartOutputConfig = ReturnType<
  typeof getTanStackStartOptions
>

export interface TanStackStartVitePluginCoreOptions {
  framework: CompileStartFrameworkOptions
  getVirtualServerRootHandler: (ctx: {
    routerFilepath: string
    serverEntryFilepath: string
  }) => string
  getVirtualServerEntry: (ctx: { routerFilepath: string }) => string
  getVirtualClientEntry: (ctx: { routerFilepath: string }) => string
}
// this needs to live outside of the TanStackStartVitePluginCore since it will be invoked multiple times by vite
let ssrBundle: Rollup.OutputBundle

export function TanStackStartVitePluginCore(
  opts: TanStackStartVitePluginCoreOptions,
  startConfig: TanStackStartOutputConfig,
): Array<PluginOption> {
  return [
    tanStackStartRouter({
      ...startConfig.tsr,
      target: opts.framework,
      autoCodeSplitting: true,
    }),
    resolveVirtualEntriesPlugin(opts, startConfig),
    {
      name: 'tanstack-start-core:config-client',
      async config(viteConfig) {
        const viteAppBase = trimPathRight(viteConfig.base || '/')
        globalThis.TSS_APP_BASE = viteAppBase

        const nitroOutputPublicDir = await (async () => {
          // Create a dummy nitro app to get the resolved public output path
          const dummyNitroApp = await createNitro({
            preset: startConfig.target,
            compatibilityDate: '2024-12-01',
          })

          const nitroOutputPublicDir = dummyNitroApp.options.output.publicDir
          await dummyNitroApp.close()

          return nitroOutputPublicDir
        })()

        return {
          base: viteAppBase,
          environments: {
            [VITE_ENVIRONMENT_NAMES.client]: {
              consumer: 'client',
              build: {
                manifest: true,
                rollupOptions: {
                  input: {
                    main: getClientEntryPath(startConfig),
                  },
                  output: {
                    dir: path.resolve(startConfig.root, CLIENT_DIST_DIR),
                  },
                  // TODO: this should be removed
                  external: ['node:fs', 'node:path', 'node:os', 'node:crypto'],
                },
              },
            },
            [VITE_ENVIRONMENT_NAMES.server]: {
              consumer: 'server',
              build: {
                ssr: true,
                // we don't write to the file system as the below 'capture-output' plugin will
                // capture the output and write it to the virtual file system
                write: false,
                copyPublicDir: false,
                rollupOptions: {
                  output: {
                    entryFileNames: SSR_ENTRY_FILE,
                  },
                  plugins: [
                    {
                      name: 'capture-output',
                      generateBundle(_options, bundle) {
                        // TODO: can this hook be called more than once?
                        ssrBundle = bundle
                      },
                    },
                  ],
                },
                commonjsOptions: {
                  include: [/node_modules/],
                },
              },
            },
          },
          resolve: {
            noExternal: [
              '@tanstack/start-client',
              '@tanstack/start-client-core',
              '@tanstack/start-server',
              '@tanstack/start-server-core',
              '@tanstack/start-server-functions-fetcher',
              '@tanstack/start-server-functions-client',
              '@tanstack/start-server-functions-server',
              '@tanstack/start-router-manifest',
              '@tanstack/start-config',
              '@tanstack/server-functions-plugin',
              'nitropack',
              '@tanstack/**start**',
              ...Object.values(VIRTUAL_MODULES),
            ],
          },
          optimizeDeps: {
            exclude: [...Object.values(VIRTUAL_MODULES)],
          },
          /* prettier-ignore */
          define: {
            // define is an esbuild function that replaces the any instances of given keys with the given values
            // i.e: __FRAMEWORK_NAME__ can be replaced with JSON.stringify("TanStack Start")
            // This is not the same as injecting environment variables.

            ...defineReplaceEnv('TSS_SERVER_FN_BASE', startConfig.serverFns.base),
            ...defineReplaceEnv('TSS_OUTPUT_PUBLIC_DIR', nitroOutputPublicDir),
            ...defineReplaceEnv('TSS_APP_BASE', viteAppBase),
            ...defineReplaceEnv('TSS_SPA_MODE', startConfig.spa?.enabled ? 'true' : 'false'),
          },
        }
      },
    },
    // N.B. TanStackStartCompilerPlugin must be before the TanStackServerFnPluginEnv
    startCompilerPlugin(opts.framework, {
      client: { envName: VITE_ENVIRONMENT_NAMES.client },
      server: { envName: VITE_ENVIRONMENT_NAMES.server },
    }),
    TanStackServerFnPluginEnv({
      // This is the ID that will be available to look up and import
      // our server function manifest and resolve its module
      manifestVirtualImportId: VIRTUAL_MODULES.serverFnManifest,
      client: {
        getRuntimeCode: () =>
          `import { createClientRpc } from '@tanstack/${opts.framework}-start/server-functions-client'`,
        replacer: (d) =>
          `createClientRpc('${d.functionId}', '${startConfig.serverFns.base}')`,
        envName: VITE_ENVIRONMENT_NAMES.client,
      },
      server: {
        getRuntimeCode: () =>
          `import { createServerRpc } from '@tanstack/${opts.framework}-start/server-functions-server'`,
        replacer: (d) =>
          `createServerRpc('${d.functionId}', '${startConfig.serverFns.base}', ${d.fn})`,
        envName: VITE_ENVIRONMENT_NAMES.server,
      },
    }),
    loadEnvPlugin(startConfig),
    startManifestPlugin({ clientEntry: getClientEntryPath(startConfig) }),
    devServerPlugin(),
    nitroPlugin(startConfig, () => ssrBundle),
    {
      name: 'tanstack-start:core:capture-client-bundle',
      applyToEnvironment(e) {
        return e.name === VITE_ENVIRONMENT_NAMES.client
      },
      enforce: 'post',
      generateBundle(_options, bundle) {
        globalThis.TSS_CLIENT_BUNDLE = bundle
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

const getClientEntryPath = (startConfig: TanStackStartOutputConfig) => {
  // when the user specifies a custom client entry path, we need to resolve it
  // relative to the root of the project, keeping in mind that if not specified
  // it will be /~start/default-client-entry which is a virtual path
  // that is resolved by vite to the actual client entry path
  const entry = startConfig.clientEntryPath.startsWith(
    '/~start/default-client-entry',
  )
    ? startConfig.clientEntryPath
    : vite.normalizePath(
        path.join(
          '/@fs',
          path.resolve(startConfig.root, startConfig.clientEntryPath),
        ),
      )

  return entry
}
