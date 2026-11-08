// Slow-tier half of this suite: the tests that need a real tool. Its
// in-process tests are in ../plugin-options.test.ts (fast tier).
/**
 * Router plugin options and entry points, through real builds: what each
 * option changes in the output or on disk.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { build, clientMountEntry, routeApp, routeHead } from '../build-harness'
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

/**
 * Client entry re-exporting the index route module next to `mount` (see
 * `clientMountEntry`) and `renderTree()`, which renders the app at `/`
 * through the real router over the generated route tree and returns the
 * HTML once it shows the page (or after 2 seconds).
 */
const treeEntry = `${clientMountEntry}import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export async function renderTree() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  flushSync(() => root.render(createElement(RouterProvider, { router })))
  for (let tries = 0; tries < 200 && !container.innerHTML.includes('MARK_COMPONENT'); tries++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  const html = container.innerHTML
  root.unmount()
  container.remove()
  return html
}
`

/**
 * Builds the route for the client and renders its component; `script`
 * (run after mounting it) gives `result`.
 */
async function buildRoute(
  bundler: Bundler,
  pluginOptions: RouterPluginOptions,
  options: {
    files?: Record<string, string>
    routes?: (config: RouterPluginOptions) => Array<unknown>
    script?: string
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
  const run = await app.run(
    `await entry.mount(entry.Route.options.component)\n${options.script ?? ''}`,
  )
  return { app, html: run.html, result: run.result }
}

const read = (app: BuildResult, file: string) =>
  readFile(path.join(app.root, file), 'utf8').catch(() => null)

// Every cell per bundler entry, `undefined` included: each entry (Vite,
// Rspack, webpack) takes the user's options through its own code before the
// default applies, so an entry could resolve an absent option differently;
// the harness itself turns splitting on, so these are the only checks of
// the default per entry.
describe.each([false, undefined])(
  'autoCodeSplitting: %s',
  (autoCodeSplitting) => {
    test.each(bundlers)(
      'splits nothing and still generates the route tree (%s)',
      async (bundler) => {
        const { app, html, result } = await buildRoute(
          bundler,
          { autoCodeSplitting },
          {
            files: { 'entry.ts': treeEntry },
            script: 'return await entry.renderTree()',
          },
        )
        // The route's component loads with the app (whatever other chunks
        // a correct compiler or the bundler emits)
        expect(app.where('MARK_COMPONENT')).toBe('eager')
        expect(html).toContain('MARK_COMPONENT')
        // The generated tree exists, and the real router over it renders
        // the index route at `/` (however the tree spells its imports).
        expect(await read(app, 'routeTree.gen.ts')).not.toBeNull()
        expect(result).toContain('MARK_COMPONENT')
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
