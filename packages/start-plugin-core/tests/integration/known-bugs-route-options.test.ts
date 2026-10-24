/**
 * Known bugs in how Start reads route options from route files. Each pin
 * asserts correct behaviour for a bug on main and is marked .fails; remove
 * .fails when the bug is fixed. Each pin has a control test that runs the
 * same harness on a case that works.
 *
 * Start decides from the route generator's view of a route file which routes
 * are server-only (pruned from the client route tree), and strips the server
 * options (`server`, `headers`, `ssr`) of route modules from the client.
 * Resolving every option key is best effort, but a missed key must never
 * prune a route or leave server code in the client bundle.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../build-harness'
import type { StartBuild } from '../build-harness'

const timeout = 60_000

const routeHead = `import { createFileRoute } from '@tanstack/react-router'
const Page = () => null
`

/**
 * Rows of route options that keep a route with server handlers a page, with
 * the declarations they read.
 */
const pageOptions = [
  {
    name: 'a spread',
    head: `const clientOptions = { component: Page }\n`,
    options: `...clientOptions`,
  },
  {
    name: 'a computed key',
    head: `const key = 'component'\n`,
    options: `[key]: Page`,
  },
  { name: 'a method', head: '', options: `component() { return null }` },
  {
    name: 'an async method',
    head: '',
    options: `async loader() { return null }`,
  },
  { name: 'an accessor', head: '', options: `get component() { return Page }` },
]

/** Casts real route files wrap their options in. */
const casts = [
  { name: 'as never', wrap: (options: string) => `(${options} as never)` },
  { name: 'as any', wrap: (options: string) => `(${options} as any)` },
  {
    name: 'satisfies',
    wrap: (options: string) => `(${options} satisfies Record<string, unknown>)`,
  },
]

/** Route path (and file name) of a row. */
const slug = (name: string) => name.replace(/\W+/g, '-')

