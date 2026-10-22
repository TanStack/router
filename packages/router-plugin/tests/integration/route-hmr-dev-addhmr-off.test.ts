/**
 * A dev server compiling with `addHmr: false` applies no route HMR (SPEC
 * J3.7: with `addHmr: false` no HMR code in any output): an edit of the
 * route file, while a page has the route module and its split modules
 * loaded, is not applied in place by route HMR code: nothing in the route's
 * modules accepts the update, so the dev server's HMR client reloads the
 * page. Whatever the compiler emits, and however it names it.
 * The control: with `addHmr: true` the same edit applies in place.
 *
 * The route app of `../route-app.ts` (the public router plugin and the
 * framework's plugin in a real Vite dev server), with a page of its own
 * that stays open across the edit (`openPage`), with the real Vite client.
 * Source: the add-hmr `@false` snapshots (every fixture compiled with
 * `addHmr: false`). Production bundles: build-production*.test.ts.
 *
 * The router plugin's Rspack entry on an Rsbuild dev server (webpack's hot
 * API, `route-hmr-page.ts`): the same outcome, decided the same way (the
 * page reloads instead of applying the edit in place); its control is the
 * Rsbuild row of route-hmr-browser-plugin.test.ts (with route HMR the edit
 * applies in place).
 */
import { describe, expect, it, onTestFinished } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import {
  hmrSyncInitScript,
  hmrSyncModule,
  settlePage,
  trackRequests,
} from '@tanstack/compiler-test-utils/hmr-sync'
import { entryFile, head, loadRoute, probeFile } from '../route-app'
import { openRouteHmrPage } from '../route-hmr-page'
import { openWebpackHmrPage } from '../webpack-hmr-page'
import type { TargetFramework } from '../route-app'

const timeout = 60_000

const fileRoute = (
  options: string,
  declarations = '',
  framework: TargetFramework = 'react',
) => `import { createFileRoute } from '@tanstack/${framework}-router'
${declarations}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  ${options}
})`

const posts = `function PostsComponent() {
  return <div>posts</div>
}
function PostsErrorComponent() {
  return <div>Error loading posts</div>
}`

const routes: Array<{
  name: string
  route: string
  targetFramework?: TargetFramework
}> = [
  {
    name: 'a split route',
    route: fileRoute('component: PostsComponent,', posts),
  },
  {
    name: 'a route with two split components',
    route: fileRoute(
      'component: PostsComponent,\n  errorComponent: PostsErrorComponent,',
      posts,
    ),
  },
  {
    name: 'a route with lowercase components',
    route: `${head}export const Route = createFileRoute('/')({
  pendingComponent: pendingComponent,
  errorComponent: errorComponent,
  component: component,
})
function pendingComponent() {
  return <div>Pending</div>
}
function errorComponent() {
  return <div>Error</div>
}
function component() {
  return <div>Hello</div>
}`,
  },
  {
    name: 'a root route',
    route: `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({
  shellComponent: ({ children }) => <html>{children}</html>,
  component: () => <div>root</div>,
})`,
  },
  {
    name: 'a root route with context',
    route: `import { createRootRouteWithContext } from '@tanstack/react-router'
interface MyRouterContext {
  auth: boolean
}
export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: RootComponent,
})
function RootComponent() {
  return <div>Hello</div>
}`,
  },
  {
    name: 'an explicitly undefined component',
    route: `${head}export const Route = createFileRoute('/')({ component: undefined })`,
  },
  {
    name: 'a Solid route',
    route: fileRoute('component: PostsComponent,', posts, 'solid'),
    targetFramework: 'solid',
  },
]

/**
 * Loads the route app with `addHmr`, opens a page of its dev server with a
 * live router over the generated route tree (every route option's module
 * loaded), edits the route file to add an option (`staticData`), and
 * returns, once the page took in and handled everything the dev server sent
 * for the edit (`settlePage`: the update applied, or the reload done),
 * whether the page reloaded and whether the live router's route got the new
 * option in place. No time bound decides the outcome: a slow update is
 * waited for.
 */
async function editWhileLoaded(
  route: string,
  options: { targetFramework?: TargetFramework; hmr: boolean },
) {
  const app = await loadRoute(route, {
    targetFramework: options.targetFramework,
    hmr: options.hmr,
    fresh: true,
    files: { 'hmr-sync.ts': hmrSyncModule },
  })
  const page = await openPage(
    new URL('/__plugin-host__/page.html', app.host.dev.url).href,
    {
      registerCleanup: onTestFinished,
      initScript: hmrSyncInitScript('/hmr-sync.ts'),
    },
  )
  const inFlight = trackRequests(page)
  await page.page.evaluate(`(async () => {
  const probe = await import('/${probeFile}')
  const entry = await import('/${entryFile}')
  const { Route } = entry.route
  for (const option of ['component', 'errorComponent', 'pendingComponent', 'notFoundComponent', 'loader']) {
    await probe.trigger(Route, option)
  }
  const { routeTree } = await import('/routeTree.gen.ts')
  window.__router = probe.createRouter({
    routeTree,
    history: probe.createMemoryHistory({ initialEntries: ['/'] }),
  })
  await window.__router.load()
})()`)
  const edited = route.replace('({', '({ staticData: { edited: true },')
  expect(edited).not.toBe(route)
  // The page imported the sync module (it holds a first token)
  await settlePage(app.host.dev, page, inFlight)
  const consoleBefore = page.console.length
  await app.host.edit({ 'route.tsx': edited })
  await settlePage(app.host.dev, page, inFlight)
  const editedInPlace = () =>
    page.page.evaluate<boolean>(
      `Object.values(window.__router?.routesById ?? {}).some((route) => route.options.staticData?.edited === true)`,
    )
  const reloaded = page.loads() > 1
  const inPlace = !reloaded && (await editedInPlace())
  // Shown: a reload, the edit in the live route, or Vite's client reporting
  // the update applied (e.g. by the framework's own refresh of the split
  // component)
  const shown =
    reloaded ||
    inPlace ||
    page.console
      .slice(consoleBefore)
      .some((line) => line.includes('[vite] hot updated'))
  return { shown, reloaded, inPlace, page, app }
}

