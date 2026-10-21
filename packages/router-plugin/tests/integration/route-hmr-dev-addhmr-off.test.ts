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
 */
import { describe, expect, it, onTestFinished } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { waitForOutcome } from '@tanstack/compiler-test-utils/outcome'
import { entryFile, head, loadRoute, probeFile } from '../route-app'
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
 * returns, once the edit's outcome showed within the bound, whether the
 * page reloaded and whether the live router's route got the new option in
 * place.
 */
async function editWhileLoaded(
  route: string,
  options: { targetFramework?: TargetFramework; hmr: boolean; bound?: number },
) {
  const app = await loadRoute(route, {
    targetFramework: options.targetFramework,
    hmr: options.hmr,
    fresh: true,
  })
  const page = await openPage(
    new URL('/__plugin-host__/page.html', app.host.dev.url).href,
    { registerCleanup: onTestFinished },
  )
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
  const consoleBefore = page.console.length
  await app.host.edit({ 'route.tsx': edited })
  const editedInPlace = () =>
    page.page.evaluate<boolean>(
      `Object.values(window.__router?.routesById ?? {}).some((route) => route.options.staticData?.edited === true)`,
    )
  let shown = true
  try {
    await waitForOutcome({
      // A reload, the edit in the live route, or Vite's client reporting
      // the update applied (after every accept callback ran: e.g. the
      // framework's own refresh of the split component)
      applied: async () =>
        page.loads() > 1 ||
        (await editedInPlace()) ||
        page.console
          .slice(consoleBefore)
          .some((line) => line.includes('[vite] hot updated')),
      timeout: options.bound ?? 10_000,
      describe: () => `the page loaded ${page.loads()} time(s)`,
    })
  } catch {
    shown = false
  }
  // Every module of the update fetched (its accept callbacks run once it
  // is): what the page shows is the edit's whole outcome
  await page.page.waitForLoadState('networkidle').catch(() => {})
  const reloaded = page.loads() > 1
  return {
    shown,
    reloaded,
    inPlace: !reloaded && (await editedInPlace()),
    page,
    app,
  }
}

describe('a dev server with addHmr: false', () => {
  it.each(routes)(
    'applies no route HMR to an edit ($name)',
    async ({ route, targetFramework }) => {
      const { inPlace, page, app } = await editWhileLoaded(route, {
        targetFramework,
        hmr: false,
        // Long enough for the edit to show (reload or in place)
        bound: 3000,
      })
      // Reloaded, or updated by the framework's own refresh: the live route
      // never gets the edited options in place
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
