// @ts-nocheck
import path from 'path'
import { fileURLToPath } from 'url'
import { createApp } from 'vinxi'
import reactRefresh from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { resolve } from 'import-meta-resolve'
import { normalize } from 'vinxi/lib/path'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'
import { serverFunctions } from '@vinxi/server-functions/plugin'
import { serverTransform } from '@vinxi/server-functions/server'
import { config } from 'vinxi/plugins/config'
// import type * as vite from 'vite'
// import { config } from 'vinxi/plugins/config'

function startVite() {
  return config('start-vite', {
    ssr: {
      // external: ['@tanstack/start'],
    },
    optimizeDeps: {
      // exclude: ['@tanstack/start'],
    },
  })
}

export function defineConfig(opts) {
  return createApp({
    server: {
      preset: 'vercel',
      experimental: {
        asyncStorage: true,
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
      {
        name: 'ssr',
        type: 'http',
        handler: './app/server.tsx',
        target: 'server',
        plugins: () => [
          startVite(),
          opts.vite?.(),
          TanStackRouterVite({
            experimental: {
              enableCodeSplitting: false,
            },
          }),
          tsconfigPaths(),
          serverTransform({
            runtime: resolveRelativePath('../server-runtime/index.tsx'),
          }),
        ],
        link: {
          client: 'client',
        },
      },
      {
        name: 'client',
        type: 'client',
        handler: './app/client.tsx',
        target: 'browser',
        base: '/_build',
        build: {
          sourcemap: true,
        },
        plugins: () => [
          TanStackRouterVite({
            experimental: {
              enableCodeSplitting: false,
            },
          }),
          startVite(),
          opts.vite?.(),
          tsconfigPaths(),
          serverFunctions.client({
            runtime: resolveRelativePath('../client-runtime/index.tsx'),
          }),
          reactRefresh(),
        ],
      },
      serverFunctions.router({
        name: 'server',
        plugins: () => [startVite(), opts.vite?.(), tsconfigPaths()],
        handler: resolveRelativePath('../server-handler/index.tsx'),
        runtime: resolveRelativePath('../server-runtime/index.tsx'),
      }),
    ],
  })
}

function resolveRelativePath(p) {
  return path.relative(
    process.cwd(),
    resolve(p, import.meta.url)
      .split('://')
      .at(-1),
  )
}