describe('a dev server with addHmr: false', () => {
  it.each(routes)(
    'applies no route HMR to an edit ($name)',
    async ({ route, targetFramework }) => {
      const { shown, inPlace, page, app } = await editWhileLoaded(route, {
        targetFramework,
        hmr: false,
      })
      // Reloaded, or updated by the framework's own refresh: the live route
      // never gets the edited options in place
      expect(shown, 'the edit showed (a reload or a refresh)').toBe(true)
      expect(
        inPlace,
        [
          ...page.console,
          JSON.stringify(
            app.host.dev.hmr.map((message) => [message.type, message.paths]),
          ),
        ].join('\n'),
      ).toBe(false)
    },
    timeout,
  )
})

// Control of the observation: the same edit, compiled with route HMR,
// applies in place (the live route gets the new option, no reload).
it(
  'a dev server with addHmr: true applies the same edit in place (a split route)',
  async () => {
    const { shown, reloaded, inPlace } = await editWhileLoaded(
      routes[0]!.route,
      { hmr: true },
    )
    expect({ shown, reloaded, inPlace }).toEqual({
      shown: true,
      reloaded: false,
      inPlace: true,
    })
  },
  timeout,
)

// The Rspack entry with `addHmr: false` (an Rsbuild dev server with the
// framework's React Refresh): no route module accepts the edit, so the page
// reloads to show it; with route HMR it applies in place (control:
// route-hmr-browser-plugin.test.ts "plugin.hmr.style: vite (rsbuild)").
// Source: plugin-options.test.ts "with addHmr: false, a development build
// with the HMR plugin has no route HMR code" (which looked for the hot API's
// accept call by a local name in the build).
it(
  'an Rsbuild dev server with addHmr: false applies no route HMR to an edit',
  async () => {
    const route = (version: string) =>
      `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  loader: () => 'data ${version}',
  component: Page,
})
function Page() {
  const data = Route.useLoaderData()
  return <p>page ${version} {data}</p>
}
`
    const app = await openRouteHmrPage({
      bundler: 'rsbuild',
      pluginOptions: { codeSplittingOptions: { addHmr: false } },
      files: { 'routes/index.tsx': route('v1') },
      ready: 'page v1 data v1',
    })
    expect(
      await app.edit({ 'routes/index.tsx': route('v2') }, 'page v2 data v2'),
    ).toEqual({ reloaded: true, errors: [] })
  },
  timeout,
)

// The webpack entry with `addHmr: false` (webpack-dev-server with `hot: true`,
// as the webpack quickstart example runs it; no React Refresh): no route
// module accepts the edit, so webpack's HMR client reloads the page to show
// it. The control below: with route HMR the same edit applies in place. The
// edit changes the loader only: without a refresh runtime, route HMR keeps
// the old component (pinned in known-bugs-route-hmr-removals.test.ts "rsbuild
// without React Refresh"), so a component edit would not tell the two apart.
// Source: plugin-options.test.ts "with addHmr: false, a development build
// with the HMR plugin has no route HMR code" (which looked for the hot API's
// accept call by a local name in a webpack development build).
describe('a webpack dev server', () => {
  const route = (version: string) =>
    `import { createElement } from 'react'
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  loader: () => 'data ${version}',
  component: Page,
})
function Page() {
  const data = Route.useLoaderData()
  return createElement('p', null, 'page ', data)
}
`

  it(
    'with addHmr: false applies no route HMR to an edit',
    async () => {
      const app = await openWebpackHmrPage({
        pluginOptions: { codeSplittingOptions: { addHmr: false } },
        files: { 'routes/index.ts': route('v1') },
        ready: 'page data v1',
      })
      expect(
        await app.edit({ 'routes/index.ts': route('v2') }, 'page data v2'),
      ).toEqual({ reloaded: true, errors: [] })
    },
    timeout,
  )

  it(
    'with route HMR applies the same edit in place',
    async () => {
      const app = await openWebpackHmrPage({
        files: { 'routes/index.ts': route('v1') },
        ready: 'page data v1',
      })
      expect(
        await app.edit({ 'routes/index.ts': route('v2') }, 'page data v2'),
      ).toEqual({ reloaded: false, errors: [] })
    },
    timeout,
  )
})
