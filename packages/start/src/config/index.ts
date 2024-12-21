import path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import viteReact from '@vitejs/plugin-react'
import { resolve } from 'import-meta-resolve'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import {
  TanStackStartViteDeadCodeElimination,
  TanStackStartVitePlugin,
} from '@tanstack/start-vite-plugin'
import { getConfig } from '@tanstack/router-generator'
import { createApp } from 'vinxi'
import { config } from 'vinxi/plugins/config'
// // @ts-expect-error
// import { serverComponents } from '@vinxi/server-components/plugin'
import { createTanStackServerFnPlugin } from '@tanstack/directive-functions-plugin'
import { tanstackStartVinxiFileRouter } from './vinxi-file-router.js'
import {
  checkDeploymentPresetInput,
  getUserViteConfig,
  inlineConfigSchema,
  serverSchema,
} from './schema.js'
import type { configSchema } from '@tanstack/router-generator'
import type { z } from 'zod'
import type {
  TanStackStartInputConfig,
  TanStackStartOutputConfig,
} from './schema.js'
import type {
  App as VinxiApp,
  RouterSchemaInput as VinxiRouterSchemaInput,
} from 'vinxi'
import type { Manifest } from '@tanstack/react-router'
import type * as vite from 'vite'

export type {
  TanStackStartInputConfig,
  TanStackStartOutputConfig,
} from './schema.js'

type RouterType = 'client' | 'server' | 'ssr' | 'api'

function setTsrDefaults(config: TanStackStartOutputConfig['tsr']) {
  // Normally these are `./src/___`, but we're using `./app/___` for Start stuff
  const appDirectory = config?.appDirectory ?? './app'
  return {
    ...config,
    appDirectory: config?.appDirectory ?? appDirectory,
    routesDirectory:
      config?.routesDirectory ?? path.join(appDirectory, 'routes'),
    generatedRouteTree:
      config?.generatedRouteTree ?? path.join(appDirectory, 'routeTree.gen.ts'),
  }
}

function mergeSsrOptions(options: Array<vite.SSROptions | undefined>) {
  let ssrOptions: vite.SSROptions = {}
  let noExternal: vite.SSROptions['noExternal'] = []
  for (const option of options) {
    if (!option) {
      continue
    }

    if (option.noExternal) {
      if (option.noExternal === true) {
        noExternal = true
      } else if (noExternal !== true) {
        if (Array.isArray(option.noExternal)) {
          noExternal.push(...option.noExternal)
        } else {
          noExternal.push(option.noExternal)
        }
      }
    }

    ssrOptions = {
      ...ssrOptions,
      ...option,
      noExternal,
    }
  }

  return ssrOptions
}

