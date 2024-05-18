import path from 'path'
import { fileURLToPath } from 'url'
import reactRefresh from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { resolve } from 'import-meta-resolve'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'
import { createApp } from 'vinxi'
import { normalize } from 'vinxi/lib/path'
import { config } from 'vinxi/plugins/config'
// @ts-expect-error
import { serverFunctions } from '@vinxi/server-functions/plugin'
// @ts-expect-error
import { serverTransform } from '@vinxi/server-functions/server'
import type * as vite from 'vite'

function startVite() {
  return config('start-vite', {
    ssr: {
      noExternal: ['@tanstack/start'],
    },
    // optimizeDeps: {
    //   include: ['@tanstack/start/server-runtime'],
    // },
    // resolve: {
    //   dedupe: ['vinxi'],
    // },
  })
}

export function defineConfig(opts?: {
  vite?: {
    plugins?: () => Array<vite.Plugin>
  }
  routers?: {
    client?: {
      vite?: {
        plugins?: () => Array<vite.Plugin>
      }
    }
  }
}) {
  return createApp({
    server: {
      preset: 'vercel',
      experimental: {
        asyncContext: true,
      },
    },
    routers: [
      {
        name: 'public',
        type: 'static',
        dir: './public',
        base: '/',
      },
      startRouterProxy({
        name: 'ssr',
        type: 'http',
        handler: './app/server.tsx',
        target: 'server',
        plugins: () => [
          startVite(),
          ...(opts?.vite?.plugins?.() || []),
          serverTransform({
            runtime: '@tanstack/start/server-runtime',
          }),
        ],
        link: {
          client: 'client',
        },
      }),
      startRouterProxy({
        name: 'client',
        type: 'client',
        handler: './app/client.tsx',
        target: 'browser',
        base: '/_build',
        build: {
          sourcemap: true,
        },
        plugins: () => [
          startVite(),
          ...(opts?.vite?.plugins?.() || []),
          ...(opts?.routers?.client?.vite?.plugins?.() || []),
          serverFunctions.client({
            runtime: '@tanstack/start/client-runtime',
          }),
          reactRefresh(),
        ],
      }),
      startRouterProxy(
        serverFunctions.router({
          name: 'server',
          plugins: () => [startVite(), ...(opts?.vite?.plugins?.() || [])],
          // For whatever reason, vinxi expects a path relative
          // to the project here. This is a workaround for that.
          handler: importToProjectRelative('@tanstack/start/server-handler'),
          runtime: '@tanstack/start/server-runtime',
        }),
      ),
    ],
  })
}

function startRouterProxy(router: any) {
  return {
    ...router,
    plugins: async () => [
      TanStackRouterVite({
        experimental: {
          enableCodeSplitting: true,
        },
      }),
      ...((await router?.plugins?.()) ?? []),
    ],
  }
}

// function resolveRelativePath(p: string) {
//   return path.relative(
//     process.cwd(),
//     resolve(p, import.meta.url)
//       .split('://')
//       .at(-1)!,
//   )
// }

function importToProjectRelative(p: string) {
  const toAbsolute = (file: string) => file.split('://').at(-1)!

  const resolved = toAbsolute(resolve(p, import.meta.url))

  const relative = path.relative(process.cwd(), resolved)

  return relative
}
