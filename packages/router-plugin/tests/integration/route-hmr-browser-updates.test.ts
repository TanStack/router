/**
 * What a route file edit does to the live router of a running app (SPEC
 * J3.1, J3.3, G10), through real tools only (SYNTHESIS recipe P7): a real
 * dev server with the public router plugin and the framework's plugin, a
 * real page running the dev server's own HMR client, and edits of route
 * files on disk (`openRouteHmrPage`). The app keeps its own reference to the
 * router it creates (`window.__app.router`, assigned in its `main.tsx`);
 * the tests read the page and that router through public router APIs.
 *
 * These rows decide the concepts main's updater-entry controls
 * (handle-route-update.test.ts, deleted) checked with explicit inputs:
 * matching and resolving next to an edited parent or pathless
 * layout, params parsing, the generated route state of the hot `Route`
 * export, the lazy options the route tree gave a route (V4 red-astra/08),
 * removed loaders and callbacks, loader races with an older refresh or an
 * inactive preload, route context, and descendants of an edited parent;
 * and an edit of a route the router the HMR code finds on the page does not
 * have (a second router created after the app's; ruling Q5).
 */
import { describe, test } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'
import type { RouteHmrPage } from '../route-hmr-page'
import type { TestContext } from 'vitest'

const timeout = 60_000
const inPlace = { reloaded: false, errors: [] }

/** The app's entry: mounts the router and keeps the app's own reference. */
const main = `import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
const router = createRouter({ routeTree })
;(window as any).__app = { router }
createRoot(document.getElementById('app')!).render(<RouterProvider router={router} />)
`

const fileRoute = (id: string, body: string, extra = '') =>
  `import { createFileRoute, Outlet } from '@tanstack/react-router'
${extra}
export const Route = createFileRoute('${id}')({
${body}
})
`

/** A route option adding `key` to the search of a location it resolves to. */
const markSearch = (key: string) =>
  `search: { middlewares: [({ search, next }: any) => ({ ...next(search), ${key}: 1 })] },`

const home = fileRoute('/', `component: () => <p>home</p>,`)

/**
 * Navigates the app's router (to a path, or a route template with
 * `params`) and returns the route of the deepest match and the search keys
 * of the location, once the page shows `shows`.
 */
async function visit(
  app: RouteHmrPage,
  to: string,
  shows: string,
  params?: Record<string, string>,
) {
  const result = await app.evaluate<{ leaf: string; dest: Array<string> }>(
    `(async () => {
  const router = window.__app.router
  await router.navigate(${JSON.stringify({ to, params })})
  return {
    leaf: router.state.matches.at(-1)?.routeId,
    dest: Object.keys(router.state.location.search).sort(),
  }
})()`,
  )
  await app.page.waitForText(shows, { selector: '#app' })
  return result
}

/** Counters the app's routes keep on `window.__calls`. */
const calls = (app: RouteHmrPage) =>
  app.evaluate<Record<string, number>>('window.__calls ?? {}')
const count = (name: string) =>
  `{ const calls = ((window as any).__calls ??= {}); calls.${name} = (calls.${name} ?? 0) + 1 }`

