/**
 * Route HMR as the developer sees it: a real dev server (Vite with the
 * framework's Vite plugin, or Rsbuild with `@rsbuild/plugin-react`) serves a
 * file-based app with the real router package to a real browser page, and
 * the test edits its route files on disk (`route-hmr-page.ts`). An edit must
 * show its new code; where a hot update is feasible, without a full reload,
 * keeping the state of the components React Refresh patches in place, and
 * without errors in the page.
 *
 * Solid and Vue apps: route-hmr-browser-frameworks.test.ts. The router
 * plugin's configurations and the route shapes it recognises:
 * route-hmr-browser-plugin.test.ts. Known bugs: known-bugs-route-hmr.test.ts.
 *
 * Several edits share one dev server and page. The tests run concurrently
 * (each has its own dev server and page; most of their time is waiting).
 */
import { describe, it } from 'vitest'
import { isAppError, openRouteHmrPage } from '../route-hmr-page'
import type { TestContext } from 'vitest'
import type { EditResult, RouteHmrPage } from '../route-hmr-page'

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
  await app.evaluate(`window.__APP_ROUTER__.navigate({ to: '${to}' })`)
}

/** Clicks the counter until the page shows `count <n>`. */
async function click(app: RouteHmrPage, shows: string, count: number) {
  await app.click('button')
  await app.page.waitForText(`${shows} ${count}`, { selector: '#app' })
}

/**
 * A hot update with no error the app did not cause itself: the errors of
 * an edit without the ones mentioning `expected` (what the app's own code
 * threw on purpose, which React and the router report).
 */
function hot(result: EditResult, ...expected: Array<string>) {
  return {
    reloaded: result.reloaded,
    errors: result.errors.filter(
      (error) => !expected.some((message) => isAppError(error, message)),
    ),
  }
}

const inPlace = { reloaded: false, errors: [] }

describe.concurrent.each(['vite', 'rsbuild'] as const)(
  '%s: a React app',
  (bundler) => {
    // Sources: the former route-hmr.test.ts hot updates of split and unsplit
    // routes (add-hmr snapshot fixtures), the former regression-helpers.test.ts
    // React Refresh controls (body edit keeps state, added hook remounts).
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
            // The loader of some versions throws on purpose; React and the
            // router report it.
            const edit = async (
              files: Record<string, string>,
              expected: string | RegExp,
            ) => hot(await app.edit(files, expected), 'loader failed')
            // The new body, the new loader's data and the live route (`Route`)
            // show; the component keeps its state.
            expect(
              await edit(
                { 'routes/index.tsx': indexRoute('v2') },
                'page v2 data v2 / count 1',
              ),
            ).toEqual(inPlace)
            // A component whose hooks changed loses its state (React remounts
            // it), as in any React app.
            expect(
              await edit(
                {
                  'routes/index.tsx': indexRoute(
                    'v3',
                    `const [other] = useState('other')`,
                  ),
                },
                'page v3 data v3 / count 0',
              ),
            ).toEqual(inPlace)

            // Component options the edit adds or changes (removing one the
            // page loaded: last).
            const failing = `() => {
    throw new Error('loader failed')
  }`
            const withError = 'errorComponent: Failed,'
            for (const version of ['v4', 'v5']) {
              expect(
                await edit(
                  {
                    'routes/index.tsx': indexRouteWith(
                      version,
                      withError,
                      failing,
                    ),
                  },
                  `failed ${version}`,
                ),
              ).toEqual(inPlace)
            }
            const withPending = `${withError}
  pendingComponent: Pending,
  pendingMs: 0,
  pendingMinMs: 0,`
            for (const version of ['v6', 'v7']) {
              expect(
                await edit(
                  {
                    'routes/index.tsx': indexRouteWith(
                      version,
                      withPending,
                      `() => new Promise(() => {})`,
                    ),
                  },
                  `pending ${version}`,
                ),
              ).toEqual(inPlace)
            }
            const withNotFound = `${withPending}
  notFoundComponent: Missing,`
            for (const version of ['v8', 'v9']) {
              expect(
                await edit(
                  {
                    'routes/index.tsx': indexRouteWith(
                      version,
                      withNotFound,
                      `() => {
    throw notFound()
  }`,
                    ),
                  },
                  `missing ${version}`,
                ),
              ).toEqual(inPlace)
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
                await edit(
                  { [`routes/${path}.tsx`]: route('v2') },
                  `${shows('v2')} 1`,
                ),
                name,
              ).toEqual(inPlace)
            }

            // An edit that removes the component options the page loaded: the
            // route shows the router's default error component. Whether in
            // place and without errors: pinned in known-bugs-route-hmr.test.ts
            // ("removes a split option the page loaded"), per bundler and
            // split setting. Last, as the pinned failure may reload the page
            // later.
            await navigate(app, '/')
            await app.page.waitForText('missing v9', { selector: '#app' })
            await edit(
              { 'routes/index.tsx': indexRouteWith('v10', '', failing) },
              /^(?!.*failed v).*loader failed/,
            )
          },
          timeout,
        )
      },
    )

    // Source: SPEC J3.5 (shellComponent and HMR), the add-hmr snapshot
    // fixture createRootRoute, and SPEC J3.3, G10 for routes whose options a
    // factory call builds (a reload is fine, the edit must show).
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
        ).toEqual(inPlace)
        // A shell changes the tree the route renders in: adding or removing it
        // may remount the route's component; editing it patches both in place.
        expect(
          await app.edit(
            { 'routes/__root.tsx': root('v3', 'v3') },
            /shell v3root v3 data v3 count \d+made v1/,
          ),
        ).toEqual(inPlace)
        await click(app, 'root v3 data v3 count', 1)
        expect(
          await app.edit(
            { 'routes/__root.tsx': root('v4', 'v4') },
            'shell v4root v4 data v4 count 1made v1',
          ),
        ).toEqual(inPlace)
        expect(
          await app.edit(
            { 'routes/__root.tsx': root('v5') },
            /^root v5 data v5 count \d+made v1$/,
          ),
        ).toEqual(inPlace)
        // Route options a factory call builds: the edit shows, after a hot
        // update or a reload (SPEC J3.3, G10).
        await app.edit({ 'routes/index.tsx': factoryRoute('v2') }, 'made v2')
      },
      timeout,
    )
  },
)

