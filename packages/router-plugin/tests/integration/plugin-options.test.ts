// Slow-tier half of this suite: the tests that need a real tool. Its
// in-process tests are in ../plugin-options.test.ts (fast tier).
/**
 * Router plugin options and entry points, through real builds: what each
 * option changes in the output or on disk.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { build, routeApp, routeHead } from '../build-harness'
import type {
  BuildResult,
  Bundler,
} from '@tanstack/compiler-test-utils/build-harness'
import type { RouterPluginOptions } from '../build-harness'

const timeout = 120_000

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
    // No outcome here depends on webpack's minifier (terser): placement of
    // live code, the rendering and the generated route tree.
    ...(bundler === 'webpack' && { minify: false }),
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

// The webpack and Rspack entries use their bundler's HMR API whatever
// `plugin.hmr.style` says (src/rspack.ts, src/webpack.ts): an edit with
// `plugin.hmr.style: 'vite'` on Rsbuild hot-updates the page
// (integration/route-hmr-browser-plugin.test.ts). With `addHmr: false`, a
// development build has no route HMR code at all.
describe.each(['rspack', 'webpack'] as const)('%s entry', (bundler) => {
  test(
    'with addHmr: false, a development build with the HMR plugin has no route HMR code',
    async () => {
      const app = await build({
        bundler,
        env: 'client',
        mode: 'development',
        pluginOptions: {
          plugin: { hmr: { style: 'vite' } },
          codeSplittingOptions: { addHmr: false },
        },
        extraPlugins: () => [
          {
            apply(compiler: any) {
              new compiler.webpack.HotModuleReplacementPlugin().apply(compiler)
            },
          },
        ],
        files: routeApp(route(), { env: 'client' }),
      })
      // The bundler's own HMR runtime stays; no module accepts hot updates
      // of its own, and nothing uses Vite's hot API.
      expect({
        accepts: app.where(/\bhot\.accept\(/),
        vite: app.where(/\bimport\.meta\.hot\b/),
      }).toEqual({ accepts: 'nowhere', vite: 'nowhere' })
    },
    timeout,
  )
})