export function defineConfig(
  inlineConfig: TanStackStartInputConfig = {},
): VinxiApp {
  const opts = inlineConfigSchema.parse(inlineConfig)

  const { preset: configDeploymentPreset, ...serverOptions } =
    serverSchema.parse(opts.server || {})

  const deploymentPreset = checkDeploymentPresetInput(
    configDeploymentPreset || 'node-server',
  )
  const tsr = setTsrDefaults(opts.tsr)
  const appDirectory = tsr.appDirectory

  const tsrConfig = getConfig(tsr)

  const publicDir = opts.routers?.public?.dir || './public'

  const publicBase = opts.routers?.public?.base || '/'
  const clientBase = opts.routers?.client?.base || '/_build'
  const apiBase = opts.tsr?.apiBase || '/api'
  const serverBase = opts.routers?.server?.base || '/_server'

  const apiMiddleware = opts.routers?.api?.middleware || undefined
  const serverMiddleware = opts.routers?.server?.middleware || undefined
  const ssrMiddleware = opts.routers?.ssr?.middleware || undefined

  const clientEntry =
    opts.routers?.client?.entry || path.join(appDirectory, 'client.tsx')
  const ssrEntry =
    opts.routers?.ssr?.entry || path.join(appDirectory, 'ssr.tsx')
  const apiEntry = opts.routers?.api?.entry || path.join(appDirectory, 'api.ts')

  const apiEntryExists = existsSync(apiEntry)

  const TanStackServerFnsPlugin = createTanStackServerFnPlugin()

  let vinxiApp = createApp({
    server: {
      ...serverOptions,
      preset: deploymentPreset,
      experimental: {
        ...serverOptions.experimental,
        asyncContext: true,
      },
    },
    routers: [
      {
        name: 'public',
        type: 'static',
        dir: publicDir,
        base: publicBase,
      },
      withStartPlugins(
        opts,
        'client',
      )({
        name: 'client',
        type: 'client',
        target: 'browser',
        handler: clientEntry,
        base: clientBase,
        build: {
          sourcemap: true,
        },
        plugins: () => {
          const viteConfig = getUserViteConfig(opts.vite)
          const clientViteConfig = getUserViteConfig(opts.routers?.client?.vite)

          return [
            config('tss-vite-config-client', {
              ...viteConfig.userConfig,
              ...clientViteConfig.userConfig,
              define: {
                ...(viteConfig.userConfig.define || {}),
                ...(clientViteConfig.userConfig.define || {}),
                ...injectDefineEnv('TSS_PUBLIC_BASE', publicBase),
                ...injectDefineEnv('TSS_CLIENT_BASE', clientBase),
                ...injectDefineEnv('TSS_SERVER_BASE', serverBase),
                ...injectDefineEnv('TSS_API_BASE', apiBase),
              },
            }),
            ...(viteConfig.plugins || []),
            ...(clientViteConfig.plugins || []),
            TanStackServerFnsPlugin.client,
            viteReact(opts.react),
            // TODO: RSCS - enable this
            // serverComponents.client(),
          ]
        },
      }),
      withStartPlugins(
        opts,
        'ssr',
      )({
        name: 'ssr',
        type: 'http',
        target: 'server',
        handler: ssrEntry,
        middleware: ssrMiddleware,
        plugins: () => {
          const viteConfig = getUserViteConfig(opts.vite)
          const ssrViteConfig = getUserViteConfig(opts.routers?.ssr?.vite)

          return [
            config('tss-vite-config-ssr', {
              ...viteConfig.userConfig,
              ...ssrViteConfig.userConfig,
              define: {
                ...(viteConfig.userConfig.define || {}),
                ...(ssrViteConfig.userConfig.define || {}),
                ...injectDefineEnv('TSS_PUBLIC_BASE', publicBase),
                ...injectDefineEnv('TSS_CLIENT_BASE', clientBase),
                ...injectDefineEnv('TSS_SERVER_BASE', serverBase),
                ...injectDefineEnv('TSS_API_BASE', apiBase),
              },
            }),
            tsrRoutesManifest({
              tsrConfig,
              clientBase,
            }),
            ...(getUserViteConfig(opts.vite).plugins || []),
            ...(getUserViteConfig(opts.routers?.ssr?.vite).plugins || []),
            TanStackServerFnsPlugin.ssr,
            config('start-ssr', {
              ssr: {
                external: ['@vinxi/react-server-dom/client'],
              },
            }),
          ]
        },
        link: {
          client: 'client',
        },
      }),
      withStartPlugins(
        opts,
        'server',
      )({
        name: 'server',
        type: 'http',
        target: 'server',
        base: serverBase,
        middleware: serverMiddleware,
        // TODO: RSCS - enable this
        // worker: true,
        handler: importToProjectRelative('@tanstack/start/server-handler'),
        plugins: () => {
          const viteConfig = getUserViteConfig(opts.vite)
          const serverViteConfig = getUserViteConfig(opts.routers?.server?.vite)

          return [
            config('tss-vite-config-ssr', {
              ...viteConfig.userConfig,
              ...serverViteConfig.userConfig,
              define: {
                ...(viteConfig.userConfig.define || {}),
                ...(serverViteConfig.userConfig.define || {}),
                ...injectDefineEnv('TSS_PUBLIC_BASE', publicBase),
                ...injectDefineEnv('TSS_CLIENT_BASE', clientBase),
                ...injectDefineEnv('TSS_SERVER_BASE', serverBase),
                ...injectDefineEnv('TSS_API_BASE', apiBase),
              },
            }),
            TanStackServerFnsPlugin.server,
            // TODO: RSCS - remove this
            // resolve: {
            //   conditions: [],
            // },
            // TODO: RSCs - add this
            // serverComponents.serverActions({
            //   resolve: {
            //     conditions: [
            //       'react-server',
            //       // 'node',
            //       'import',
            //       process.env.NODE_ENV,
            //     ],
            //   },
            //   runtime: '@vinxi/react-server-dom/runtime',
            //   transpileDeps: ['react', 'react-dom', '@vinxi/react-server-dom'],
            // }),
            ...(viteConfig.plugins || []),
            ...(serverViteConfig.plugins || []),
          ]
        },
      }),
    ],
  })

  // If API routes handler exists, add a router for it
  if (apiEntryExists) {
    vinxiApp = vinxiApp.addRouter({
      name: 'api',
      type: 'http',
      target: 'server',
      base: apiBase,
      handler: apiEntry,
      middleware: apiMiddleware,
      routes: tanstackStartVinxiFileRouter({ tsrConfig, apiBase }),
      plugins: () => {
        const viteConfig = getUserViteConfig(opts.vite)
        const apiViteConfig = getUserViteConfig(opts.routers?.api?.vite)

        return [
          config('tsr-vite-config-api', {
            ...viteConfig.userConfig,
            ...apiViteConfig.userConfig,
            ssr: mergeSsrOptions([
              viteConfig.userConfig.ssr,
              apiViteConfig.userConfig.ssr,
              { noExternal: ['@tanstack/start', 'tsr:routes-manifest'] },
            ]),
            optimizeDeps: {
              entries: [],
              ...(viteConfig.userConfig.optimizeDeps || {}),
              ...(apiViteConfig.userConfig.optimizeDeps || {}),
            },
            define: {
              ...(viteConfig.userConfig.define || {}),
              ...(apiViteConfig.userConfig.define || {}),
              ...injectDefineEnv('TSS_PUBLIC_BASE', publicBase),
              ...injectDefineEnv('TSS_CLIENT_BASE', clientBase),
              ...injectDefineEnv('TSS_SERVER_BASE', serverBase),
              ...injectDefineEnv('TSS_API_BASE', apiBase),
            },
          }),
          TanStackRouterVite({
            ...tsrConfig,
            autoCodeSplitting: true,
            experimental: {
              ...tsrConfig.experimental,
            },
          }),
          ...(viteConfig.plugins || []),
          ...(apiViteConfig.plugins || []),
        ]
      },
    })
  }

  return vinxiApp
}

