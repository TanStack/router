/**
 * Scenarios of the route generator on a running dev server, run per bundler
 * by the integration files `dev-server-*.test.ts` (Vite) and
 * `rsbuild-dev-server-*.test.ts` (Rsbuild), on a real page
 * (`generator-dev-app.ts`): a route file created, renamed, moved or deleted
 * while the dev server runs keeps its `createFileRoute(path)` in line with
 * its location and the rest of the file untouched, the live router's routes
 * follow the route files, and each route's component loads when the app
 * navigates to it; edits of the routes a page shows, created ones included,
 * are hot updates.
 */
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  createFileRouteCall,
  expectLoadedOnNavigation,
  expectRouteFile,
  generatorDevApp,
  rootRoute,
  route,
} from './generator-dev-app'
import type { Bundler, GeneratorDevApp, LiveRoute } from './generator-dev-app'

const timeout = 30_000

const rootLive: LiveRoute = { id: '__root__', fullPath: '/', parent: undefined }

/** A live route under the root route. */
const live = (id: string, fullPath = id): LiveRoute => ({
  id,
  fullPath,
  parent: '__root__',
})

const index = { 'routes/index.tsx': route('/', 'MARK_INDEX') }
const atIndex = { pathname: '/', shows: 'MARK_INDEX' }

/**
 * Asserts that an edit of a route component the page shows appears in the
 * page without a page load.
 */
async function expectHotUpdate(
  app: GeneratorDevApp,
  files: Record<string, string>,
  expected: string | RegExp,
) {
  const loads = app.page.loads()
  await app.edit(files)
  await app.page.waitForText(expected, { selector: '#app' })
  expect(app.page.loads(), 'page loads').toBe(loads)
}

