import path from 'node:path'
import { createTanStackServerFnPlugin } from '@tanstack/server-functions-plugin'
import { mergeConfig, perEnvironmentPlugin } from 'vite'
import viteReact from '@vitejs/plugin-react'
import { createNitro } from 'nitropack'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import { createTanStackStartPlugin } from './server-fns.js'
import { getTanStackStartOptions } from './schema.js'
import { nitroPlugin } from './nitro/nitro-plugin.js'
import { tsrRoutesManifestPlugin } from './routesManifestPlugin.js'
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

  const TanStackServerFnsPlugin = createTanStackServerFnPlugin({
    // This is the ID that will be available to look up and import
    // our server function manifest and resolve its module
    manifestVirtualImportId: 'tsr:server-fn-manifest',
    client: {
      getRuntimeCode: () =>
        `import { createClientRpc } from '@tanstack/react-start/server-functions-client'`,
      replacer: (d) =>
        `createClientRpc('${d.functionId}', '${options.routers.server.base}')`,
    },
    ssr: {
      getRuntimeCode: () =>
        `import { createSsrRpc } from '@tanstack/react-start/server-functions-ssr'`,
      replacer: (d) =>
        `createSsrRpc('${d.functionId}', '${options.routers.server.base}')`,
    },
    server: {
      getRuntimeCode: () =>
        `import { createServerRpc } from '@tanstack/react-start/server-functions-server'`,
      replacer: (d) =>
        `createServerRpc('${d.functionId}', '${options.routers.server.base}', ${d.fn})`,
    },
  })

  const TanStackStartPlugin = createTanStackStartPlugin({
    globalMiddlewareEntry: options.routers.server.globalMiddlewareEntry,
  })

  const globalPlugins: Array<PluginOption> = [
    {
      name: 'tss-vite-config-client',
      ...options.vite,
      async config() {
        // Create a dummy nitro app to get the resolved public output path
        const dummyNitroApp = await createNitro({
          preset: options.server.preset,
          compatibilityDate: '2024-12-01',
        })

        const nitroOutputPublicDir = dummyNitroApp.options.output.publicDir
        await dummyNitroApp.close()

        return {
          resolve: {
            noExternal: [
              '@tanstack/start',
              '@tanstack/start/server',
              '@tanstack/start-client',
              '@tanstack/start-server',
              '@tanstack/start-server-functions-fetcher',
              '@tanstack/start-server-functions-handler',
              '@tanstack/start-server-functions-client',
              '@tanstack/start-server-functions-ssr',
              '@tanstack/start-server-functions-server',
              '@tanstack/start-router-manifest',
              '@tanstack/start-config',
              '@tanstack/start-api-routes',
              '@tanstack/server-functions-plugin',
              'tsr:routes-manifest',
              'tsr:server-fn-manifest',
            ],
          },
          optimizeDeps: {
            entries: [],
            ...(options.vite?.optimizeDeps || {}),
          },
          define: {
            ...(options.vite?.define || {}),
            ...injectDefineEnv('TSS_PUBLIC_BASE', options.routers.public.base),
            ...injectDefineEnv('TSS_CLIENT_BASE', options.routers.client.base),
            ...injectDefineEnv('TSS_API_BASE', options.routers.server.base),
            ...injectDefineEnv('TSS_OUTPUT_PUBLIC_DIR', nitroOutputPublicDir),
          },
        }
      },
      configEnvironment(env, config) {
        if (env === 'client') {
          return mergeConfig(config, options.routers.client.vite || {})
        }

        if (env === 'ssr') {
          return mergeConfig(config, options.routers.ssr.vite || {})
        }

        return config
      },
    },
    TanStackRouterVite({
      ...options.tsr,
      enableRouteGeneration: true,
      autoCodeSplitting: true,
    }),
    viteReact(options.react),
  ]

  return [
    perEnvironmentPlugin('tanstack-start-plugin-client', (environment) =>
      environment.name === 'client'
        ? TanStackStartPlugin.client
        : TanStackStartPlugin.server,
    ),
    ...globalPlugins,
    perEnvironmentPlugin(
      'tanstack-server-fns-plugin-client-server',
      (environment) =>
        environment.name === 'client'
          ? TanStackServerFnsPlugin.client
          : TanStackServerFnsPlugin.server,
    ),
    // perEnvironmentPlugin(
    //   'tanstack-router-manifest-plugin',
    //   (environment) =>
    //     environment.name === 'ssr' &&
    //     tsrRoutesManifestPlugin({
    //       clientBase: options.routers.client.base,
    //       tsrConfig: options.tsr,
    //     }),
    // ),
    // TODO: Should this only be loaded for ssr? like above?
    tsrRoutesManifestPlugin({
      clientBase: options.routers.client.base,
      tsrConfig: options.tsr,
    }),
    nitroPlugin({
      ...options,
      server: {
        ...options.server,
        handlers: [
          ...(options.hasApiEntry
            ? [
                {
                  route: options.routers.api.base,
                  handler: path.join(
                    options.root,
                    options.tsr.appDirectory,
                    options.routers.api.entry,
                  ),
                },
              ]
            : []),
        ],
      },
      plugins: [
        TanStackStartPlugin.server,
        ...globalPlugins,
        TanStackServerFnsPlugin.server,
      ],
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

// function isEmptyPrerenderRoutes(options?: Options): boolean {
//   if (!options || isArrayWithElements(nitroConfig.prerender?.routes)) {
//     return false
//   }
//   return !options.server.prerender?.routes
// }
