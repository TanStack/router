/**
 * Known bugs in how Start reads route options from route files. Each pin
 * asserts correct behaviour for a bug on main and is marked .fails; remove
 * .fails when the bug is fixed. Each pin has a control test that runs the
 * same harness on a case that works.
 *
 * Start decides from the route generator's view of a route file which routes
 * are server-only (pruned from the client route tree) and which pages to
 * prerender, and strips the server options (`server`, `headers`, `ssr`) of
 * route modules from the client. Resolving every option key is best effort,
 * but a missed key must never prune a route or skip prerendering a page, and
 * never leave server code in the client bundle.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Generator, getConfig } from '@tanstack/router-generator'
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'
import { prerenderRoutesPlugin } from '../src/start-router-plugin/generator-plugins/prerender-routes-plugin'
import { buildStart, routerRuntimeFiles, startBundlers } from './build-harness'
import type { StartBuild } from './build-harness'

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
    ...routerRuntimeFiles,
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
  ;(bundler === 'vite' ? test : test.fails)(
    'a route with only server handlers is not in the client route tree',
    () => {
      expect(clientRoutes).not.toContain('/api')
    },
  )

  // Option keys written as strings and a Route exported under an alias are
  // read like the plain ones above (same build; moved from router-generator
  // known-bugs.test.ts, which read the generator's internal option keys).
  describe.each([
    { name: 'string option keys', page: '/string-keys', api: '/string-keys-api' },
    { name: 'an aliased Route export', page: '/aliased', api: '/aliased-api' },
  ])('$name', ({ page, api }) => {
    test('a route with server handlers and a component is in the client route tree', () => {
      expect(clientRoutes).toContain(page)
    })

    // Rsbuild does not prune the client route tree yet (pinned above).
    ;(bundler === 'vite' ? test : test.fails)(
      'a route with only server handlers is not in the client route tree',
      () => {
        expect(clientRoutes).not.toContain(api)
      },
    )
  })

  // Bug: the route generator records only plain, non-computed, non-method
  // property keys of the route options (`createFileRouteProps`), so a
  // spread, a computed key, a method or an accessor is missed, and Start
  // takes a route with server handlers and only such client options for a
  // server-only route.
  // Impact: the route is pruned from the client route tree: navigating to it
  // in the browser finds no route.
  // Source: gap G11; #8504 router-generator transform.test.ts ("records
  // method, async method and accessor option keys"), where the method and
  // accessor rows pass.
  describe.each(pageOptions)('$name', ({ name }) => {
    // Rsbuild does not prune the client route tree yet (pinned above), so
    // the route stays.
    ;(bundler === 'vite' ? test.fails : test)(
      'a route with server handlers and these options is in the client route tree',
      () => {
        expect(clientRoutes).toContain(`/${slug(name)}`)
      },
    )
  })

  // Bug: route options wrapped in a cast (`as never`, `as any`,
  // `satisfies`) are not recognised: the code splitter's `deleteNodes`
  // (Start's list: `server`, `headers`, `ssr`) skips them, and the route
  // generator records no option keys, so Start does not prune the route
  // either.
  // Impact: the route's server handlers and their server-only imports ship
  // to the client bundle.
  // Source: lost-cases-campaign item 1 (SU-4/8; 4 corpus files in 3 repos
  // wrap route options in `as never` / `as any`).
  describe.each(casts)('options wrapped in $name', ({ name }) => {
    test.fails(
      'the server handler code of the route is not in the client bundle',
      () => {
        const marker = `MARK_CAST_${slug(name).toUpperCase().replace(/-/g, '_')}`
        expect(build.client.where(marker)).toBe('nowhere')
      },
    )
  })
})

describe('prerendered pages', () => {
  afterEach(() => {
    globalThis.TSS_PRERENDABLE_PATHS = undefined
  })

  /**
   * Runs the route generator with Start's prerender plugin on an app with a
   * root route and `routes` (route files by path relative to the routes
   * directory). Returns the paths Start prerenders. (This reads the pages the
   * prerender plugin hands to Start's prerender step, without a build;
   * start-build-prerender.test.ts runs the step.)
   */
  async function prerenderedPaths(routes: Record<string, string>) {
    const root = await mkdtemp(path.join(tmpdir(), 'tss-route-options-'))
    try {
      const files: Record<string, string> = {
        '__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()`,
        ...routes,
      }
      for (const [file, code] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(root, 'routes', file)), {
          recursive: true,
        })
        await writeFile(path.join(root, 'routes', file), code)
      }
      const config = getConfig({
        disableLogging: true,
        routesDirectory: path.join(root, 'routes'),
        generatedRouteTree: path.join(root, 'routeTree.gen.ts'),
        // Same filesystem as the app, so the generator can rename its temp
        // files
        tmpDir: path.join(root, '.tanstack/tmp'),
        plugins: [prerenderRoutesPlugin()],
      })
      await new Generator({ config, root }).run()
      return (globalThis.TSS_PRERENDABLE_PATHS ?? []).map((page) => page.path)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  /** Whether `/moved` (`routes/moved.tsx` holding `source`) is prerendered. */
  async function prerendered(source: string) {
    return (await prerenderedPaths({ 'moved.tsx': source })).includes('/moved')
  }

  const page = (id: string) =>
    `${routeHead}export const Route = createFileRoute('${id}')({ component: Page })\n`

  // Control for the pins below: Start prerenders the static pages, not the
  // dynamic ones, the layouts or the server-only routes.
  // Source: mutation round 3 start-router E.
  test('the static pages of an app are prerendered', async () => {
    const paths = await prerenderedPaths({
      'index.tsx': page('/'),
      'about.tsx': page('/about'),
      'posts.tsx': page('/posts'),
      'posts.$id.tsx': page('/posts/$id'),
      '_layout.tsx': page('/_layout'),
      '_layout/inside.tsx': page('/_layout/inside'),
      '(group)/grouped.tsx': page('/(group)/grouped'),
      'lazy-only.lazy.tsx': `import { createLazyFileRoute } from '@tanstack/react-router'
export const Route = createLazyFileRoute('/lazy-only')({ component: () => null })
`,
      'api.tsx': `${routeHead}export const Route = createFileRoute('/api')({ server: { handlers: {} } })\n`,
      // Pinned below
      'cast.tsx': `${routeHead}export const Route = createFileRoute('/cast')({ component: Page } as never)\n`,
    })
    expect(paths.filter((path) => path !== '/cast').sort()).toEqual([
      '/',
      '/about',
      '/grouped',
      '/inside',
      '/lazy-only',
      '/posts',
    ])
  })

  // Control for the pins below (same harness).
  test.each([
    {
      options: `{ server: { handlers: {} }, component: Page }`,
      expected: true,
    },
    { options: `{ server: { handlers: {} } }`, expected: false },
  ])(
    'a page with $options is prerendered: $expected',
    async ({ options, expected }) => {
      expect(
        await prerendered(
          `${routeHead}export const Route = createFileRoute('/moved')(${options})`,
        ),
      ).toBe(expected)
    },
  )

  // Bug: same root cause as the server-only routes above: a page whose
  // component comes from a spread, a computed key or a method has no
  // recorded `component` key, and Start's prerender plugin skips it.
  // Impact: the page is not prerendered.
  // Source: gap G11.
  test.fails.each(pageOptions.slice(0, 3))(
    'a page whose component comes from $name is prerendered',
    async ({ head, options }) => {
      expect(
        await prerendered(
          `${routeHead}${head}export const Route = createFileRoute('/moved')({ ${options} })`,
        ),
      ).toBe(true)
    },
  )

  // Bug: same root cause: the route generator records no option keys of
  // options wrapped in a cast, and Start's prerender plugin skips the page.
  // Impact: the page is not prerendered.
  // Source: lost-cases-campaign item 1 (route options wrapped in casts in
  // real repos).
  test.fails.each(casts)(
    'a page whose options are wrapped in $name is prerendered',
    async ({ wrap }) => {
      expect(
        await prerendered(
          `${routeHead}export const Route = createFileRoute('/moved')(${wrap('{ component: Page }')})`,
        ),
      ).toBe(true)
    },
  )
})
