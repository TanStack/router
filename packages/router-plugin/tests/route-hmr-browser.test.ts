/**
 * Route HMR as the developer sees it: a real dev server (Vite with the
 * framework's Vite plugin, or Rsbuild with `@rsbuild/plugin-react`) serves a
 * file-based app with the real router package to a real browser page, and
 * the test edits its route files on disk (`route-hmr-page.ts`). An edit must
 * show its new code; where a hot update is feasible, without a full reload,
 * keeping the state of the components React Refresh patches in place.
 *
 * Several edits share one dev server and page. The tests run concurrently
 * (each has its own dev server and page; most of their time is waiting).
 */
import { describe, it } from 'vitest'
import type { TestContext } from 'vitest'
import { openRouteHmrPage } from './route-hmr-page'
import type { RouteHmrPage } from './route-hmr-page'

const timeout = 90_000

/**
 * A React route file creating the route at `path` with `options`, after
 * `declarations` (it imports `createFileRoute` and `notFound` of the router
 * package, and React's `useState`).
 */
const fileRoute = (
  path: string,
  declarations: string,
  options: string,
) => `import { createFileRoute, notFound } from '@tanstack/react-router'
import { useState } from 'react'
${declarations}
export const Route = createFileRoute('${path}')({
  ${options}
})
`

/**
 * A component named `name` whose button counts its clicks and names the
 * version of the route file: `<name> <version> count <clicks>`.
 */
const counter = (name: string, version: string) => `function ${name}() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>${name} ${version} count {count}</button>
}`

/**
 * Route files at `/<path>` whose component keeps a click count: each is a
 * function of the version its component and loader show. Sources: add-hmr
 * snapshot fixtures arrow-function, function-declaration, multi-component
 * and string-literal-keys; the split loader rows replace
 * react-refresh-route-components "does not keep a split loader in the HMR
 * data"; "user bindings" is the former react-refresh-route-components
 * "route HMR code next to user bindings with common names" (the route HMR
 * code declares `hotData` and `handleRouteUpdate` of its own).
 */
const statefulRoutes: Array<{
  name: string
  path: string
  route: (version: string) => string
  shows: (version: string) => string
  /** The route's loader is split from the route module. */
  splitLoader?: boolean
}> = [
  {
    name: 'an arrow function component',
    path: 'arrow',
    route: (v) =>
      fileRoute(
        '/arrow',
        `const Page = () => {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>arrow ${v} count {count}</button>
}`,
        'component: Page,',
      ),
    shows: (v) => `arrow ${v} count`,
  },
  {
    name: 'two components',
    path: 'two',
    route: (v) =>
      fileRoute(
        '/two',
        `${counter('Two', v)}
function Failed() {
  return <p>failed ${v}</p>
}`,
        'component: Two,\n  errorComponent: Failed,',
      ),
    shows: (v) => `Two ${v} count`,
  },
  {
    name: 'components under quoted keys',
    path: 'quoted',
    route: (v) =>
      fileRoute(
        '/quoted',
        `${counter('Quoted', v)}
function Failed() {
  return <p>failed ${v}</p>
}`,
        `'component': Quoted,\n  'errorComponent': Failed,`,
      ),
    shows: (v) => `Quoted ${v} count`,
  },
  {
    name: 'a loader in its own chunk',
    path: 'loader-chunk',
    route: (v) =>
      fileRoute(
        '/loader-chunk',
        `function LoaderChunk() {
  const [count, setCount] = useState(0)
  const data = Route.useLoaderData()
  return <button onClick={() => setCount(count + 1)}>{data} count {count}</button>
}`,
        `loader: () => 'own chunk ${v}',
  component: LoaderChunk,
  codeSplitGroupings: [['loader'], ['component']],`,
      ),
    shows: (v) => `own chunk ${v} count`,
    splitLoader: true,
  },
  {
    name: 'a loader in the component chunk',
    path: 'shared-chunk',
    route: (v) =>
      fileRoute(
        '/shared-chunk',
        `function SharedChunk() {
  const [count, setCount] = useState(0)
  const data = Route.useLoaderData()
  return <button onClick={() => setCount(count + 1)}>{data} count {count}</button>
}`,
        `loader: () => 'component chunk ${v}',
  component: SharedChunk,
  codeSplitGroupings: [['component', 'loader']],`,
      ),
    shows: (v) => `component chunk ${v} count`,
    splitLoader: true,
  },
  {
    name: 'a value the loader and the component share',
    path: 'shared-value',
    route: (v) =>
      fileRoute(
        '/shared-value',
        `const label = 'label ${v}'
function SharedValue() {
  const [count, setCount] = useState(0)
  const data = Route.useLoaderData()
  return <button onClick={() => setCount(count + 1)}>{label} {data} count {count}</button>
}`,
        `loader: () => label,
  component: SharedValue,`,
      ),
    shows: (v) => `label ${v} label ${v} count`,
  },
  {
    name: 'user bindings named like the route HMR code',
    path: 'names',
    route: (v) =>
      fileRoute(
        '/names',
        `const hotData = 'data ${v}'
function handleRouteUpdate() {
  return 'update ${v}'
}
function Names() {
  const [count, setCount] = useState(0)
  const data = Route.useLoaderData()
  return <button onClick={() => setCount(count + 1)}>{data} {handleRouteUpdate()} count {count}</button>
}`,
        `loader: () => hotData,
  component: Names,`,
      ),
    shows: (v) => `data ${v} update ${v} count`,
  },
]

