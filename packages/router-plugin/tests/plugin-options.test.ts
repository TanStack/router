/**
 * Router plugin options and entry points, through real builds: what each
 * option changes in the output or on disk.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createDevServer,
  evaluateServed,
} from '@tanstack/compiler-test-utils/dev-server'
import { describe, expect, onTestFinished, test } from 'vitest'
import { build, routeApp, routeHead } from './build-harness'
import { loadRouteOption, rootRouteOf, routerPackageStub } from './dev-server'
import { compileRouteModules, head } from './regression-helpers'
import type {
  BuildResult,
  Bundler,
} from '@tanstack/compiler-test-utils/build-harness'
import type { RouterPluginOptions } from './build-harness'

const timeout = 120_000

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

const bundlers = ['vite', 'rspack', 'webpack'] as const

/** A route whose component is split by default. */
const route = (routePath = '/') => `${routeHead()}function Page() {
  return <p>MARK_COMPONENT</p>
}
export const Route = createFileRoute('${routePath}')({
  staticData: { label: 'MARK_ROUTE' },
  component: Page,
})
`

/** Builds the route for the client and renders its component. */
async function buildRoute(
  bundler: Bundler,
  pluginOptions: RouterPluginOptions,
  options: {
    files?: Record<string, string>
    routes?: (config: RouterPluginOptions) => Array<unknown>
  } = {},
) {
  const app = await build({
    bundler,
    env: 'client',
    pluginOptions,
    routerPlugins: options.routes,
    files: routeApp(options.files?.['routes/index.tsx'] ?? route(), {
      env: 'client',
      files: options.files,
    }),
  })
  const run = await app.run(`await entry.mount(entry.Route.options.component)`)
  return { app, html: run.html }
}

const read = (app: BuildResult, file: string) =>
  readFile(path.join(app.root, file), 'utf8').catch(() => null)

describe('enableRouteGeneration: false', () => {
  const userTree =
    '// The route tree of the user\nexport const routeTree = {}\n'
  const userRoute = route('/somewhere-else')
  const files = {
    'routes/index.tsx': userRoute,
    'routeTree.gen.ts': userTree,
  }

  // Source: #5087, gap options.md (`false` never exercised).
  test.each(bundlers)(
    'leaves the route tree and the route files as written (%s)',
    async (bundler) => {
      const { app, html } = await buildRoute(
        bundler,
        { enableRouteGeneration: false },
        { files },
      )
      expect(await read(app, 'routeTree.gen.ts')).toBe(userTree)
      expect(await read(app, 'routes/index.tsx')).toBe(userRoute)
      expect(html).toContain('MARK_COMPONENT')
    },
    timeout,
  )
})

describe.each([false, undefined])(
  'autoCodeSplitting: %s',
  (autoCodeSplitting) => {
    test.each(bundlers)(
      'splits nothing and still generates the route tree (%s)',
      async (bundler) => {
        const { app, html } = await buildRoute(bundler, { autoCodeSplitting })
        expect(app.where('MARK_COMPONENT')).toBe('eager')
        expect(app.lazy).toEqual([])
        expect(html).toContain('MARK_COMPONENT')
        expect(await read(app, 'routeTree.gen.ts')).toContain(
          "from './routes/index'",
        )
      },
      timeout,
    )
  },
)

describe('plugin.vite.environmentName', () => {
  test.each([
    ['client', 'lazy'],
    ['ssr', 'eager'],
  ] as const)(
    'with %s code-splits only that environment (client build: %s)',
    async (environmentName, placement) => {
      const { app, html } = await buildRoute('vite', {
        plugin: { vite: { environmentName } },
      })
      expect(app.where('MARK_COMPONENT')).toBe(placement)
      expect(html).toContain('MARK_COMPONENT')
    },
    timeout,
  )
})