export function describeRouteFileUpkeep(
  bundler: Bundler,
  options: {
    /**
     * Pins the case of a route file created under a `physical()` mount
     * outside the routes directory (the caller's file says why), instead of
     * asserting it here.
     */
    pinPhysicalMountCreation?: boolean
  } = {},
) {
  describe(`route generator in ${bundler} dev`, () => {
    // A route template whose component is a marker of its own.
    test(
      'a created empty route file is scaffolded from the route template, joins the live routes and loads its component on navigation',
      async () => {
        const app = await generatorDevApp({
          bundler,
          files: index,
          pluginOptions: {
            customScaffolding: {
              routeTemplate:
                '%%tsrImports%%\n\n%%tsrExportStart%%{\n  component: () => <p>MARK_SCAFFOLD</p>,\n}%%tsrExportEnd%%\n',
            },
          },
        })
        await app.edit({ 'routes/posts.tsx': '' })

        expect(
          createFileRouteCall(await app.read('routes/posts.tsx')).path,
        ).toBe('/posts')
        await expectLoadedOnNavigation(app, atIndex, '/posts', 'MARK_SCAFFOLD')
        expect(await app.routes()).toEqual([
          rootLive,
          live('/'),
          live('/posts'),
        ])
        expect(app.errors()).toEqual([])
      },
      timeout,
    )

    test(
      'a created route file with another path gets its own path, keeps its code, and loads its component on navigation',
      async () => {
        const app = await generatorDevApp({ bundler, files: index })
        await app.edit({ 'routes/posts.tsx': route('/wrong', 'MARK_POSTS') })

        await expectRouteFile(
          app,
          'routes/posts.tsx',
          '/posts',
          route('/wrong', 'MARK_POSTS'),
        )
        await expectLoadedOnNavigation(app, atIndex, '/posts', 'MARK_POSTS')
        expect(await app.routes()).toEqual([
          rootLive,
          live('/'),
          live('/posts'),
        ])
        expect(app.errors()).toEqual([])
      },
      timeout,
    )

    // Source: issues #4437 (rename), #4440 (Rsbuild).
    test(
      'a renamed route file gets its new path and keeps its code, and the app serves it at that path only',
      async () => {
        const app = await generatorDevApp({
          bundler,
          files: {
            ...index,
            'routes/about.tsx': route('/about', 'MARK_ABOUT'),
          },
        })
        await app.rename('routes/about.tsx', 'routes/info.tsx')
        await app.settle()

        await expectRouteFile(
          app,
          'routes/info.tsx',
          '/info',
          route('/about', 'MARK_ABOUT'),
        )
        await expectLoadedOnNavigation(app, atIndex, '/info', 'MARK_ABOUT')
        expect(await app.routes()).toEqual([rootLive, live('/'), live('/info')])
        expect(app.errors()).toEqual([])
      },
      timeout,
    )

    // Source: issue #4343 (moving a route file into a folder), #4389.
    test(
      'a route file moved into a folder and renamed to its index gets each new path',
      async () => {
        const app = await generatorDevApp({
          bundler,
          files: { ...index, 'routes/hi.tsx': route('/hi', 'MARK_HI') },
        })
        await app.rename('routes/hi.tsx', 'routes/test/hi.tsx')
        await app.settle()
        await expectRouteFile(
          app,
          'routes/test/hi.tsx',
          '/test/hi',
          route('/hi', 'MARK_HI'),
        )
        await expectLoadedOnNavigation(app, atIndex, '/test/hi', 'MARK_HI')
        expect(await app.routes()).toEqual([
          rootLive,
          live('/'),
          live('/test/hi'),
        ])

        await app.rename('routes/test/hi.tsx', 'routes/test/index.tsx')
        await app.settle()
        await expectRouteFile(
          app,
          'routes/test/index.tsx',
          '/test/',
          route('/hi', 'MARK_HI'),
        )
        await expectLoadedOnNavigation(app, atIndex, '/test/', 'MARK_HI')
        expect(await app.routes()).toEqual([
          rootLive,
          live('/'),
          live('/test/'),
        ])
        expect(app.errors()).toEqual([])
      },
      timeout,
    )

    // Source: issues #4445, #4459 (deleted route file, Rsbuild).
    test(
      'a deleted route file leaves the live routes',
      async () => {
        const app = await generatorDevApp({
          bundler,
          files: { ...index, 'routes/bar.tsx': route('/bar', 'MARK_BAR') },
        })
        await app.visit('/bar', 'MARK_BAR')
        await app.edit({ 'routes/bar.tsx': null })

        await app.visit('/', 'MARK_INDEX')
        expect(await app.routes()).toEqual([rootLive, live('/')])
        expect(app.errors()).toEqual([])
      },
      timeout,
    )

    // Source: gap DV5 (gaps/dev-hmr.md), issue #6775 (reload loop): the dev
    // server settles (a bounded number of regenerations) and the page
    // updates in place.
    test(
      'an edit of a route component the page shows is a hot update, and the dev server settles',
      async () => {
        const app = await generatorDevApp({ bundler, files: index })
        await app.visit('/', 'MARK_INDEX')
        await expectHotUpdate(
          app,
          { 'routes/index.tsx': route('/', 'MARK_EDITED') },
          'MARK_EDITED',
        )
        expect(app.errors()).toEqual([])
      },
      timeout,
    )

    // The route tree update that makes the app know a new route must not let
    // the new route be served unsplit, however soon the app navigates to it.
    // Source: gaps DV1/DV17 (gaps/dev-hmr.md), suspected race.
    test(
      'a route created while the page runs, navigated to as soon as the live router has it, loads its component on navigation',
      async () => {
        const app = await generatorDevApp({ bundler, files: index })
        await app.visit('/', 'MARK_INDEX')
        await app.write({ 'routes/posts.tsx': route('/posts', 'MARK_POSTS') })
        await app.page.page.waitForFunction(
          () => !!(window as any).__TSR_ROUTER__?.routesById['/posts'],
          undefined,
          { timeout: 20_000 },
        )
        expect(
          (await app.scripts())
            .filter((script) => script.code.includes('MARK_POSTS'))
            .map((script) => script.url),
        ).toEqual([])
        await app.navigate('/posts', 'MARK_POSTS')
        await app.settle()
        expect(app.errors()).toEqual([])
      },
      timeout,
    )

    if (!options.pinPhysicalMountCreation) {
      // Route files under a `physical()` mount outside the routes directory
      // are delivered edits like route-directory files (SPEC J1.10).
      test(
        'a route file created, edited and deleted under a physical() mount outside the routes directory reaches the live routes',
        async () => {
          await expectPhysicalMountRouteFile(bundler)
        },
        timeout,
      )
    }
  })
}

