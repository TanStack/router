/**
 * Control tests of the real-build harness (build-harness.ts): for each
 * bundler, the harness reports eager and lazy placement correctly, `run()`
 * executes SSR and client output, and side-effect hints reach the bundler.
 */
import { describe, expect, test } from 'vitest'
import { build, bundleApp, bundlers, routeApp } from './build-harness'
import { head } from './regression-helpers'
import type { Bundler, Placement } from './build-harness'

const timeout = 60_000

/**
 * The entry imports `./eager` statically and `./lazy` on demand, and never
 * uses the `unused` export of `./eager`.
 */
const dynamicImportApp = {
  'entry.ts': `import { eager } from './eager'
export const value = eager()
export async function load() {
  const { lazy } = await import('./lazy')
  return lazy()
}
`,
  'eager.ts': `export function eager() {
  return 'MARK_EAGER'
}
export function unused() {
  return 'MARK_UNUSED'
}
`,
  'lazy.ts': `export function lazy() {
  return 'MARK_LAZY'
}
`,
}

describe.each(bundlers)('%s', (bundler) => {
  test.each(['ssr', 'client'] as const)(
    'reports static imports as eager and dynamic imports as lazy, and runs the output (%s)',
    async (env) => {
      const app = await bundleApp({ bundler, env, files: dynamicImportApp })
      expect(app.eager).toContain(app.entry.fileName)
      expect(app.lazy).not.toHaveLength(0)
      expect({
        eager: app.where('MARK_EAGER'),
        lazy: app.where('MARK_LAZY'),
        unused: app.where('MARK_UNUSED'),
      }).toEqual({ eager: 'eager', lazy: 'lazy', unused: 'nowhere' })
      const lazyChunk = app.locate('MARK_LAZY').lazy[0]
      expect(
        app.chunks.some((chunk) => chunk.dynamicImports.includes(lazyChunk!)),
      ).toBe(true)

      const run = await app.run(`console.log('ran')
return [entry.value, await entry.load()]`)
      expect(run.result).toEqual(['MARK_EAGER', 'MARK_LAZY'])
      expect(run.logs).toEqual(['ran'])
      expect(run.html).toBe(
        env === 'client' ? '<div id="root"></div>' : undefined,
      )
    },
    timeout,
  )

  test('reports a build error through the bundler', async () => {
    await expect(
      bundleApp({
        bundler,
        files: { 'entry.ts': `import { missing } from './missing'\nmissing()` },
      }),
    ).rejects.toMatchObject({
      name: 'BuildError',
      bundler,
      errors: expect.arrayContaining([
        expect.stringMatching(/resolve ["']\.\/missing["']/),
      ]),
    })
  })
})

const splitRoute = `${head}import { heavy } from '../heavy'
function Page() {
  return <p>{heavy('MARK_COMPONENT')}</p>
}
export const Route = createFileRoute('/')({
  staticData: { label: 'MARK_ROUTE' },
  component: Page,
})
`
const heavy = `export function heavy(label: string) {
  return label
}
`

async function buildSplitRoute(bundler: Bundler, env: 'ssr' | 'client') {
  const app = await build({
    bundler,
    env,
    files: routeApp(splitRoute, { env, files: { 'heavy.ts': heavy } }),
  })
  const placement = {
    route: app.where('MARK_ROUTE'),
    component: app.where('MARK_COMPONENT'),
  }
  const run = await app.run(
    env === 'ssr'
      ? `return await entry.render(entry.Route.options.component)`
      : `await entry.mount(entry.Route.options.component)`,
  )
  return {
    placement,
    rendered: env === 'ssr' ? run.result : run.html,
  }
}

const splitRouteExpected = {
  ssr: {
    placement: { route: 'eager', component: 'lazy' },
    rendered: '<p>MARK_COMPONENT</p>',
  },
  client: {
    placement: { route: 'eager', component: 'lazy' },
    rendered: '<div id="root"><p>MARK_COMPONENT</p></div>',
  },
}

describe.each(bundlers.filter((bundler) => bundler !== 'esbuild'))(
  'router plugin with %s',
  (bundler) => {
    test.each(['ssr', 'client'] as const)(
      'loads a split component lazily and renders it (%s)',
      async (env) => {
        expect(await buildSplitRoute(bundler, env)).toEqual(
          splitRouteExpected[env],
        )
      },
      timeout,
    )

    // The router plugin reports what it cannot split with `console.warn`
    test('records console warnings of the build', async () => {
      const app = await build({
        bundler,
        files: routeApp(`${head}export function Page() {
  return <p>page</p>
}
export const Route = createFileRoute('/')({
  component: Page,
  errorComponent: () => <p>error</p>,
})
`),
      })
      expect(app.consoleMessages).toEqual([expect.stringContaining('Page')])
    })
  },
)

// Bug: the esbuild adapter never runs the route generator in a build (its
// generator only initialises in `esbuild.config`; generation happens in
// `watchChange`), so the code splitter knows no route files and splits
// nothing. The code splitter's esbuild adapter also never initialises its
// config (no `esbuild` hook calls `initUserConfig`), so it would throw once
// it saw a route file.
// Impact: `tanstackRouter({ autoCodeSplitting: true })` with esbuild bundles
// every route component into the entry, without telling the user.
test.fails.each(['ssr', 'client'] as const)(
  'router plugin with esbuild loads a split component lazily and renders it (%s)',
  async (env) => {
    expect(await buildSplitRoute('esbuild', env)).toEqual(
      splitRouteExpected[env],
    )
  },
  timeout,
)

describe('side-effect hints', () => {
  /** `./effects` is imported for an export the entry never uses. */
  const unusedModuleApp = {
    'entry.ts': `import { used } from './lib'
export const value = used()
`,
    'lib.ts': `export { used } from './used'
export { unused } from './effects'
`,
    'used.ts': `export function used() {
  return 'used'
}
`,
    'effects.ts': `;(globalThis as any).effects = ['MARK_EFFECT']
export function unused() {
  return 'unused'
}
`,
  }

  test.each(bundlers)(
    '"sideEffects": false in package.json drops a module whose exports are unused (%s)',
    async (bundler) => {
      const placements: Record<string, Placement> = {}
      for (const sideEffects of [undefined, false]) {
        const app = await bundleApp({
          bundler,
          files: unusedModuleApp,
          sideEffects,
        })
        placements[String(sideEffects)] = app.where('MARK_EFFECT')
      }
      expect(placements).toEqual({ undefined: 'eager', false: 'nowhere' })
    },
    timeout,
  )

  /**
   * Unused bindings initialised by calls to a side-effectful function, with
   * and without purity annotations.
   */
  const annotatedCallsApp = {
    'entry.ts': `import { used } from './lib'
export const value = used()
`,
    'lib.ts': `function record(label: string) {
  ;(globalThis as any).recorded = [...((globalThis as any).recorded ?? []), label]
  return label
}
/* #__NO_SIDE_EFFECTS__ */
function recordAnnotated(label: string) {
  ;(globalThis as any).recorded = [...((globalThis as any).recorded ?? []), label]
  return label
}
export function used() {
  return 'used'
}
export const plain = record('MARK_PLAIN')
export const pure = /* @__PURE__ */ record('MARK_PURE')
export const noSideEffects = recordAnnotated('MARK_NO_SIDE_EFFECTS')
`,
  }

  // What each bundler drops in a production build. webpack and Rspack drop
  // unused code inside a kept module only when minifying.
  test.each(bundlers)(
    '/* @__PURE__ */ and #__NO_SIDE_EFFECTS__ let an unused call be dropped (%s)',
    async (bundler) => {
      const app = await bundleApp({ bundler, files: annotatedCallsApp })
      expect({
        plain: app.where('MARK_PLAIN'),
        pure: app.where('MARK_PURE'),
        noSideEffects: app.where('MARK_NO_SIDE_EFFECTS'),
      }).toEqual({ plain: 'eager', pure: 'nowhere', noSideEffects: 'nowhere' })
    },
    timeout,
  )
})
