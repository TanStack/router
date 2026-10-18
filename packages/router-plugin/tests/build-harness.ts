/**
 * Real-build harness of the router plugin: builds an app with the router
 * plugin of a bundler through the shared build harness
 * (`@tanstack/compiler-test-utils/build-harness`). The temporary apps live in
 * this directory, so their imports resolve to this package's dependencies.
 * Each app has its own package.json, without a `sideEffects` field unless
 * the test sets one (`sideEffects`), so its modules count as side-effectful;
 * only `packageJson: null` makes it inherit this package's
 * (`"sideEffects": false`).
 *
 * Each framework builds with its own JSX compiler, the way its apps do:
 * React with the bundler's TypeScript/JSX transform, Solid with
 * `vite-plugin-solid` (Vite) or `babel-preset-solid` (webpack, Rspack), Vue
 * with the automatic JSX runtime of `vue`.
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundleApp } from '@tanstack/compiler-test-utils/build-harness'
import { onTestFinished } from 'vitest'
import type {
  AppInfo,
  BuildEnv,
  BuildResult,
  BundleOptions,
  Bundler,
} from '@tanstack/compiler-test-utils/build-harness'
import type { Config } from '../src/core/config'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

export type RouterPluginOptions = Partial<Config>

/** A framework the router plugin targets. */
export type Framework = 'react' | 'solid' | 'vue'

export const frameworks: ReadonlyArray<Framework> = ['react', 'solid', 'vue']

/** Imports `createFileRoute` from the router package of `framework`. */
export function routeHead(framework: Framework = 'react') {
  return `import { createFileRoute } from '@tanstack/${framework}-router'\n`
}

/** An empty root route of the router package of `framework`. */
export function rootRouteOf(framework: Framework = 'react') {
  return `import { createRootRoute } from '@tanstack/${framework}-router'
export const Route = createRootRoute({})
`
}

export const rootRoute = rootRouteOf('react')

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

/** `render` and `mount` entries (see above) of each framework. */
const entries: Record<Framework, Record<BuildEnv, string>> = {
  react: { ssr: ssrRenderEntry, client: clientMountEntry },
  solid: {
    ssr: `import { createComponent } from 'solid-js'
import { renderToString } from 'solid-js/web'
export * from './routes/index'
export async function render(component: any) {
  await component.preload?.()
  return renderToString(() => createComponent(component, {}))
}
`,
    client: `import { createComponent } from 'solid-js'
import { render } from 'solid-js/web'
export * from './routes/index'
export async function mount(component: any) {
  await component.preload?.()
  render(() => createComponent(component, {}), document.getElementById('root')!)
}
`,
  },
  vue: {
    ssr: `import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
export * from './routes/index'
export async function render(component: any) {
  await component.preload?.()
  return renderToString(createSSRApp({ render: () => h(component) }))
}
`,
    client: `import { createApp, h } from 'vue'
export * from './routes/index'
export async function mount(component: any) {
  await component.preload?.()
  createApp({ render: () => h(component) }).mount('#root')
}
`,
  },
}

/**
 * Files of a one-route app: the root route, `route` as `routes/index.tsx`
 * and the render (`ssr`) or mount (`client`) entry of `framework` (default
 * React); `files` adds or replaces files.
 */
export function routeApp(
  route: string,
  options: {
    env?: BuildEnv
    files?: Record<string, string>
    framework?: Framework
  } = {},
): Record<string, string> {
  const framework = options.framework ?? 'react'
  return {
    'routes/__root.tsx': rootRouteOf(framework),
    'routes/index.tsx': route,
    'entry.ts': entries[framework][options.env ?? 'ssr'],
    ...options.files,
  }
}

/**
 * Builds an app with the router plugin of the bundler: file-based routes in
 * `routes/`, `framework` (default React, also the plugin's `target`), code
 * splitting on, HMR off; `pluginOptions` overrides these. `files` holds the
 * routes and the entry (see `routeApp`). `routerPlugins` creates the router
 * plugins from the harness's plugin options instead of the bundler's
 * `tanstackRouter` (e.g. other entry points); `extraPlugins` creates more
 * plugins of the bundler, after the router plugins and the framework's.
 */