/**
 * Created route files the generator cannot handle yet, and edits of routes
 * created or renamed while the page runs.
 */
export function describeCreatedRoutes(
  bundler: Bundler,
  options: {
    /**
     * Pins the cases of a route file created before it exports a valid
     * `Route` (the caller's comment says why), instead of asserting them.
     */
    pinCreatedBrokenRouteFiles?: boolean
  } = {},
) {
  // Source: gap DV17 (gaps/dev-hmr.md): a route created in dev joins HMR like
  // the routes the server started with; gap GEN-14 (the root route too).
  describe(`created routes in ${bundler} dev`, () => {
    test(
      'an edit of a created route the page shows is a hot update',
      async () => {
        const app = await generatorDevApp({ bundler, files: index })
        await app.edit({ 'routes/posts.tsx': route('/posts', 'MARK_POSTS') })
        await app.visit('/posts', 'MARK_POSTS')
        await expectHotUpdate(
          app,
          { 'routes/posts.tsx': route('/posts', 'MARK_EDITED') },
          'MARK_EDITED',
        )
        expect(app.errors()).toEqual([])
      },
      timeout,
    )

    test(
      'an edit of a renamed route the page shows is a hot update',
      async () => {
        const app = await generatorDevApp({
          bundler,
          files: {
            ...index,
            'routes/about.tsx': route('/about', 'MARK_ABOUT'),
          },
        })
        await app.rename('routes/about.tsx', 'routes/info.tsx')
        await app.settle()
        await app.visit('/info', 'MARK_ABOUT')
        await expectHotUpdate(
          app,
          { 'routes/info.tsx': route('/info', 'MARK_EDITED') },
          'MARK_EDITED',
        )
        expect(app.errors()).toEqual([])
      },
      timeout,
    )

    test(
      'an edit of the root route after a route was created is a hot update',
      async () => {
        const app = await generatorDevApp({ bundler, files: index })
        await app.edit({ 'routes/posts.tsx': route('/posts', 'MARK_POSTS') })
        await app.visit('/posts', 'MARK_POSTS')
        await expectHotUpdate(
          app,
          {
            'routes/__root.tsx': rootRoute.replace(
              'MARK_ROOT',
              'MARK_ROOT_EDITED',
            ),
          },
          /MARK_ROOT_EDITED[\s\S]*MARK_POSTS/,
        )
        expect(app.errors()).toEqual([])
      },
      timeout,
    )
  })

  // Source: gap DV4 (gaps/dev-hmr.md): a route file the generator cannot
  // handle is reported, the dev server keeps running, and fixing the file
  // brings the route back.
  describe(`route generator failures in ${bundler} dev`, () => {
    test(
      'a route file broken by an edit is reported, and fixing it brings the route back',
      async () => {
        const app = await generatorDevApp({
          bundler,
          files: {
            ...index,
            'routes/posts.tsx': route('/posts', 'MARK_POSTS'),
          },
        })
        await app.edit({ 'routes/posts.tsx': 'export const Route = (' })
        expect(app.logs()).toContain('posts.tsx')

        await app.edit({ 'routes/posts.tsx': route('/posts', 'MARK_FIXED') })
        await expectLoadedOnNavigation(app, atIndex, '/posts', 'MARK_FIXED')
        expect(await app.routes()).toEqual([
          rootLive,
          live('/'),
          live('/posts'),
        ])
      },
      timeout,
    )

    if (!options.pinCreatedBrokenRouteFiles) {
      test.each(createdBrokenRouteFiles)(
        'a created route file the generator $name is reported, and fixing it adds the route',
        async ({ initial }) => {
          await expectCreatedBrokenRouteFileFixed(bundler, initial)
        },
        timeout,
      )
    }
  })
}