// A React route module stays an HMR boundary of React Refresh in Vite
// (`@vitejs/plugin-react` reloads the page when a module it compiled
// exports anything but components, beyond the exports the route HMR code
// has it ignore), also without a component of its own or as the root route.
// Sources: react-refresh-route-components "a React route module compiled
// for Vite stays a Fast Refresh boundary" (it called the refresh runtime's
// boundary check by hand; now real tools only, SPEC §8).
describe.concurrent(
  'vite: a React route module without a component, and a root route with an inline component',
  () => {
    it.for([true, false])(
      'apply their edits in place (autoCodeSplitting: %s)',
      { timeout },
      async (
        autoCodeSplitting: boolean,
        { expect, onTestFinished }: TestContext,
      ) => {
        const root = (version: string) =>
          `import { createRootRoute, Outlet, useRouterState } from '@tanstack/react-router'
import { useState } from 'react'
export const Route = createRootRoute({
  component: () => {
    const [count, setCount] = useState(0)
    const data = useRouterState({
      select: (state) => state.matches.map((match) => match.loaderData ?? '').join(''),
    })
    return (
      <div>
        <button onClick={() => setCount(count + 1)}>root ${version} {data} count {count}</button>
        <Outlet />
      </div>
    )
  },
})
`
        const index = (version: string) =>
          `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  loader: () => 'index ${version}',
  component: undefined,
})
`
        const app = await openRouteHmrPage({
          onTestFinished,
          pluginOptions: { autoCodeSplitting },
          files: {
            'routes/__root.tsx': root('v1'),
            'routes/index.tsx': index('v1'),
          },
          ready: 'root v1 index v1 count 0',
        })
        await click(app, 'root v1 index v1 count', 1)
        expect(
          await app.edit(
            { 'routes/index.tsx': index('v2') },
            'root v1 index v2 count 1',
          ),
        ).toEqual(inPlace)
        expect(
          await app.edit(
            { 'routes/__root.tsx': root('v2') },
            'root v2 index v2 count 1',
          ),
        ).toEqual(inPlace)
      },
    )
  },
)