// TanStack Start splits each environment with its own code splitter, scoped
// with `environmentName` and sharing one router plugin context
// (start-plugin-core's start router plugin): both environments compile the
// route with the same plugin instances, and each instance compiles the route
// file, its chunks and its shared module in its own environment only.
test(
  'two code splitters scoped to the client and SSR environments of one dev server each split a route whose loader and component share a binding',
  async () => {
    const { createRouterPluginContext } = await import('../src/context')
    const { tanStackRouterCodeSplitter, tanstackRouterGenerator } =
      await import('../src/vite')
    const server = await createDevServer({
      dir: harnessDir,
      prefix: '.router-dev-server-',
      registerCleanup: onTestFinished,
      files: {
        'routes/__root.tsx': rootRouteOf('react'),
        'routes/index.tsx': `${routeHead()}const label = { text: 'MARK_SHARED' }
function Page() {
  return 'MARK_COMPONENT ' + label.text
}
export const Route = createFileRoute('/')({
  loader: () => label,
  component: Page,
})
`,
      },
      plugins: (app) => {
        const context = createRouterPluginContext()
        const config: RouterPluginOptions = {
          target: 'react',
          autoCodeSplitting: true,
          routesDirectory: path.join(app.root, 'routes'),
          generatedRouteTree: path.join(app.root, 'routeTree.gen.ts'),
          codeSplittingOptions: { addHmr: false },
        }
        return [
          tanstackRouterGenerator(config, context),
          ...(['client', 'ssr'] as const).map((environmentName) =>
            tanStackRouterCodeSplitter(
              { ...config, plugin: { vite: { environmentName } } },
              context,
            ),
          ),
          routerPackageStub('react'),
        ]
      },
    })
    /** Loads the route's split component and its loader's value. */
    const read = async (routeModule: Record<string, any>) => {
      const { options } = routeModule.Route
      const component = (await loadRouteOption(
        options.component,
      )) as () => string
      return [component(), options.loader()]
    }
    const expected = ['MARK_COMPONENT MARK_SHARED', { text: 'MARK_SHARED' }]
    expect(await read(await server.import('/routes/index.tsx'))).toEqual(
      expected,
    )
    // The browser gets the router package stub from Vite's virtual module
    // URL; evaluated here from the same SSR-loaded module.
    const routerPackage = await server.import('@tanstack/react-router')
    expect(
      await read(
        await evaluateServed(server, '/routes/index.tsx', {
          skip: /^\/@id\//,
          stubs: {
            '/@id/__x00__@tanstack/react-router-stub': routerPackage,
          },
        }),
      ),
    ).toEqual(expected)
  },
  timeout,
)

describe('codeSplittingOptions.splitBehavior', () => {
  test('that is not a function is refused when the plugin is created, naming the option', async () => {
    const { tanstackRouter } = await import('../src/vite')
    expect(() =>
      tanstackRouter({
        codeSplittingOptions: { splitBehavior: [['loader']] as any },
      }),
    ).toThrow(/splitBehavior/)
  })
})

describe('repeated options in split groupings', () => {
  test('in defaultBehavior are refused with an error naming the option', async () => {
    const { tanstackRouter } = await import('../src/vite')
    expect(() =>
      tanstackRouter({
        codeSplittingOptions: {
          defaultBehavior: [['loader'], ['loader', 'component']],
        },
      }),
    ).toThrow(
      /loader[\s\S]*(?:unique|repeated|more than once|duplicate)|(?:unique|repeated|more than once|duplicate)[\s\S]*loader/i,
    )
  })

  test('in a route are refused with an error naming the route file and the option', () => {
    expect(() =>
      compileRouteModules(
        `${head}export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['loader', 'component']],
  loader: () => 'data',
  component: () => <p>page</p>,
})
`,
        { filename: 'groupings-route.tsx' },
      ),
    ).toThrow(/groupings-route\.tsx[\s\S]*loader/)
  })
})