describe.concurrent(
  'vite: an edit of a route the live router matches, refreshes or preloads',
  () => {
    test(
      'keeps matching and resolving routes next to an edited pathless layout or parent; a params.parse edit refreshes matching; the hot Route export keeps its generated route state',
      { timeout },
      async ({ expect, onTestFinished }: TestContext) => {
        const form = (version: string) =>
          fileRoute(
            '/livestock/$farmId/medicine/_form',
            `staticData: { version: '${version}' },
  component: () => <section>form ${version} <Outlet /></section>,`,
          )
        const path = (version: string) =>
          fileRoute(
            '/path',
            `component: () => <div>path ${version} <Outlet /></div>,`,
          )
        const item = (version: string, parse: string) =>
          fileRoute(
            '/items/$itemId',
            `params: { parse: ({ itemId }: { itemId: string }) => ${parse} },
  component: () => <p>item {Route.useParams().itemId} ${version}</p>,`,
          )
        const thing = (version: string) =>
          fileRoute(
            '/things/$thingId',
            `loader: () => ({
    version: '${version}',
    id: Route.id,
    path: Route.path,
    fullPath: Route.fullPath,
    to: Route.to,
    parent: (Route as any).parentRoute?.id,
  }),
  component: () => <p>thing {JSON.stringify(Route.useLoaderData())}</p>,`,
          )
        const app = await openRouteHmrPage({
          onTestFinished,
          files: {
            'main.tsx': main,
            'routes/index.tsx': home,
            'routes/livestock/$farmId/medicine.tsx': fileRoute(
              '/livestock/$farmId/medicine',
              `component: () => <div>medicine <Outlet /></div>,`,
            ),
            'routes/livestock/$farmId/medicine/index.tsx': fileRoute(
              '/livestock/$farmId/medicine/',
              `${markSearch('index')}
  component: () => <p>medicine index</p>,`,
            ),
            'routes/livestock/$farmId/medicine/_form.tsx': form('v1'),
            'routes/livestock/$farmId/medicine/_form/new.tsx': fileRoute(
              '/livestock/$farmId/medicine/_form/new',
              `${markSearch('new')}
  component: () => <p>medicine new</p>,`,
            ),
            'routes/path.tsx': path('v1'),
            'routes/path/index.tsx': fileRoute(
              '/path/',
              `${markSearch('index')}
  component: () => <p>path index</p>,`,
            ),
            'routes/items/$itemId.tsx': item(
              'v1',
              `/^\\d+$/.test(itemId) ? { itemId } : false`,
            ),
            'routes/things/$thingId.tsx': thing('v1'),
          },
          ready: 'home',
        })

        // An index route and the route under a pathless layout, by path and
        // by route template, before and after the layout's edit
        const index = {
          leaf: '/livestock/$farmId/medicine/',
          dest: ['index'],
        }
        const added = {
          leaf: '/livestock/$farmId/medicine/_form/new',
          dest: ['new'],
        }
        const medicine = async () => [
          await visit(app, '/livestock/1/medicine', 'medicine index'),
          await visit(app, '/livestock/$farmId/medicine', 'medicine index', {
            farmId: '1',
          }),
          await visit(app, '/livestock/$farmId/medicine/new', 'medicine new', {
            farmId: '1',
          }),
          await visit(app, '/livestock/1/medicine/new', 'form v1 medicine new'),
        ]
        expect(await medicine()).toEqual([index, index, added, added])
        expect(
          await app.edit(
            { 'routes/livestock/$farmId/medicine/_form.tsx': form('v2') },
            'form v2 medicine new',
          ),
        ).toEqual(inPlace)
        expect(
          await app.evaluate(
            `window.__app.router.state.matches.find((match) => match.routeId === '/livestock/$farmId/medicine/_form')?.staticData`,
          ),
        ).toEqual({ version: 'v2' })
        const again = [
          await visit(app, '/livestock/1/medicine', 'medicine index'),
          await visit(app, '/livestock/$farmId/medicine', 'medicine index', {
            farmId: '1',
          }),
          await visit(app, '/livestock/$farmId/medicine/new', 'form v2', {
            farmId: '1',
          }),
          await visit(app, '/livestock/1/medicine/new', 'form v2 medicine new'),
        ]
        expect(again).toEqual([index, index, added, added])

        // An index route under its edited parent
        const pathIndex = { leaf: '/path/', dest: ['index'] }
        expect(await visit(app, '/path', 'path v1 path index')).toEqual(
          pathIndex,
        )
        expect(
          await app.edit(
            { 'routes/path.tsx': path('v2') },
            'path v2 path index',
          ),
        ).toEqual(inPlace)
        expect(await visit(app, '/', 'home')).toMatchObject({ leaf: '/' })
        expect(await visit(app, '/path', 'path v2 path index')).toEqual(
          pathIndex,
        )
        expect(await visit(app, '/path/', 'path v2 path index')).toEqual(
          pathIndex,
        )

        // A params.parse edit: what the route matches follows the new parser
        expect((await visit(app, '/items/1', 'item 1 v1')).leaf).toBe(
          '/items/$itemId',
        )
        expect((await visit(app, '/items/abc', 'Not Found')).leaf).not.toBe(
          '/items/$itemId',
        )
        await visit(app, '/items/1', 'item 1 v1')
        expect(
          await app.edit(
            { 'routes/items/$itemId.tsx': item('v2', '({ itemId })') },
            'item 1 v2',
          ),
        ).toEqual(inPlace)
        expect((await visit(app, '/items/abc', 'item abc v2')).leaf).toBe(
          '/items/$itemId',
        )

        // Code reading the hot module's Route export sees the route's
        // generated place in the tree
        const generated = {
          id: '/things/$thingId',
          path: 'things/$thingId',
          fullPath: '/things/$thingId',
          to: '/things/$thingId',
          parent: '__root__',
        }
        await visit(app, '/things/7', 'thing')
        expect(
          JSON.parse((await app.page.text('#app')).replace(/^thing /, '')),
        ).toEqual({ version: 'v1', ...generated })
        expect(
          await app.edit(
            { 'routes/things/$thingId.tsx': thing('v2') },
            '"version":"v2"',
          ),
        ).toEqual(inPlace)
        expect(
          JSON.parse((await app.page.text('#app')).replace(/^thing /, '')),
        ).toEqual({ version: 'v2', ...generated })
        expect(app.loads()).toBe(1)
        expect(app.page.errors).toEqual([])
      },
    )

    test(
      'keeps the hot loader data when an older refresh settles later',
      { timeout },
      async ({ expect, onTestFinished }: TestContext) => {
        const root = (loader: string) =>
          `import { createRootRoute, Outlet } from '@tanstack/react-router'
export const Route = createRootRoute({
  loader: ${loader},
  component: () => <div>root {String(Route.useLoaderData())} <Outlet /></div>,
})
`
        const app = await openRouteHmrPage({
          onTestFinished,
          files: {
            'main.tsx': main,
            'routes/__root.tsx': root(`() => {
    ${count('old')}
    const gate = (window as any).__gate
    return gate ? gate.promise : 'initial'
  }`),
            'routes/index.tsx': home,
          },
          ready: 'root initial home',
        })
        // An older refresh, still loading when the edit lands
        await app.evaluate(`(() => {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  window.__gate = { promise, resolve }
  window.__refresh = window.__app.router.invalidate()
})()`)
        await expect.poll(async () => (await calls(app)).old).toBe(2)
        expect(
          await app.edit(
            {
              'routes/__root.tsx': root(`() => {
    ${count('hot')}
    return 'hot'
  }`),
            },
            'root hot home',
          ),
        ).toEqual(inPlace)
        await app.evaluate(`(async () => {
  window.__gate.resolve('stale')
  await window.__refresh
})()`)
        expect(await app.page.text('#app')).toBe('root hot home')
        // The old loader does not run again; the hot one runs at least once
        // (how often an edit runs a changed loader is the router's business,
        // ruling 2026-10-24)
        const { old, hot } = await calls(app)
        expect({ old, hot: hot! >= 1 }).toEqual({ old: 2, hot: true })
        expect(
          await app.evaluate(
            `window.__app.router.state.matches.map((match) => [match.routeId, match.loaderData ?? null])`,
          ),
        ).toEqual([
          ['__root__', 'hot'],
          ['/', null],
        ])
        expect(app.loads()).toBe(1)
      },
    )

    test(
      'does not cache an obsolete inactive preload, nor run removed loader or beforeLoad callbacks on a later visit',
      { timeout },
      async ({ expect, onTestFinished }: TestContext) => {
        const pre = (loader: string) =>
          fileRoute(
            '/pre',
            `loader: ${loader},
  preloadStaleTime: Infinity,
  component: () => <p>pre {String(Route.useLoaderData())}</p>,`,
          )
        const gone = (callbacks: boolean) =>
          fileRoute(
            '/gone',
            `${
              callbacks
                ? `beforeLoad: () => { ${count('beforeLoad')}; return { hotBeforeLoad: true } },
  loader: () => { ${count('loader')}; return 'hot loader data' },`
                : ''
            }
  staleTime: Infinity,
  gcTime: Infinity,
  component: () => <p>gone {String(Route.useLoaderData())} {String((Route.useRouteContext() as any).hotBeforeLoad)}</p>,`,
          )
        const app = await openRouteHmrPage({
          onTestFinished,
          files: {
            'main.tsx': main,
            'routes/index.tsx': home,
            'routes/other.tsx': fileRoute(
              '/other',
              `component: () => <p>other</p>,`,
            ),
            'routes/pre.tsx': pre(`() => {
    ${count('preOld')}
    return (window as any).__preGate.promise
  }`),
            'routes/gone.tsx': gone(true),
          },
          ready: 'home',
        })

        // An inactive preload still loading when the edit lands
        await app.evaluate(`(() => {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  window.__preGate = { promise, resolve }
  window.__preload = window.__app.router.preloadRoute({ to: '/pre' })
})()`)
        await expect.poll(async () => (await calls(app)).preOld).toBe(1)
        expect(
          await app.edit(
            {
              'routes/pre.tsx': pre(`() => {
    ${count('preNew')}
    return 'hot'
  }`),
            },
            'home',
          ),
        ).toEqual(inPlace)
        await app.evaluate(`(async () => {
  window.__preGate.resolve('obsolete')
  await window.__preload
})()`)
        await visit(app, '/pre', 'pre hot')
        // The obsolete loader does not run again; the new one runs at least
        // once (ruling 2026-10-24: not exactly once)
        const { preOld, preNew } = await calls(app)
        expect({ preOld, preNew: preNew! >= 1 }).toEqual({
          preOld: 1,
          preNew: true,
        })

        // Callbacks an edit removes from a route the router cached
        await visit(app, '/gone', 'gone hot loader data true')
        await visit(app, '/other', 'other')
        expect(await calls(app)).toMatchObject({ beforeLoad: 1, loader: 1 })
        expect(
          await app.edit({ 'routes/gone.tsx': gone(false) }, 'other'),
        ).toEqual(inPlace)
        await visit(app, '/gone', 'gone undefined undefined')
        expect(await calls(app)).toMatchObject({ beforeLoad: 1, loader: 1 })
        expect(
          await app.evaluate(`(() => {
  const match = window.__app.router.state.matches.find((match) => match.routeId === '/gone')
  return { loaderData: match?.loaderData ?? null, hotBeforeLoad: 'hotBeforeLoad' in (match?.context ?? {}) }
})()`),
        ).toEqual({ loaderData: null, hotBeforeLoad: false })
        expect(app.loads()).toBe(1)
        expect(app.page.errors).toEqual([])
      },
    )
  },
)