export async function build(
  options: Omit<BundleOptions, 'dir'> & {
    pluginOptions?: RouterPluginOptions
    framework?: Framework
    routerPlugins?: (config: RouterPluginOptions) => Array<unknown>
    extraPlugins?: (app: AppInfo) => Array<unknown>
  },
): Promise<BuildResult> {
  const {
    pluginOptions = {},
    framework = 'react',
    routerPlugins: createRouterPlugins,
    extraPlugins,
    ...bundleOptions
  } = options
  const tanstackRouter = (await routerPlugins[options.bundler]()) as (
    config: RouterPluginOptions,
  ) => unknown
  const frameworkBuild = await frameworkBuilds[framework](options)
  return bundleApp({
    dir: harnessDir,
    registerCleanup: onTestFinished,
    ...frameworkBuild.target,
    ...bundleOptions,
    plugins: {
      [options.bundler]: (app: AppInfo) => {
        const config: RouterPluginOptions = {
          target: framework,
          autoCodeSplitting: true,
          ...pluginOptions,
          // The webpack, Rspack and esbuild adapters resolve these against
          // the working directory
          routesDirectory: path.resolve(
            app.root,
            pluginOptions.routesDirectory ?? 'routes',
          ),
          generatedRouteTree: path.resolve(
            app.root,
            pluginOptions.generatedRouteTree ?? 'routeTree.gen.ts',
          ),
          codeSplittingOptions: {
            addHmr: false,
            ...pluginOptions.codeSplittingOptions,
          },
        }
        const all = [
          ...(createRouterPlugins?.(config) ?? [tanstackRouter(config)]),
          ...frameworkBuild.plugins(app),
          ...(extraPlugins?.(app) ?? []),
        ]
        if (all.length === 1) {
          return all[0]
        }
        if (options.bundler === 'vite') {
          return all
        }
        if (options.bundler === 'esbuild') {
          throw new Error('esbuild: one plugin per build')
        }
        // webpack and Rspack: one plugin applying them all
        type WebpackPlugin = { apply: (compiler: unknown) => void }
        return {
          apply(compiler: unknown) {
            for (const plugin of all) {
              ;(plugin as WebpackPlugin).apply(compiler)
            }
          },
        }
      },
    },
  })
}

const routerPlugins: Record<Bundler, () => Promise<unknown>> = {
  vite: async () => (await import('../src/vite')).tanstackRouter,
  rspack: async () => (await import('../src/rspack')).tanstackRouter,
  webpack: async () => (await import('../src/webpack')).tanstackRouter,
  esbuild: async () => (await import('../src/esbuild')).tanstackRouter,
}

interface FrameworkBuild {
  /** Bundle options of the framework (JSX compilation). */
  target: Pick<BundleOptions, 'jsxImportSource' | 'sourceRules' | 'conditions'>
  /** Bundler plugins of the framework, after the router plugin. */
  plugins: (app: AppInfo) => Array<unknown>
}

const frameworkBuilds: Record<
  Framework,
  (options: { bundler: Bundler; env?: BuildEnv }) => Promise<FrameworkBuild>
> = {
  react: () => Promise.resolve({ target: {}, plugins: () => [] }),
  vue: () =>
    Promise.resolve({ target: { jsxImportSource: 'vue' }, plugins: () => [] }),
  solid: async ({ bundler, env = 'ssr' }) => {
    if (bundler === 'vite') {
      const { default: solid } = await import('vite-plugin-solid')
      // `ssr`: SSR builds compile for the server (hydratable, as in
      // SolidStart apps)
      return { target: {}, plugins: () => [solid({ ssr: true })] }
    }
    if (bundler === 'esbuild') {
      throw new Error('The build harness has no Solid JSX for esbuild')
    }
    // Like `@rsbuild/plugin-solid`: the `solid` condition selects the JSX
    // source of Solid packages, compiled for the environment with the app
    return {
      target: {
        conditions: ['solid'],
        sourceRules: [
          {
            test: /\.(?:[cm]?tsx?|jsx)$/,
            exclude: /node_modules/,
            loader: require.resolve('babel-loader'),
            options: {
              babelrc: false,
              configFile: false,
              presets: [
                [
                  require.resolve('@babel/preset-typescript'),
                  { isTSX: true, allExtensions: true },
                ],
                [
                  require.resolve('babel-preset-solid'),
                  { generate: env === 'ssr' ? 'ssr' : 'dom', hydratable: true },
                ],
              ],
            },
          },
        ],
      },
      plugins: () => [],
    }
  },
}
