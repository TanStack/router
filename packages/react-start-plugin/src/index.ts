import { TanStackServerFnPluginEnv } from '@tanstack/server-functions-plugin'
import { createNitro } from 'nitropack'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { mergeConfig } from 'vite'
import { getTanStackStartOptions } from './schema.js'
import { nitroPlugin } from './nitro/nitro-plugin.js'
import { tsrManifestPlugin } from './routesManifestPlugin.js'
import { TanStackStartCompilerPlugin } from './start-compiler-plugin.js'
import type { PluginOption } from 'vite'
import type { TanStackStartInputConfig } from './schema.js'

export type {
  TanStackStartInputConfig,
  TanStackStartOutputConfig,
} from './schema.js'

export function TanStackStartVitePlugin(
  opts?: TanStackStartInputConfig,
): Array<PluginOption> {
  const options = getTanStackStartOptions(opts)

  return [
    {
      name: 'tss-vite-config-client',
      ...options.vite,
      async config(config) {
        // Create a dummy nitro app to get the resolved public output path
        const dummyNitroApp = await createNitro({
          preset: options.server.preset,
          compatibilityDate: '2024-12-01',
        })

        const nitroOutputPublicDir = dummyNitroApp.options.output.publicDir
        await dummyNitroApp.close()

        config.environments = {
          ...(config.environments ?? {}),
          server: {
            ...(config.environments?.server ?? {}),
          },
        }

        return mergeConfig(config, {
          resolve: {
            noExternal: [
              '@tanstack/start',
              '@tanstack/start/server',
              '@tanstack/start-client',
              '@tanstack/start-server',
              '@tanstack/start-server-functions-fetcher',
              '@tanstack/start-server-functions-client',
              '@tanstack/start-server-functions-ssr',
              '@tanstack/start-server-functions-server',
              '@tanstack/start-router-manifest',
              '@tanstack/start-config',
              '@tanstack/start-api-routes',
              '@tanstack/server-functions-plugin',
              'tsr:start-manifest',
              'tsr:server-fn-manifest',
            ],
          },
          optimizeDeps: {
            entries: [],
            ...(options.vite?.optimizeDeps || {}),
          },
          /* prettier-ignore */
          define: {
            ...(options.vite?.define || {}),
            ...injectDefineEnv('TSS_PUBLIC_BASE', options.routers.public.base),
            ...injectDefineEnv('TSS_CLIENT_BASE', options.routers.client.base),
            ...injectDefineEnv('TSS_CLIENT_ENTRY', options.clientEntryPath),
            ...injectDefineEnv('TSS_SERVER_FN_BASE', options.routers.server.base),
            ...injectDefineEnv('TSS_OUTPUT_PUBLIC_DIR', nitroOutputPublicDir),
          },
        })
      },
      configEnvironment(env, config) {
        if (env === 'server') {
          config = mergeConfig(config, {
            plugins: [],
          })

          config = mergeConfig(
            mergeConfig(config, options.vite || {}),
            options.routers.server.vite || {},
          )
        } else {
          config = mergeConfig(
            mergeConfig(config, options.vite || {}),
            options.routers.client.vite || {},
          )
        }

        return config
      },
    },
    TanStackStartCompilerPlugin(),
    TanStackServerFnPluginEnv({
      // This is the ID that will be available to look up and import
      // our server function manifest and resolve its module
      manifestVirtualImportId: 'tsr:server-fn-manifest',
      client: {
        getRuntimeCode: () =>
          `import { createClientRpc } from '@tanstack/react-start/server-functions-client'`,
        replacer: (d) =>
          `createClientRpc('${d.functionId}', '${options.routers.server.base}')`,
      },
      server: {
        getRuntimeCode: () =>
          `import { createServerRpc } from '@tanstack/react-start/server-functions-server'`,
        replacer: (d) =>
          `createServerRpc('${d.functionId}', '${options.routers.server.base}', ${d.fn})`,
      },
    }),
    tsrManifestPlugin({
      clientBase: options.routers.client.base,
      tsrConfig: options.tsr,
    }),
    TanStackRouterVite({
      ...options.tsr,
      enableRouteGeneration: true,
      __enableAPIRoutesGeneration: true,
      autoCodeSplitting: true,
    }),
    viteReact(options.react),
    nitroPlugin(options),
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

// function isEmptyPrerenderRoutes(options?: Options): boolean {
//   if (!options || isArrayWithElements(nitroConfig.prerender?.routes)) {
//     return false
//   }
//   return !options.server.prerender?.routes
// }
