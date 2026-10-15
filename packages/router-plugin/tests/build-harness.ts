/**
 * Real-build harness of the router plugin: builds an app with the router
 * plugin of a bundler through the shared build harness
 * (`@tanstack/compiler-test-utils/build-harness`). The temporary apps live in
 * this directory, so their imports resolve to this package's dependencies,
 * and an app without a package.json inherits this package's
 * (`"sideEffects": false`).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundleApp } from '@tanstack/compiler-test-utils/build-harness'
import type {
  AppInfo,
  BuildEnv,
  BuildResult,
  Bundler,
  BundleOptions,
} from '@tanstack/compiler-test-utils/build-harness'
import type { Config } from '../src/core/config'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

export type RouterPluginOptions = Partial<Config>

export const rootRoute = `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})
`

/**
 * SSR entry: re-exports the index route module next to
 * `render(component)`, which preloads a component and renders it to a string.
 */
export const ssrRenderEntry = `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
export * from './routes/index'
export async function render(component: any) {
  await component.preload?.()
  return renderToString(createElement(component))
}
`

/**
 * Client entry: re-exports the index route module next to
 * `mount(component)`, which preloads a component and renders it into
 * `#root` synchronously.
 */
export const clientMountEntry = `import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
export * from './routes/index'
export async function mount(component: any) {
  await component.preload?.()
  const root = createRoot(document.getElementById('root')!)
  flushSync(() => root.render(createElement(component)))
}
`

/**
 * Files of a one-route app: the root route, `route` as `routes/index.tsx`
 * and the render (`ssr`) or mount (`client`) entry; `files` adds or
 * replaces files.
 */
export function routeApp(
  route: string,
  options: { env?: BuildEnv; files?: Record<string, string> } = {},
): Record<string, string> {
  return {
    'routes/__root.tsx': rootRoute,
    'routes/index.tsx': route,
    'entry.ts': options.env === 'client' ? clientMountEntry : ssrRenderEntry,
    ...options.files,
  }
}

/**
 * Builds an app with the router plugin of the bundler: file-based routes in
 * `routes/`, React, code splitting on, HMR off; `pluginOptions` overrides
 * these. `files` holds the routes and the entry (see `routeApp`).
 */
export async function build(
  options: Omit<BundleOptions, 'dir'> & { pluginOptions?: RouterPluginOptions },
): Promise<BuildResult> {
  const { pluginOptions = {}, ...bundleOptions } = options
  const tanstackRouter = (await routerPlugins[options.bundler]()) as (
    config: RouterPluginOptions,
  ) => unknown
  return bundleApp({
    dir: harnessDir,
    ...bundleOptions,
    plugins: {
      [options.bundler]: ({ root }: AppInfo) =>
        tanstackRouter({
          target: 'react',
          autoCodeSplitting: true,
          ...pluginOptions,
          // The webpack, Rspack and esbuild adapters resolve these against
          // the working directory
          routesDirectory: path.resolve(
            root,
            pluginOptions.routesDirectory ?? 'routes',
          ),
          generatedRouteTree: path.resolve(
            root,
            pluginOptions.generatedRouteTree ?? 'routeTree.gen.ts',
          ),
          codeSplittingOptions: {
            addHmr: false,
            ...pluginOptions.codeSplittingOptions,
          },
        }),
    },
  })
}

const routerPlugins: Record<Bundler, () => Promise<unknown>> = {
  vite: async () => (await import('../src/vite')).tanstackRouter,
  rspack: async () => (await import('../src/rspack')).tanstackRouter,
  webpack: async () => (await import('../src/webpack')).tanstackRouter,
  esbuild: async () => (await import('../src/esbuild')).tanstackRouter,
}