type TempRouter = Extract<
  VinxiRouterSchemaInput,
  {
    type: 'client' | 'http'
  }
> & {
  base?: string
  link?: {
    client: string
  }
  runtime?: string
  build?: {
    sourcemap?: boolean
  }
}

function withPlugins(prePlugins: Array<any>, postPlugins?: Array<any>) {
  return (router: TempRouter) => {
    return {
      ...router,
      plugins: async () => [
        ...prePlugins,
        ...((await router.plugins?.()) ?? []),
        ...(postPlugins ?? []),
      ],
    }
  }
}

function withStartPlugins(opts: TanStackStartOutputConfig, router: RouterType) {
  const tsrConfig = getConfig(setTsrDefaults(opts.tsr))
  const { userConfig } = getUserViteConfig(opts.vite)
  const { userConfig: routerUserConfig } = getUserViteConfig(
    opts.routers?.[router]?.vite,
  )

  return withPlugins(
    [
      config('start-vite', {
        ...userConfig,
        ...routerUserConfig,
        ssr: mergeSsrOptions([
          userConfig.ssr,
          routerUserConfig.ssr,
          { noExternal: ['@tanstack/start', 'tsr:routes-manifest'] },
        ]),
        optimizeDeps: {
          entries: [],
          ...(userConfig.optimizeDeps || {}),
          ...(routerUserConfig.optimizeDeps || {}),
          // include: ['@tanstack/start/server-runtime'],
        },
      }),
      TanStackRouterVite({
        ...tsrConfig,
        autoCodeSplitting: true,
        experimental: {
          ...tsrConfig.experimental,
        },
      }),
      TanStackStartVitePlugin({
        env: router === 'server' ? 'server' : 'client',
      }),
    ],
    [
      TanStackStartViteDeadCodeElimination({
        env: router === 'client' ? 'client' : 'server',
      }),
    ],
  )
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
  const resolved = fileURLToPath(resolve(p, import.meta.url))

  const relative = path.relative(process.cwd(), resolved)

  return relative
}