// React Refresh patches route components that are not plain declarations
// in place, without mounting them again. Sources:
// react-refresh-route-components "React Refresh registers split route
// components" (ReactFreshBabelPlugin-test "registers likely HOCs with
// inline functions"; #8504 "written inline in a memo / forwardRef call"),
// which read React Refresh's registrations and modelled how its runtime
// resolves memo / forwardRef (now real tools only, SPEC §8); the former
// known-bugs-route-hmr "an edit of a React route with only inline components
// is a hot update" (the route HMR plugin runs before React
// Refresh, so a route whose components are all inline still becomes a
// boundary). The split bodies have no JSX: with JSX, the code splitter
// cannot split the call (pinned in known-bugs-code-splitter.test.ts "a
// component written as memo of an inline arrow is split and renders").
// Each component counts its mounts in a state initializer (React runs it on
// mount only; React Refresh keeps the state and re-runs effects): a body
// edit React Refresh patches in place mounts nothing anew. Unsplit inline memo / forwardRef
// components: pinned in known-bugs-route-hmr-components.test.ts.
describe.concurrent('vite: an edited React route component written', () => {
  const mounted = `useState(() => (window.mounts = (window.mounts ?? 0) + 1))`
  const rows = [
    {
      name: 'inline in a memo call, split',
      autoCodeSplitting: true,
      route: (version: string) =>
        `import { createFileRoute } from '@tanstack/react-router'
import { memo, useState } from 'react'
export const Route = createFileRoute('/')({
  component: memo(() => {
    ${mounted}
    return 'inline ${version}'
  }),
})
`,
      shows: (version: string) => `inline ${version}`,
    },
    {
      name: 'inline in a forwardRef call, split',
      autoCodeSplitting: true,
      route: (version: string) =>
        `import { createFileRoute } from '@tanstack/react-router'
import { forwardRef, useState } from 'react'
export const Route = createFileRoute('/')({
  component: forwardRef(function (props, ref) {
    ${mounted}
    return 'inline ${version}'
  }),
})
`,
      shows: (version: string) => `inline ${version}`,
    },
    {
      name: 'as an inline arrow function, unsplit',
      autoCodeSplitting: false,
      route: (version: string) =>
        `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
export const Route = createFileRoute('/')({
  loader: () => 'data ${version}',
  component: () => {
    ${mounted}
    return <p>inline ${version} {Route.useLoaderData()}</p>
  },
})
`,
      shows: (version: string) => `inline ${version} data ${version}`,
    },
  ]
  it.for(rows)(
    '$name shows in place without mounting again',
    { timeout },
    async (
      { autoCodeSplitting, route, shows },
      { expect, onTestFinished }: TestContext,
    ) => {
      const app = await openRouteHmrPage({
        onTestFinished,
        pluginOptions: { autoCodeSplitting },
        files: { 'routes/index.tsx': route('v1') },
        ready: shows('v1'),
      })
      const mounts = await app.evaluate<number>('window.mounts')
      expect(mounts).toBeGreaterThan(0)
      expect(
        await app.edit({ 'routes/index.tsx': route('v2') }, shows('v2')),
      ).toEqual(inPlace)
      expect(await app.evaluate<number>('window.mounts')).toBe(mounts)
    },
  )
})

// An edit of a split loader runs the edited loader once: the update of the
// route module refreshes the route, and the chunk evaluating again (its
// re-import by the refreshed loader) does not refresh it a second time.
describe.concurrent.each(['vite', 'rsbuild'] as const)(
  '%s: an edit of a split loader',
  (bundler) => {
    const route = (version: string) =>
      `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  loader: () => {
    const w = window as any
    w.__loaderRuns = (w.__loaderRuns ?? 0) + 1
    return 'data ${version}'
  },
  component: Page,
  codeSplitGroupings: [['loader'], ['component']],
})
function Page() {
  return <p>page {Route.useLoaderData()}</p>
}
`
    it(
      'runs the edited loader once',
      { timeout },
      async ({ expect, onTestFinished }) => {
        const app = await openRouteHmrPage({
          bundler,
          onTestFinished,
          pluginOptions: { autoCodeSplitting: true },
          files: { 'routes/index.tsx': route('v1') },
          ready: 'page data v1',
        })
        const runs = await app.evaluate<number>('window.__loaderRuns')
        expect(
          await app.edit({ 'routes/index.tsx': route('v2') }, 'page data v2'),
        ).toEqual(inPlace)
        expect(await app.evaluate<number>('window.__loaderRuns')).toBe(runs + 1)
      },
    )
  },
)