/** Route files the generator cannot handle as they are first saved. */
export const createdBrokenRouteFiles = [
  { name: 'cannot parse', initial: 'export const Route = (' },
  {
    name: 'finds no Route export in',
    initial: `import { createFileRoute } from '@tanstack/react-router'\n`,
  },
]

/**
 * Creates `routes/posts.tsx` as `initial`, which the generator reports and
 * leaves out of the routes, then fixes it (with another path) and asserts
 * that the route joins the live routes with its own path. `settleTimeout`
 * guards the wait for the fix (see the Rsbuild pin).
 */
export async function expectCreatedBrokenRouteFileFixed(
  bundler: Bundler,
  initial: string,
  settleTimeout?: number,
) {
  const app = await generatorDevApp({ bundler, files: index })
  await app.edit({ 'routes/posts.tsx': initial })
  expect(app.logs()).toContain('posts.tsx')
  await app.visit('/', 'MARK_INDEX')
  expect(await app.routes()).toEqual([rootLive, live('/')])

  await app.write({ 'routes/posts.tsx': route('/wrong', 'MARK_POSTS') })
  await app.settle({ timeout: settleTimeout })
  await expectRouteFile(
    app,
    'routes/posts.tsx',
    '/posts',
    route('/wrong', 'MARK_POSTS'),
  )
  await expectLoadedOnNavigation(app, atIndex, '/posts', 'MARK_POSTS')
  expect(await app.routes()).toEqual([rootLive, live('/'), live('/posts')])
  expect(app.errors()).toEqual([])
}

/**
 * An app with virtual routes mounting `features/` with `physical()` next to
 * the routes directory: a route file created there (with another path),
 * edited and deleted reaches the live routes each time. `settleTimeout`
 * guards the wait for the creation (see the Rsbuild pin).
 */
export async function expectPhysicalMountRouteFile(
  bundler: Bundler,
  settleTimeout?: number,
) {
  const app = await generatorDevApp({
    bundler,
    links: ['@tanstack/virtual-file-routes'],
    // A path relative to the root the plugin resolves it from (the Rspack
    // plugin's: the working directory)
    pluginOptions: (root) => ({
      virtualRouteConfig:
        bundler === 'vite'
          ? './routes.ts'
          : path.relative(process.cwd(), path.join(root, 'routes.ts')),
    }),
    files: {
      'routes.ts': `import { index, physical, rootRoute } from '@tanstack/virtual-file-routes'
export const routes = rootRoute('__root.tsx', [
  index('index.tsx'),
  physical('/feature', '../features'),
])
`,
      ...index,
      'features/a.tsx': route('/feature/a', 'MARK_A'),
    },
  })
  await app.write({ 'features/b.tsx': route('/wrong', 'MARK_B') })
  await app.settle({ timeout: settleTimeout })
  await expectRouteFile(
    app,
    'features/b.tsx',
    '/feature/b',
    route('/wrong', 'MARK_B'),
  )
  await expectLoadedOnNavigation(app, atIndex, '/feature/b', 'MARK_B')
  expect(await app.routes()).toEqual([
    rootLive,
    live('/'),
    live('/feature/a'),
    live('/feature/b'),
  ])

  await expectHotUpdate(
    app,
    { 'features/b.tsx': route('/feature/b', 'MARK_B_EDITED') },
    'MARK_B_EDITED',
  )

  await app.edit({ 'features/b.tsx': null })
  await app.visit('/', 'MARK_INDEX')
  expect(await app.routes()).toEqual([rootLive, live('/'), live('/feature/a')])
  expect(app.errors()).toEqual([])
}
