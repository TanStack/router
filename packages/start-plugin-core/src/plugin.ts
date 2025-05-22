import path from 'node:path'
import { createNitro } from 'nitropack'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { TanStackServerFnPluginEnv } from '@tanstack/server-functions-plugin'
import * as vite from 'vite'
import {
  createTanStackConfig,
  createTanStackStartOptionsSchema,
} from './schema'
import { nitroPlugin } from './nitro/nitro-plugin'
import { startManifestPlugin } from './routesManifestPlugin'
import { TanStackStartCompilerPlugin } from './start-compiler-plugin'
import { VITE_ENVIRONMENT_NAMES } from './constants'
import { TanStackStartServerRoutesVite } from './start-server-routes-plugin/plugin'
import type { PluginOption, Rollup } from 'vite'
import type { z } from 'zod'
import type { CompileStartFrameworkOptions } from './compilers'

const TanStackStartOptionsSchema = createTanStackStartOptionsSchema()
export type TanStackStartInputConfig = z.input<
  typeof TanStackStartOptionsSchema
>

const defaultConfig = createTanStackConfig()
export function getTanStackStartOptions(opts?: TanStackStartInputConfig) {
  return defaultConfig.parse(opts)
}

export type TanStackStartOutputConfig = ReturnType<
  typeof getTanStackStartOptions
>

export const clientDistDir = '.tanstack-start/build/client-dist'
export const ssrEntryFile = 'ssr.mjs'

export interface TanStackStartVitePluginCoreOptions {
  framework: CompileStartFrameworkOptions
}
// this needs to live outside of the TanStackStartVitePluginCore since it will be invoked multiple times by vite
let ssrBundle: Rollup.OutputBundle

export function TanStackStartVitePluginCore(
  opts: TanStackStartVitePluginCoreOptions,
  startConfig: TanStackStartOutputConfig,
): Array<PluginOption> {
  return [
    tanstackRouter({
      verboseFileRoutes: false,
      ...startConfig.tsr,
      target: opts.framework,
      enableRouteGeneration: true,
      autoCodeSplitting: true,
    }),
    {
      name: 'tanstack-start-core:config-client',
      async config() {
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

        return {
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
                    dir: path.resolve(startConfig.root, clientDistDir),
                  },
                  // TODO this should be removed
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
                    entryFileNames: ssrEntryFile,
                  },
                  plugins: [
                    {
                      name: 'capture-output',
                      generateBundle(options, bundle) {
                        // TODO can this hook be called more than once?
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
              'tanstack-start-router-manifest:v',
              'tanstack-start-server-fn-manifest:v',
              'nitropack',
              '@tanstack/**',
            ],
          },
          /* prettier-ignore */
          define: {
            ...injectDefineEnv('TSS_PUBLIC_BASE', startConfig.public.base),
            ...injectDefineEnv('TSS_CLIENT_BASE', startConfig.client.base),
            ...injectDefineEnv('TSS_CLIENT_ENTRY', getClientEntryPath(startConfig)), // This is consumed by the router-manifest, where the entry point is imported after the dev refresh runtime is resolved
            ...injectDefineEnv('TSS_SERVER_FN_BASE', startConfig.serverFns.base),
            ...injectDefineEnv('TSS_OUTPUT_PUBLIC_DIR', nitroOutputPublicDir),
          },
        }
      },
    },
    // N.B. TanStackStartCompilerPlugin must be before the TanStackServerFnPluginEnv
    TanStackStartCompilerPlugin(opts.framework, {
      client: { envName: VITE_ENVIRONMENT_NAMES.client },
      server: { envName: VITE_ENVIRONMENT_NAMES.server },
    }),
    TanStackServerFnPluginEnv({
      // This is the ID that will be available to look up and import
      // our server function manifest and resolve its module
      manifestVirtualImportId: 'tanstack-start-server-fn-manifest:v',
      manifestOutputFilename:
        '.tanstack-start/build/server/server-functions-manifest.json',
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
      importer: (fn) => {
        const serverEnv = (globalThis as any).viteDevServer.environments[
          VITE_ENVIRONMENT_NAMES.server
        ]
        if (!serverEnv) {
          throw new Error(`'ssr' vite dev environment not found`)
        }
        return serverEnv.runner.import(fn.extractedFilename)
      },
    }),
    startManifestPlugin(startConfig),
    nitroPlugin(startConfig, () => ssrBundle),
    TanStackStartServerRoutesVite({
      ...startConfig.tsr,
      target: opts.framework,
    }),
  ]
}

function injectDefineEnv<TKey extends string, TValue extends string>(
  key: TKey,
  value: TValue,
): { [P in `process.env.${TKey}` | `import.meta.env.${TKey}`]: TValue } {
  return {
    [`process.env.${key}`]: JSON.stringify(value),
    [`import.meta.env.${key}`]: JSON.stringify(value),
  } as { [P in `process.env.${TKey}` | `import.meta.env.${TKey}`]: TValue }
}
