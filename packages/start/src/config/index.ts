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
import { serverComponents } from '@vinxi/server-components/plugin'
// @ts-expect-error
import { serverFunctions } from '@vinxi/server-functions/plugin'
// @ts-expect-error
import { serverTransform } from '@vinxi/server-functions/server'
import { z } from 'zod'
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

const viteSchema = z.object({
  plugins: z.function().returns(z.array(z.custom<vite.Plugin>())).optional(),
})

const babelSchema = z.object({
  plugins: z
    .array(z.union([z.tuple([z.string(), z.any()]), z.string()]))
    .optional(),
})

const reactSchema = z.object({
  babel: babelSchema.optional(),
})

const routersSchema = z.object({
  ssr: z
    .object({
      entry: z.string().optional(),
      vite: viteSchema.optional(),
    })
    .optional(),
  rsc: z
    .object({
      vite: viteSchema.optional(),
    })
    .optional(),
  client: z
    .object({
      entry: z.string().optional(),
      vite: viteSchema.optional(),
    })
    .optional(),
  server: z
    .object({
      vite: viteSchema.optional(),
    })
    .optional(),
})

const optsSchema = z
  .object({
    react: reactSchema.optional(),
    vite: viteSchema.optional(),
    routers: routersSchema.optional(),
  })
  .optional()

export function defineConfig(opts?: z.infer<typeof optsSchema>) {
  optsSchema.parse(opts)

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
      // startRouterProxy({
      //   name: 'rsc',
      //   worker: true,
      //   type: 'http',
      //   base: '/_rsc',
      //   handler: './app/react-server.tsx',
      //   target: 'server',
      //   plugins: () => [
      //     startVite(),
      //     ...(opts?.vite?.plugins?.() || []),
      //     ...(opts?.routers?.rsc?.vite?.plugins?.() || []),
      //     serverComponents.server(),
      //     reactRefresh(),
      //   ],
      // }),
      startRouterProxy({
        name: 'ssr',
        type: 'http',
        handler: opts?.routers?.ssr?.entry || './app/server.tsx',
        target: 'server',
        plugins: () => [
          startVite(),
          ...(opts?.vite?.plugins?.() || []),
          ...(opts?.routers?.ssr?.vite?.plugins?.() || []),
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
        handler: opts?.routers?.client?.entry || './app/client.tsx',
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
          reactRefresh({
            babel: opts?.react?.babel,
          }),
          // serverComponents.client(),
        ],
      }),
      startRouterProxy(
        serverFunctions.router({
          name: 'server',
          plugins: () => [
            startVite(),
            ...(opts?.vite?.plugins?.() || []),
            ...(opts?.routers?.server?.vite?.plugins?.() || []),
            // serverComponents.serverActions(),
          ],
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
