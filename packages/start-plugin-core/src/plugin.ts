import path from 'node:path'
import { createNitro } from 'nitropack'
import {
  createTanStackConfig,
  createTanStackStartOptionsSchema,
} from './schema'
import { nitroPlugin } from './nitro/nitro-plugin'
import { startManifestPlugin } from './routesManifestPlugin'
import { TanStackStartCompilerPlugin } from './start-compiler-plugin'
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

// this needs to live outside of the TanStackStartVitePluginCore since it will be invoked multiple times by vite
let ssrBundle: Rollup.OutputBundle

export function TanStackStartVitePluginCore(
  framework: CompileStartFrameworkOptions,
  opts: TanStackStartOutputConfig,
): Array<PluginOption> {
  return [
    {
      name: 'tanstack-start-core:config-client',
      async config() {
        const nitroOutputPublicDir = await (async () => {
          // Create a dummy nitro app to get the resolved public output path
          const dummyNitroApp = await createNitro({
            preset: opts.target,
            compatibilityDate: '2024-12-01',
          })

          const nitroOutputPublicDir = dummyNitroApp.options.output.publicDir
          await dummyNitroApp.close()

          return nitroOutputPublicDir
        })()

        return {
          environments: {
            client: {
              consumer: 'client',
              build: {
                manifest: true,
                rollupOptions: {
                  input: {
                    main: opts.clientEntryPath,
                  },
                  output: {
                    dir: path.resolve(opts.root, clientDistDir),
                  },
                  // TODO this should be removed
                  external: ['node:fs', 'node:path', 'node:os', 'node:crypto'],
                },
              },
            },
            server: {
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
              'tanstack:start-manifest',
              'tanstack:server-fn-manifest',
              'nitropack',
              '@tanstack/**',
            ],
            external: ['undici'],
          },
          /* prettier-ignore */
          define: {
            ...injectDefineEnv('TSS_PUBLIC_BASE', opts.public.base),
            ...injectDefineEnv('TSS_CLIENT_BASE', opts.client.base),
            ...injectDefineEnv('TSS_CLIENT_ENTRY', opts.clientEntryPath),
            ...injectDefineEnv('TSS_SERVER_FN_BASE', opts.serverFns.base),
            ...injectDefineEnv('TSS_OUTPUT_PUBLIC_DIR', nitroOutputPublicDir),
          },
        }
      },
    },
    TanStackStartCompilerPlugin(framework),
    startManifestPlugin(opts),
    nitroPlugin(opts, () => ssrBundle),
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