describe.concurrent.each(['vite', 'rsbuild'] as const)(
  '%s: an edit applied to the live router',
  (bundler) => {
    test(
      'keeps the lazy options the route tree gave the route, removes a removed loader, and applies parser, context and parent edits to the active matches',
      { timeout },
      async ({ expect, onTestFinished }: TestContext) => {
        const items = (version: string) =>
          fileRoute('/items/$id', `loader: () => 'data ${version}',`)
        const hot = (loader: boolean) =>
          fileRoute(
            '/hot',
            `${loader ? `loader: () => 'stale loader data',` : ''}
    component: () => <p>hot {String(Route.useLoaderData() ?? 'no data')}</p>,`,
          )
        const ctx = (version: string) =>
          fileRoute(
            '/ctx/$itemId',
            `params: { parse: ({ itemId }: { itemId: string }) => ({ itemId, parser: '${version}' }) },
    context: () => ({ source: '${version}' }),
    component: () => {
      const params: any = Route.useParams()
      const context: any = Route.useRouteContext()
      return <p>ctx {params.itemId} {params.parser} {context.source}</p>
    },`,
          )
        const parent = (version: string) =>
          fileRoute(
            '/parent',
            `context: () => ({ source: '${version}' }),
    component: () => <div>parent <Outlet /></div>,`,
          )
        const app = await openRouteHmrPage({
          bundler,
          onTestFinished,
          files: {
            'main.tsx': main,
            'routes/index.tsx': home,
            'routes/items.$id.tsx': items('v1'),
            'routes/items.$id.lazy.tsx': `import { createLazyFileRoute } from '@tanstack/react-router'
  export const Route = createLazyFileRoute('/items/$id')({
    component: () => <p>lazy {String(Route.useLoaderData())}</p>,
  })
  `,
            'routes/hot.tsx': hot(true),
            'routes/ctx/$itemId.tsx': ctx('old'),
            'routes/parent.tsx': parent('old'),
            'routes/parent/child.tsx': fileRoute(
              '/parent/child',
              `context: ({ context }: any) => ({ inheritedSource: context.source }),
    component: () => <p>child {String((Route.useRouteContext() as any).inheritedSource)}</p>,`,
            ),
          },
          ready: 'home',
        })

        // The edited route file has no lazy options; the route keeps the ones
        // the route tree gave it (its `.lazy.tsx` component)
        await visit(app, '/items/1', 'lazy data v1')
        expect(
          await app.edit(
            { 'routes/items.$id.tsx': items('v2') },
            'lazy data v2',
          ),
        ).toEqual(inPlace)
        await visit(app, '/items/2', 'lazy data v2')
        expect(await app.page.text('#app')).toBe('lazy data v2')

        // A loader the edit removes: its stale data goes
        await visit(app, '/hot', 'hot stale loader data')
        expect(
          await app.edit({ 'routes/hot.tsx': hot(false) }, 'hot no data'),
        ).toEqual(inPlace)
        expect(
          await app.evaluate(
            `window.__app.router.state.matches.map((match) => [match.routeId, match.loaderData ?? null])`,
          ),
        ).toEqual([
          ['__root__', null],
          ['/hot', null],
        ])

        // Parser and route-context edits on the active route
        await visit(app, '/ctx/abc', 'ctx abc old old')
        expect(
          await app.edit(
            { 'routes/ctx/$itemId.tsx': ctx('new') },
            'ctx abc new new',
          ),
        ).toEqual(inPlace)

        // A parent's edit reaches the context its active child derives
        await visit(app, '/parent/child', 'parent child old')
        expect(
          await app.edit(
            { 'routes/parent.tsx': parent('new') },
            'parent child new',
          ),
        ).toEqual(inPlace)
        expect(app.loads()).toBe(1)
        expect(app.page.errors).toEqual([])
      },
    )

    // The route HMR code updates the router it finds on the page: with a
    // second router created after the app's, the hot update is for a route
    // that router does not have. The app keeps working.
    test(
      "an edit while the page has a second router created after the app's keeps the app working",
      { timeout },
      async ({ expect, onTestFinished }: TestContext) => {
        const page = (version: string) =>
          fileRoute('/', `component: () => <p>home ${version}</p>,`)
        const app = await openRouteHmrPage({
          bundler,
          onTestFinished,
          files: {
            'main.tsx': `import { createRoot } from 'react-dom/client'
import { RouterProvider, createRootRoute, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
const router = createRouter({ routeTree })
;(window as any).__app = { router }
createRoot(document.getElementById('app')!).render(<RouterProvider router={router} />)
// A second router of the page (e.g. an embedded widget's, code-based)
createRouter({ routeTree: createRootRoute() })
`,
            'routes/index.tsx': page('v1'),
            'routes/other.tsx': fileRoute(
              '/other',
              `component: () => <p>other</p>,`,
            ),
          },
          ready: 'home v1',
        })
        expect(
          await app.edit({ 'routes/index.tsx': page('v2') }, 'home v2'),
        ).toEqual(inPlace)
        await visit(app, '/other', 'other')
        expect(app.loads()).toBe(1)
        expect(app.page.errors).toEqual([])
      },
    )
  },
)