/** The index route: a component reading the live route, and its loader. */
const indexRoute = (version: string, hooks = '') =>
  fileRoute(
    '/',
    `function Page() {
  const [count, setCount] = useState(0)
  ${hooks}
  const data = Route.useLoaderData()
  return <button onClick={() => setCount(count + 1)}>page ${version} {data} {Route.fullPath} count {count}</button>
}`,
    `loader: () => 'data ${version}',
  component: Page,`,
  )

/** The index route with other component options and a loader. */
const indexRouteWith = (version: string, options: string, loader: string) =>
  fileRoute(
    '/',
    `${counter('Page', version)}
function Failed() {
  return <p>failed ${version}</p>
}
function Pending() {
  return <p>pending ${version}</p>
}
function Missing() {
  return <p>missing ${version}</p>
}`,
    `loader: ${loader},
  component: Page,
  ${options}`,
  )

/** Navigates the app's router (client side: the page does not reload). */
async function navigate(app: RouteHmrPage, to: string) {
  await app.evaluate(`window.__TSR_ROUTER__.navigate({ to: '${to}' })`)
}

/** Clicks the counter until the page shows `count <n>`. */
async function click(app: RouteHmrPage, shows: string, count: number) {
  await app.click('button')
  await app.page.waitForText(`${shows} ${count}`, { selector: '#app' })
}