function tsrRoutesManifest(opts: {
  tsrConfig: z.infer<typeof configSchema>
  clientBase: string
}): vite.Plugin {
  let config: vite.ResolvedConfig

  return {
    name: 'tsr-routes-manifest',
    configResolved(resolvedConfig) {
      config = resolvedConfig
    },
    resolveId(id) {
      if (id === 'tsr:routes-manifest') {
        return id
      }
      return
    },
    async load(id) {
      if (id === 'tsr:routes-manifest') {
        // If we're in development, return a dummy manifest

        if (config.command === 'serve') {
          return `export default () => ({
            routes: {}
          })`
        }

        const clientViteManifestPath = path.resolve(
          config.build.outDir,
          `../client/${opts.clientBase}/.vite/manifest.json`,
        )

        type ViteManifest = Record<
          string,
          {
            file: string
            isEntry: boolean
            imports: Array<string>
          }
        >

        let manifest: ViteManifest
        try {
          manifest = JSON.parse(await readFile(clientViteManifestPath, 'utf-8'))
        } catch (err) {
          console.error(err)
          throw new Error(
            `Could not find the production client vite manifest at '${clientViteManifestPath}'!`,
          )
        }

        const routeTreePath = path.resolve(opts.tsrConfig.generatedRouteTree)

        let routeTreeContent: string
        try {
          routeTreeContent = readFileSync(routeTreePath, 'utf-8')
        } catch (err) {
          console.error(err)
          throw new Error(
            `Could not find the generated route tree at '${routeTreePath}'!`,
          )
        }

        // Extract the routesManifest JSON from the route tree file.
        // It's located between the /* ROUTE_MANIFEST_START and ROUTE_MANIFEST_END */ comment block.

        const routerManifest = JSON.parse(
          routeTreeContent.match(
            /\/\* ROUTE_MANIFEST_START([\s\S]*?)ROUTE_MANIFEST_END \*\//,
          )?.[1] || '{ routes: {} }',
        ) as Manifest

        const routes = routerManifest.routes

        let entryFile:
          | {
              file: string
              imports: Array<string>
            }
          | undefined

        const filesByRouteFilePath: ViteManifest = Object.fromEntries(
          Object.entries(manifest).map(([k, v]) => {
            if (v.isEntry) {
              entryFile = v
            }

            const rPath = k.split('?')[0]

            return [rPath, v]
          }, {}),
        )

        // Add preloads to the routes from the vite manifest
        Object.entries(routes).forEach(([k, v]) => {
          const file =
            filesByRouteFilePath[
              path.join(opts.tsrConfig.routesDirectory, v.filePath as string)
            ]

          if (file) {
            const preloads = file.imports.map((d) =>
              path.join(opts.clientBase, manifest[d]!.file),
            )

            preloads.unshift(path.join(opts.clientBase, file.file))

            routes[k] = {
              ...v,
              preloads,
            }
          }
        })

        if (entryFile) {
          routes.__root__!.preloads = [
            path.join(opts.clientBase, entryFile.file),
            ...entryFile.imports.map((d) =>
              path.join(opts.clientBase, manifest[d]!.file),
            ),
          ]
        }

        const recurseRoute = (
          route: {
            preloads?: Array<string>
            children?: Array<any>
          },
          seenPreloads = {} as Record<string, true>,
        ) => {
          route.preloads = route.preloads?.filter((preload) => {
            if (seenPreloads[preload]) {
              return false
            }
            seenPreloads[preload] = true
            return true
          })

          if (route.children) {
            route.children.forEach((child) => {
              const childRoute = routes[child]!
              recurseRoute(childRoute, { ...seenPreloads })
            })
          }
        }

        // @ts-expect-error
        recurseRoute(routes.__root__)

        const routesManifest = {
          routes,
        }

        if (process.env.TSR_VITE_DEBUG) {
          console.info(JSON.stringify(routesManifest, null, 2))
        }

        return `export default () => (${JSON.stringify(routesManifest)})`
      }
      return
    },
  }
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
