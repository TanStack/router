import path from 'node:path'
import { TanStackServerFnPluginEnv } from '@tanstack/server-functions-plugin'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { createNitro } from 'nitropack'
import { getTanStackStartOptions } from './schema.js'
import { nitroPlugin } from './nitro/nitro-plugin.js'
import { startManifestPlugin } from './routesManifestPlugin.js'
import { TanStackStartCompilerPlugin } from './start-compiler-plugin.js'
import { TanStackStartServerRoutesVite } from './start-server-routes-plugin/index.js'
import type { PluginOption } from 'vite'
import type { TanStackStartInputConfig, WithReactPlugin } from './schema.js'

export type {
  TanStackStartInputConfig,
  TanStackStartOutputConfig,
  WithReactPlugin,
} from './schema.js'

declare global {
  interface ImportMeta {
    env: {
      HOST: string
    }
  }
}

export const clientDistDir = 'node_modules/.tanstack-start/client-dist'

export function TanStackStartVitePlugin(
  opts?: TanStackStartInputConfig & WithReactPlugin,
): Array<PluginOption> {
  type OptionsWithReact = ReturnType<typeof getTanStackStartOptions> &
    WithReactPlugin
  const options: OptionsWithReact = getTanStackStartOptions(opts)

  return [
    {
      name: 'tss-vite-config-client',
      async config() {
        const nitroOutputPublicDir = await (async () => {
          // Create a dummy nitro app to get the resolved public output path
          const dummyNitroApp = await createNitro({
            preset: options.target,
            compatibilityDate: '2024-12-01',
          })

          const nitroOutputPublicDir = dummyNitroApp.options.output.publicDir
          await dummyNitroApp.close()

          return nitroOutputPublicDir
        })()

        return {
          environments: {
            client: {
              build: {
                manifest: true,
                rollupOptions: {
                  input: {
                    main: options.clientEntryPath,
                  },
                  output: {
                    dir: path.resolve(options.root, clientDistDir),
                  },
                  external: ['node:fs', 'node:path', 'node:os', 'node:crypto'],
                },
              },
            },
            server: {},
          },
          resolve: {
            noExternal: [
              "@tanstack/react-start",
              "@tanstack/react-start-server",
              '@tanstack/start',
              '@tanstack/start/server',
              '@tanstack/start-client',
              '@tanstack/start-client-core',
              '@tanstack/start-server',
              '@tanstack/start-server-core',
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
              "nitropack",
            ],
          },
          /* prettier-ignore */
          define: {
            ...injectDefineEnv('TSS_PUBLIC_BASE', options.public.base),
            ...injectDefineEnv('TSS_CLIENT_BASE', options.client.base),
            ...injectDefineEnv('TSS_CLIENT_ENTRY', options.clientEntryPath),
            ...injectDefineEnv('TSS_SERVER_FN_BASE', options.serverFns.base),
            ...injectDefineEnv('TSS_OUTPUT_PUBLIC_DIR', nitroOutputPublicDir),
          },
        }
      },
      resolveId(id) {
        if (
          [
            '/~start/default-server-entry',
            '/~start/default-client-entry',
          ].includes(id)
        ) {
          return `${id}.tsx`
        }

        return null
      },
      load(id) {
        const routerImportPath = JSON.stringify(
          path.resolve(options.root, options.tsr.srcDirectory, 'router'),
        )

        if (id === '/~start/default-client-entry.tsx') {
          return `
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start'
import { createRouter } from ${routerImportPath}

const router = createRouter()

hydrateRoot(document, <StartClient router={router} />)
`
        }

        if (id === '/~start/default-server-entry.tsx') {
          return `
import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import { createRouter } from ${routerImportPath}

export default createStartHandler({
  createRouter,
})(defaultStreamHandler)
`
        }

        return null
      },
      // configureServer(server) {
      //   server.httpServer?.on('listening', () => {
      //     const address = (() => {
      //       const address = server.httpServer?.address()

      //       if (!address) {
      //         throw new Error('No local address found!')
      //       }

      //       if (typeof address === 'string') {
      //         return `http://localhost:${address}`
      //       }

      //       return `http://localhost:${address.port}`
      //     })()

      //     process.env.HOST = import.meta.env.HOST = `${address}`
      //   })
      // },
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
          `createClientRpc('${d.functionId}', '${options.serverFns.base}')`,
      },
      server: {
        getRuntimeCode: () =>
          `import { createServerRpc } from '@tanstack/react-start/server-functions-server'`,
        replacer: (d) =>
          `createServerRpc('${d.functionId}', '${options.serverFns.base}', ${d.fn})`,
      },
    }),
    startManifestPlugin(options),
    TanStackRouterVite({
      ...options.tsr,
      target: 'react',
      enableRouteGeneration: true,
      autoCodeSplitting: true,
    }),
    TanStackStartServerRoutesVite({
      ...options.tsr,
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

export { compileStartOutput } from './compilers'