describe.concurrent.each(['vite', 'rsbuild'] as const)(
  '%s: a React app',
  (bundler) => {
    // Sources: the former route-hmr.test.ts hot updates of split and unsplit
    // routes (add-hmr snapshot fixtures), regression-helpers.test.ts React
    // Refresh controls (body edit keeps state, added hook remounts).
    describe.each([true, false])(
      'with autoCodeSplitting: %s',
      (autoCodeSplitting) => {
        it(
          'shows an edited route component in place with its state, the options the edit adds, changes or removes, and remounts a component whose hooks changed',
          async ({ expect, onTestFinished }) => {
            const files: Record<string, string> = {
              'routes/index.tsx': indexRoute('v1'),
            }
            for (const { path, route } of statefulRoutes) {
              files[`routes/${path}.tsx`] = route('v1')
            }
            const app = await openRouteHmrPage({
              bundler,
              onTestFinished,
              pluginOptions: { autoCodeSplitting },
              files,
              ready: 'page v1 data v1 / count 0',
            })
            await click(app, 'page v1 data v1 / count', 1)
            // The new body, the new loader's data and the live route (`Route`)
            // show; the component keeps its state.
            expect(
              await app.edit(
                { 'routes/index.tsx': indexRoute('v2') },
                'page v2 data v2 / count 1',
              ),
            ).toEqual({ reloaded: false })
            // A component whose hooks changed loses its state (React remounts
            // it), as in any React app.
            expect(
              await app.edit(
                {
                  'routes/index.tsx': indexRoute(
                    'v3',
                    `const [other] = useState('other')`,
                  ),
                },
                'page v3 data v3 / count 0',
              ),
            ).toEqual({ reloaded: false })

            // Component options the edit adds, changes or removes.
            const failing = `() => {
    throw new Error('loader failed')
  }`
            expect(
              await app.edit(
                {
                  'routes/index.tsx': indexRouteWith(
                    'v4',
                    'errorComponent: Failed,',
                    failing,
                  ),
                },
                'failed v4',
              ),
            ).toEqual({ reloaded: false })
            expect(
              await app.edit(
                {
                  'routes/index.tsx': indexRouteWith(
                    'v5',
                    'errorComponent: Failed,',
                    failing,
                  ),
                },
                'failed v5',
              ),
            ).toEqual({ reloaded: false })
            // Without its error component, the route shows the router's
            // default one. (Whether without a reload: pinned in
            // known-bugs-route-hmr.test.ts, "removing a split option".)
            await app.edit(
              { 'routes/index.tsx': indexRouteWith('v6', '', failing) },
              /^(?!.*failed v).*loader failed/,
            )
            const pending = `() => new Promise(() => {})`
            for (const version of ['v7', 'v8']) {
              expect(
                await app.edit(
                  {
                    'routes/index.tsx': indexRouteWith(
                      version,
                      'pendingComponent: Pending,\n  pendingMs: 0,\n  pendingMinMs: 0,',
                      pending,
                    ),
                  },
                  `pending ${version}`,
                ),
              ).toEqual({ reloaded: false })
            }
            for (const version of ['v9', 'v10']) {
              expect(
                await app.edit(
                  {
                    'routes/index.tsx': indexRouteWith(
                      version,
                      'notFoundComponent: Missing,',
                      `() => {
    throw notFound()
  }`,
                    ),
                  },
                  `missing ${version}`,
                ),
              ).toEqual({ reloaded: false })
            }

            // Other shapes of route files. (A loader split from the route
            // module on Rsbuild: pinned in known-bugs-route-hmr.test.ts.)
            for (const {
              name,
              path,
              route,
              shows,
              splitLoader,
            } of statefulRoutes) {
              if (bundler === 'rsbuild' && autoCodeSplitting && splitLoader) {
                continue
              }
              await navigate(app, `/${path}`)
              await app.page.waitForText(`${shows('v1')} 0`, {
                selector: '#app',
              })
              await click(app, shows('v1'), 1)
              expect(
                await app.edit(
                  { [`routes/${path}.tsx`]: route('v2') },
                  `${shows('v2')} 1`,
                ),
                name,
              ).toEqual({ reloaded: false })
            }
          },
          timeout,
        )
      },
    )

    // Source: decision on rp:1304 (shellComponent + HMR, 2026-10-18), the
    // add-hmr snapshot fixture createRootRoute, and the factory ruling
    // (2026-10-18: a reload is fine, the edit must show).
    it(
      'shows an edited root route in place, and the shell component the edit adds, changes or removes; an edit of a route whose options a factory call builds shows',
      async ({ expect, onTestFinished }) => {
        const root = (version: string, shell = '') =>
          `import { createRootRoute, Outlet } from '@tanstack/react-router'
import { useState } from 'react'
function Root() {
  const [count, setCount] = useState(0)
  const data = Route.useLoaderData()
  return (
    <div>
      <button onClick={() => setCount(count + 1)}>root ${version} {data} count {count}</button>
      <Outlet />
    </div>
  )
}
export const Route = createRootRoute({
  loader: () => 'data ${version}',
  component: Root,${
    shell &&
    `
  shellComponent: ({ children }) => (
    <div>
      <p>shell ${shell}</p>
      {children}
    </div>
  ),`
  }
})
`
        const factoryRoute = (version: string) =>
          `import { createFileRoute } from '@tanstack/react-router'
import { makeOptions } from './-options'
export const Route = createFileRoute('/')(makeOptions('${version}'))
`
        const app = await openRouteHmrPage({
          bundler,
          onTestFinished,
          files: {
            'routes/__root.tsx': root('v1'),
            'routes/-options.tsx': `export const makeOptions = (version: string) => ({
  component: () => <p>made {version}</p>,
})
`,
            'routes/index.tsx': factoryRoute('v1'),
          },
          ready: 'root v1 data v1 count 0made v1',
        })
        await click(app, 'root v1 data v1 count', 1)
        expect(
          await app.edit(
            { 'routes/__root.tsx': root('v2') },
            'root v2 data v2 count 1',
          ),
        ).toEqual({ reloaded: false })
        // A shell changes the tree the route renders in: adding or removing it
        // may remount the route's component; editing it patches both in place.
        expect(
          await app.edit(
            { 'routes/__root.tsx': root('v3', 'v3') },
            /shell v3root v3 data v3 count \d+made v1/,
          ),
        ).toEqual({ reloaded: false })
        await click(app, 'root v3 data v3 count', 1)
        expect(
          await app.edit(
            { 'routes/__root.tsx': root('v4', 'v4') },
            'shell v4root v4 data v4 count 1made v1',
          ),
        ).toEqual({ reloaded: false })
        expect(
          await app.edit(
            { 'routes/__root.tsx': root('v5') },
            /^root v5 data v5 count \d+made v1$/,
          ),
        ).toEqual({ reloaded: false })
        // Route options a factory call builds: the edit shows, after a hot
        // update or a reload (ruling 2026-10-18).
        await app.edit({ 'routes/index.tsx': factoryRoute('v2') }, 'made v2')
      },
      timeout,
    )
  },
)

// Solid and Vue in Vite with their framework's plugin: an edit of a route
// file shows its new code. Whether it does without a full reload, keeping
// the split component (decision D10), is pinned in
// known-bugs-route-hmr.test.ts; Solid without code splitting is a hot update.
describe.concurrent.each(['solid', 'vue'] as const)(
  'vite: a %s app',
  (target) => {
    const route = (version: string) =>
      `import { createFileRoute } from '@tanstack/${target}-router'
export const Route = createFileRoute('/')({
  loader: () => 'data ${version}',
  component: Page,
})
function Page() {
  const data = Route.useLoaderData()
  return <p>page ${version} {${target === 'vue' ? 'data.value' : 'data()'}}</p>
}
`
    it.for([true, false])(
      'shows the new code of an edited route file (autoCodeSplitting: %s)',
      { timeout },
      async (
        autoCodeSplitting: boolean,
        { expect, onTestFinished }: TestContext,
      ) => {
        const app = await openRouteHmrPage({
          target,
          onTestFinished,
          pluginOptions: { autoCodeSplitting },
          files: { 'routes/index.tsx': route('v1') },
          ready: 'page v1 data v1',
        })
        const { reloaded } = await app.edit(
          { 'routes/index.tsx': route('v2') },
          'page v2 data v2',
        )
        if (target === 'solid' && !autoCodeSplitting) {
          expect(reloaded).toBe(false)
        }
      },
    )
  },
)