// The webpack and Rspack entries use their bundler's HMR API whatever
// `plugin.hmr.style` says (src/rspack.ts, src/webpack.ts).
describe.each(['rspack', 'webpack'] as const)('%s entry', (bundler) => {
  /**
   * Development client build with the bundler's HMR plugin, `addHmr`, and
   * `plugin.hmr.style: 'vite'`.
   */
  async function hotDevelopmentBuild(
    addHmr: boolean | undefined,
    routes?: (config: RouterPluginOptions) => Array<unknown>,
  ) {
    return build({
      bundler,
      env: 'client',
      mode: 'development',
      pluginOptions: {
        plugin: { hmr: { style: 'vite' } },
        codeSplittingOptions: { addHmr },
      },
      routerPlugins: routes,
      extraPlugins: () => [
        {
          apply(compiler: any) {
            new compiler.webpack.HotModuleReplacementPlugin().apply(compiler)
          },
        },
      ],
      files: routeApp(route(), { env: 'client' }),
    })
  }

  /**
   * The plugins the entry is made of, for this bundler, without the entry's
   * own handling of the options.
   */
  async function unforcedPlugins() {
    const { createRspackPlugin, createWebpackPlugin } = await import('unplugin')
    const { createRouterGeneratorPlugin } =
      await import('../src/core/router-generator-plugin')
    const { createRouterCodeSplitterPlugin } =
      await import('../src/core/router-code-splitter-plugin')
    const { createRouterPluginContext } =
      await import('../src/core/router-plugin-context')
    const create: (
      factory: (options: any) => any,
    ) => (options: any) => unknown =
      bundler === 'rspack' ? createRspackPlugin : createWebpackPlugin
    return (config: RouterPluginOptions) => {
      const context = createRouterPluginContext()
      return [
        create((options) => createRouterGeneratorPlugin(options, context))(
          config,
        ),
        create((options) => createRouterCodeSplitterPlugin(options, context))(
          config,
        ),
      ]
    }
  }

  /**
   * Whether the route modules accept hot updates through the hot module API
   * of webpack and Rspack (`import.meta.webpackHot` / `module.hot`), and
   * whether they use Vite's (`import.meta.hot`, undefined in these bundles).
   */
  const hmrApi = (app: BuildResult) => ({
    accepts: app.where(/\bhot\.accept\(/) !== 'nowhere',
    vite: app.where(/\bimport\.meta\.hot\b/) !== 'nowhere',
  })

  test(
    'makes routes accept hot updates through the bundler even when plugin.hmr.style is vite',
    async () => {
      const [entry, withoutHmr, unforced] = await Promise.all([
        hotDevelopmentBuild(undefined),
        hotDevelopmentBuild(false),
        hotDevelopmentBuild(undefined, await unforcedPlugins()),
      ])
      // Controls: no route HMR code; Vite's HMR API when the style is not
      // forced
      expect(hmrApi(withoutHmr)).toEqual({ accepts: false, vite: false })
      expect(hmrApi(unforced).vite).toBe(true)
      expect(hmrApi(entry)).toEqual({ accepts: true, vite: false })
    },
    timeout,
  )
})

describe('separate generator and code splitter entries', () => {
  const entries: Record<
    (typeof bundlers)[number],
    () => Promise<(config: RouterPluginOptions) => Array<unknown>>
  > = {
    vite: async () => {
      const vite = await import('../src/vite')
      return (config) => [
        vite.tanstackRouterGenerator(config),
        vite.tanStackRouterCodeSplitter(config),
      ]
    },
    rspack: async () => {
      const rspack = await import('../src/rspack')
      return (config) => [
        rspack.TanStackRouterGeneratorRspack(config),
        rspack.TanStackRouterCodeSplitterRspack(config),
      ]
    },
    webpack: async () => {
      const webpack = await import('../src/webpack')
      return (config) => [
        webpack.TanStackRouterGeneratorWebpack(config),
        webpack.TanStackRouterCodeSplitterWebpack(config),
      ]
    },
  }

  test.each(bundlers)(
    'generate the route tree and split like the combined plugin (%s)',
    async (bundler) => {
      const { app, html } = await buildRoute(
        bundler,
        {},
        { routes: await entries[bundler]() },
      )
      expect(app.where('MARK_COMPONENT')).toBe('lazy')
      expect(app.where('MARK_ROUTE')).toBe('eager')
      expect(html).toContain('MARK_COMPONENT')
      expect(await read(app, 'routeTree.gen.ts')).toContain(
        "from './routes/index'",
      )
    },
    timeout,
  )
})

test(
  'the deprecated TanStackRouterVite generates the route tree and splits like tanstackRouter',
  async () => {
    const { TanStackRouterVite } = await import('../src/vite')
    const { app, html } = await buildRoute(
      'vite',
      {},
      { routes: (config) => [TanStackRouterVite(config)] },
    )
    expect(app.where('MARK_COMPONENT')).toBe('lazy')
    expect(html).toContain('MARK_COMPONENT')
    expect(await read(app, 'routeTree.gen.ts')).toContain(
      "from './routes/index'",
    )
  },
  timeout,
)
