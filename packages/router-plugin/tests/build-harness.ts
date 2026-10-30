/**
 * Real-build harness of the router plugin: builds an app with the router
 * plugin of a bundler through the shared build harness
 * (`@tanstack/compiler-test-utils/build-harness`). The temporary apps stand
 * in for apps in this directory (`@tanstack/compiler-test-utils/
 * app-directory`), so their imports resolve to this package's dependencies.
 * Each app has its own package.json, without a `sideEffects` field unless
 * the test sets one (`sideEffects`), so its modules count as side-effectful;
 * only `packageJson: null` makes it inherit this package's
 * (`"sideEffects": false`).
 *
 * Each framework builds with its own JSX compiler, the way its apps do. On
 * Vite, the framework's Vite plugin (`@vitejs/plugin-react`,
 * `vite-plugin-solid`, `@vitejs/plugin-vue-jsx`) unless the test gives it.
 * On webpack and Rspack, which have no framework plugins, the loader an app
 * configures: React with the bundler's TypeScript/JSX transform (SWC or the
 * harness's loader, `@tanstack/compiler-test-utils/build-harness`), Solid
 * with `babel-preset-solid`, Vue with Vue's Babel JSX plugin
 * (`@vue/babel-plugin-jsx`, the one `@vitejs/plugin-vue-jsx` runs), both
 * through `babel-loader`. Rsbuild apps (`buildWithRsbuild`) add
 * `@rsbuild/plugin-react`.
 */
import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BuildError,
  bundleApp,
  chunksOfStats,
  createApp,
  describeBuild,
  parsedModules,
  pluginNames,
  recordParsedModules,
  statsDiagnostics,
  statsMessages,
  statsOptions,
  withBuildEnvironment,
} from '@tanstack/compiler-test-utils/build-harness'
import { mergeRsbuildConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { onTestFinished } from '@tanstack/compiler-test-utils/test-scope'
import type {
  App,
  AppInfo,
  AppOptions,
  BuildEnv,
  BuildResult,
  BundleOptions,
  Bundler,
  EmittedChunk,
  StatsJson,
} from '@tanstack/compiler-test-utils/build-harness'
import type { ChannelDiagnostic } from '@tanstack/compiler-test-utils/diagnostic-channel'
import type { RsbuildConfig, RsbuildPlugin } from '@rsbuild/core'
import type { CodeSplittingOptions, Config } from '../src/vite'

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
 * SSR entry: re-exports the index route's `Route` (what an app's route tree
 * imports of a route module, so the route module's other exports do not
 * ship for it) next to `render(component)`, which preloads a component and
 * renders it to a string. A test that needs another export of a route
 * module re-exports it by name.
 */
export const ssrRenderEntry = `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
export { Route } from './routes/index'
export async function render(component: any) {
  await component.preload?.()
  return renderToString(createElement(component))
}
`

/**
 * Client entry: re-exports the index route's `Route` (as the SSR entry)
 * next to `mount(component)`, which preloads a component and renders it
 * into `#root` synchronously.
 */