describe.each(startBundlers)('%s build: server-only routes', (bundler) => {
  /**
   * One app with a route file per row, each importing a module whose code
   * carries the row's marker into its server handler.
   */
  const files: Record<string, string> = {
    'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
    'src/routes/page.tsx': `${routeHead}export const Route = createFileRoute('/page')({ server: { handlers: {} }, component: Page })\n`,
    'src/routes/api.tsx': `${routeHead}export const Route = createFileRoute('/api')({ server: { handlers: {} } })\n`,
    // The same two routes with string option keys, and with an aliased
    // Route export.
    'src/routes/string-keys.tsx': `${routeHead}export const Route = createFileRoute('/string-keys')({ 'server': { handlers: {} }, 'component': Page })\n`,
    'src/routes/string-keys-api.tsx': `${routeHead}export const Route = createFileRoute('/string-keys-api')({ 'server': { handlers: {} } })\n`,
    'src/routes/aliased.tsx': `${routeHead}const PageRoute = createFileRoute('/aliased')({ server: { handlers: {} }, component: Page })\nexport { PageRoute as Route }\n`,
    'src/routes/aliased-api.tsx': `${routeHead}const ApiRoute = createFileRoute('/aliased-api')({ server: { handlers: {} } })\nexport { ApiRoute as Route }\n`,
    'src/router.ts': `import { routeTree } from './routeTree.gen'
export const getRouter = () => ({ routeTree })
`,
    'src/entry.ts': `export { getRouter } from './router'\n`,
  }
  for (const { name, head, options } of pageOptions) {
    files[`src/routes/${slug(name)}.tsx`] =
      `${routeHead}${head}export const Route = createFileRoute('/${slug(name)}')({ server: { handlers: {} }, ${options} })\n`
  }
  for (const { name, wrap } of casts) {
    const marker = `MARK_CAST_${slug(name).toUpperCase().replace(/-/g, '_')}`
    files[`src/deps/${slug(name)}.ts`] =
      `export const handle = () => '${marker}'\n`
    files[`src/routes/cast-${slug(name)}.tsx`] =
      `import { createFileRoute } from '@tanstack/react-router'
import { handle } from '../deps/${slug(name)}'
export const Route = createFileRoute('/cast-${slug(name)}')(${wrap(
        `{ server: { handlers: { GET: () => handle() } } }`,
      )})
`
  }

  let build: StartBuild
  let dispose: (() => Promise<void>) | undefined
  /** Ids of the routes of the client build's route tree. */
  let clientRoutes: Array<string>
  beforeAll(async () => {
    build = await buildStart({
      bundler,
      files,
      entry: 'src/entry.ts',
      registerCleanup: (cleanup) => {
        dispose = cleanup
      },
    })
    clientRoutes = (
      await build.client.run(
        `return Object.values(entry.getRouter().routeTree.children ?? {}).map((route) => route.options.id)`,
      )
    ).result as Array<string>
  }, timeout)
  afterAll(() => dispose?.())

  // Control for the pins below (same build).
  test('a route with server handlers and a component is in the client route tree', () => {
    expect(clientRoutes).toContain('/page')
  })

  // Vite: control for the pins below (same build).
  // Rsbuild bug: Start prunes server-only routes from the client route tree
  // only in its Vite plugin; Rsbuild keeps them (their route modules have
  // no server code left).
  // Source: only vite/start-router-plugin/plugin.ts calls
  // `pruneServerOnlySubtrees`; Rsbuild parity is the intended behaviour.
  // Impact: Rsbuild client bundles ship the route tree entries and route
  // modules of server-only routes, which Vite builds leave out.
  test('a route with only server handlers is not in the client route tree', () => {
    expect(clientRoutes).not.toContain('/api')
  })

  // Option keys written as strings and a Route exported under an alias are
  // read like the plain ones above (same build; moved from router-generator
  // known-bugs.test.ts, which read the generator's internal option keys).
  describe.each([
    {
      name: 'string option keys',
      page: '/string-keys',
      api: '/string-keys-api',
    },
    { name: 'an aliased Route export', page: '/aliased', api: '/aliased-api' },
  ])('$name', ({ page, api }) => {
    test('a route with server handlers and a component is in the client route tree', () => {
      expect(clientRoutes).toContain(page)
    })

    // Rsbuild does not prune the client route tree yet (pinned above).
    test('a route with only server handlers is not in the client route tree', () => {
      expect(clientRoutes).not.toContain(api)
    })
  })

  // Bug: the route generator records only plain, non-computed, non-method
  // property keys of the route options (`createFileRouteProps`), so a
  // spread, a computed key, a method or an accessor is missed, and Start
  // takes a route with server handlers and only such client options for a
  // server-only route.
  // Impact: the route is pruned from the client route tree: navigating to it
  // in the browser finds no route.
  // Source: #8504 router-generator transform.test.ts ("records
  // method, async method and accessor option keys"), where the method and
  // accessor rows pass.
  describe.each(pageOptions)('$name', ({ name }) => {
    // Rsbuild does not prune the client route tree yet (pinned above), so
    // the route stays.
    test('a route with server handlers and these options is in the client route tree', () => {
      expect(clientRoutes).toContain(`/${slug(name)}`)
    })
  })

  // Bug: route options wrapped in a cast (`as never`, `as any`,
  // `satisfies`) are not recognised: the code splitter's `deleteNodes`
  // (Start's list: `server`, `headers`, `ssr`) skips them, and the route
  // generator records no option keys, so Start does not prune the route
  // either.
  // Impact: the route's server handlers and their server-only imports ship
  // to the client bundle.
  // Real apps wrap route options in `as never` / `as any`.
  describe.each(casts)('options wrapped in $name', ({ name }) => {
    test('the server handler code of the route is not in the client bundle', () => {
      const marker = `MARK_CAST_${slug(name).toUpperCase().replace(/-/g, '_')}`
      expect(build.client.where(marker)).toBe('nowhere')
    })
  })
})