export const clientMountEntry = `import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
export { Route } from './routes/index'
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
export { Route } from './routes/index'
export async function render(component: any) {
  await component.preload?.()
  return renderToString(() => createComponent(component, {}))
}
`,
    client: `import { createComponent } from 'solid-js'
import { render } from 'solid-js/web'
export { Route } from './routes/index'
export async function mount(component: any) {
  await component.preload?.()
  render(() => createComponent(component, {}), document.getElementById('root')!)
}
`,
  },
  vue: {
    ssr: `import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
export { Route } from './routes/index'
export async function render(component: any) {
  await component.preload?.()
  return renderToString(createSSRApp({ render: () => h(component) }))
}
`,
    client: `import { createApp, h } from 'vue'
export { Route } from './routes/index'
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
 * `tanstackRouter` (e.g. other entry points). A framework plugin of Vite
 * that `routerPlugins` already gives (by its name) is not added again.
 */
export async function build(
  options: Omit<BundleOptions, 'dir'> & {
    pluginOptions?: RouterPluginOptions
    framework?: Framework
    routerPlugins?: (config: RouterPluginOptions) => Array<unknown>
  },
): Promise<BuildResult> {
  const {
    pluginOptions = {},
    framework = 'react',
    routerPlugins: createRouterPlugins,
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
        const router = createRouterPlugins?.(config) ?? [tanstackRouter(config)]
        const given = pluginNames(router)
        const all = [
          ...router,
          ...frameworkBuild
            .plugins(app)
            .filter(
              (plugin) =>
                !pluginNames([plugin]).some((name) => given.includes(name)),
            ),
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

/**
 * A rule of webpack or Rspack compiling the app's TypeScript and JSX with
 * Babel (`babel-loader`): the TypeScript preset, then the framework's JSX
 * `presets` or `plugins`.
 */
function babelRule(babel: {
  presets?: Array<unknown>
  plugins?: Array<unknown>
}) {
  return {
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
        ...(babel.presets ?? []),
      ],
      plugins: babel.plugins ?? [],
    },
  }
}

interface FrameworkBuild {
  /** Bundle options of the framework (JSX compilation). */
  target: Pick<BundleOptions, 'sourceRules' | 'conditions'>
  /** Bundler plugins of the framework, after the router plugin. */
  plugins: (app: AppInfo) => Array<unknown>
}

const frameworkBuilds: Record<
  Framework,
  (options: { bundler: Bundler; env?: BuildEnv }) => Promise<FrameworkBuild>
> = {
  react: async ({ bundler }) => {
    if (bundler === 'vite') {
      const { default: react } = await import('@vitejs/plugin-react')
      return { target: {}, plugins: () => [react()] }
    }
    return { target: {}, plugins: () => [] }
  },
  vue: async ({ bundler }) => {
    if (bundler === 'vite') {
      const { default: vueJsx } = await import('@vitejs/plugin-vue-jsx')
      return { target: {}, plugins: () => [vueJsx()] }
    }
    if (bundler === 'esbuild') {
      throw new Error('The build harness has no Vue JSX for esbuild')
    }
    // Vue's Babel JSX plugin, the one `@vitejs/plugin-vue-jsx` (and
    // `@rsbuild/plugin-vue-jsx`) run, through `babel-loader`, as Vue's docs
    // configure a webpack app
    return {
      target: {
        sourceRules: [
          babelRule({
            plugins: [
              createRequire(require.resolve('@vitejs/plugin-vue-jsx')).resolve(
                '@vue/babel-plugin-jsx',
              ),
            ],
          }),
        ],
      },
      plugins: () => [],
    }
  },
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
          babelRule({
            presets: [
              [
                require.resolve('babel-preset-solid'),
                { generate: env === 'ssr' ? 'ssr' : 'dom', hydratable: true },
              ],
            ],
          }),
        ],
      },
      plugins: () => [],
    }
  },
}

/** Global the Rsbuild app's entry assigns the exports of `entry.ts` to. */
const rsbuildEntryGlobal = '__routerBuildHarnessEntry'

/**
 * Builds a React app for the client in production with Rsbuild, the way an
 * Rsbuild app adds the router plugin (`tools.rspack.plugins`) next to
 * `pluginReact()` (unless `rsbuildConfig.plugins` has it), with Rsbuild's
 * defaults (TypeScript and JSX detection, chunk splitting, minifier). Only
 * differences: no HTML page is emitted, and the output is ES modules
 * (`output.module`) so that `run()` can load it in Node; what is split, and
 * where, does not depend on that. `files` holds the routes and `entry.ts`
 * (see `routeApp`).
 */
export async function buildWithRsbuild(
  options: Pick<AppOptions, 'files' | 'packageJson' | 'sideEffects'> & {
    pluginOptions?: RouterPluginOptions
    registerCleanup?: AppOptions['registerCleanup']
    /**
     * `NODE_ENV` of the build process (default `production`, as the
     * Rsbuild CLI sets it; `null` unsets it).
     */
    nodeEnv?: string | null
    /**
     * Builds an app that already exists at this root (its files as they
     * are; `files` is ignored) instead of writing a new one, e.g. to build
     * the same app again with a persistent build cache. The caller owns the
     * directory.
     */
    root?: string
    /** Rsbuild configuration merged over the harness's. */
    rsbuildConfig?: RsbuildConfig
  },
): Promise<BuildResult> {
  const { pluginOptions = {}, nodeEnv = 'production' } = options
  const harnessEntry = `import * as entry from './entry'
;(globalThis as any).${rsbuildEntryGlobal} = entry
`
  let app: App
  if (options.root === undefined) {
    app = await createApp({
      dir: harnessDir,
      prefix: '.build-harness-rsbuild-',
      registerCleanup: options.registerCleanup ?? onTestFinished,
      packageJson: options.packageJson,
      sideEffects: options.sideEffects,
      files: { ...options.files, 'harness-entry.ts': harnessEntry },
    })
  } else {
    await writeFile(path.join(options.root, 'harness-entry.ts'), harnessEntry)
    app = {
      root: options.root,
      bundle: () => Promise.reject(new Error('not an app of the harness')),
      dispose: () => Promise.resolve(),
    }
  }
  try {
    const { createRsbuild } = await import('@rsbuild/core')
    const { tanstackRouter } = await import('../src/rspack')
    const warnings: Array<ChannelDiagnostic> = []
    const errors: Array<string> = []
    const consoleMessages: Array<ChannelDiagnostic> = []
    let output: { outDir: string; chunks: Array<EmittedChunk> } | undefined
    /** The evidence of the dangling-name check (`describeBuild`). */
    const parsed = parsedModules()
    const outputPlugin: RsbuildPlugin = {
      name: 'router-build-harness:outputs',
      setup(api) {
        api.onAfterEnvironmentCompile(({ stats, environment }) => {
          if (!stats) {
            errors.push('no compilation stats')
            return
          }
          const json = stats.toJson(statsOptions) as StatsJson
          warnings.push(...statsDiagnostics(json.warnings, 'warning'))
          errors.push(...statsMessages(json.errors))
          output = {
            outDir: environment.distPath,
            chunks: chunksOfStats(json, { entry: 'index', extension: '.js' }),
          }
        })
      },
    }
    await withBuildEnvironment(nodeEnv, consoleMessages, async () => {
      try {
        const rsbuild = await createRsbuild({
          cwd: app.root,
          loadEnv: false,
          rsbuildConfig: mergeRsbuildConfig(
            {
              root: app.root,
              mode: 'production',
              logLevel: 'silent',
              source: { entry: { index: './harness-entry.ts' } },
              output: { module: true },
              tools: {
                htmlPlugin: false,
                rspack: {
                  plugins: [
                    recordParsedModules(parsed),
                    tanstackRouter({
                      target: 'react',
                      autoCodeSplitting: true,
                      ...pluginOptions,
                      routesDirectory: path.resolve(
                        app.root,
                        pluginOptions.routesDirectory ?? 'routes',
                      ),
                      generatedRouteTree: path.resolve(
                        app.root,
                        pluginOptions.generatedRouteTree ?? 'routeTree.gen.ts',
                      ),
                    }),
                  ],
                },
              },
              plugins: [
                ...(pluginNames(options.rsbuildConfig?.plugins).includes(
                  'rsbuild:react',
                )
                  ? []
                  : [pluginReact()]),
                outputPlugin,
              ],
            },
            options.rsbuildConfig ?? {},
          ),
        })
        await rsbuild.build()
      } catch (error) {
        throw new BuildError(
          'rspack',
          errors.length
            ? errors
            : [error instanceof Error ? error.message : String(error)],
          warnings,
        )
      }
    })
    if (errors.length || !output) {
      throw new BuildError(
        'rspack',
        errors.length ? errors : ['no output'],
        warnings,
      )
    }
    return await describeBuild({
      bundler: 'rspack',
      env: 'client',
      mode: 'production',
      root: app.root,
      outDir: output.outDir,
      chunks: output.chunks,
      parsedModules: parsed,
      warnings,
      consoleMessages,
      dispose: app.dispose,
      entryGlobal: rsbuildEntryGlobal,
    })
  } catch (error) {
    await app.dispose()
    throw error
  }
}

/** The groupings of `codeSplittingOptions.defaultBehavior` (public type). */
export type CodeSplitGroupings = NonNullable<
  CodeSplittingOptions['defaultBehavior']
>

/**
 * Builds a small app with the real Vite plugin (code splitting on, default
 * groupings unless `groupings` is given): `routes/index.tsx` holds `route`,
 * and `entry.ts` re-exports the route module next to `render(component)`,
 * which preloads a component and renders it to a string. `files` adds files
 * or replaces `entry.ts`. The app directory name starts with `prefix`. Then
 * imports the built entry in a separate Node process and returns the JSON
 * value returned by `script`, which has the entry's exports in scope as
 * `entry`.
 *
 * A production Vite SSR build, without minification. The app's
 * `package.json` declares no side-effect hint, like an app's.
 */
export async function buildAndRun(
  route: string,
  script: string,
  options: {
    files?: Record<string, string>
    groupings?: CodeSplitGroupings
    prefix?: string
  } = {},
) {
  const app = await build({
    bundler: 'vite',
    env: 'ssr',
    minify: false,
    prefix: options.prefix ?? '.regression-build-',
    files: routeApp(route, { files: options.files }),
    pluginOptions: options.groupings && {
      codeSplittingOptions: { defaultBehavior: options.groupings },
    },
  })
  try {
    return (await app.run(script)).result
  } finally {
    await app.dispose()
  }
}

/** Imports `createFileRoute` from the React router package. */
export const head = routeHead('react')
