import { describe, it } from 'vitest'
import { openRouteHmrPage } from '../serial'
/**
 * Route HMR of route files the router plugin recognises, as the developer
 * sees it (`route-hmr-page.ts`): route files the framework plugin gives no
 * refresh boundary, and a route file switching between the router's
 * constructor and the app's own helper. The router plugin's configurations
 * and routes created inside functions: route-hmr-browser-plugin.test.ts.
 */

const inPlace = { reloaded: false, errors: [] }

/**
 * A route file of `target` at `/` whose loader and component name the
 * version of the file.
 */
const indexRoute = (target: 'react' | 'solid', version: string) =>
  `import { createFileRoute } from '@tanstack/${target}-router'
export const Route = createFileRoute('/')({
  loader: () => 'data ${version}',
  component: Page,
})
function Page() {
  const data = Route.useLoaderData()
  return <p>page ${version} {${target === 'solid' ? 'data()' : 'data'}}</p>
}
`

// Route files the framework plugin gives no refresh boundary: a React route
// file without JSX (`.ts`: React Refresh registers nothing in it), and a
// React app without `@vitejs/plugin-react` (Vite compiles the JSX itself).
// On main the route module's own accept call was on an alias, so every edit
// reloaded the page. An edit shows its new code in place. (Without a refresh
// runtime the new component may be mounted anew: a subtree replacement, not
// a document reload.)
describe('vite: an edit of', () => {
  /** A root route rendering the loader data of the active matches. */
  const root = `import { createRootRoute, Outlet, useRouterState } from '@tanstack/react-router'
export const Route = createRootRoute({
  component: () => {
    const data = useRouterState({
      select: (state) => state.matches.map((match) => match.loaderData ?? '').join(''),
    })
    return <p>root {data}<Outlet /></p>
  },
})
`
  const loaderRoute = (version: string) =>
    `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ loader: () => 'data ${version}' })
`

  it.for([true, false])(
    'a React .ts route module shows its new loader data in place (autoCodeSplitting: %s)',
    async (autoCodeSplitting: boolean, { expect }) => {
      const app = await openRouteHmrPage({
        pluginOptions: { autoCodeSplitting },
        files: {
          'routes/__root.tsx': root,
          'routes/index.ts': loaderRoute('v1'),
        },
        ready: 'root data v1',
      })
      expect(
        await app.edit(
          { 'routes/index.ts': loaderRoute('v2') },
          'root data v2',
        ),
      ).toEqual(inPlace)
    },
  )

  it.for([true, false])(
    'a route component in an app without @vitejs/plugin-react shows in place (autoCodeSplitting: %s)',
    async (autoCodeSplitting: boolean, { expect }) => {
      const app = await openRouteHmrPage({
        frameworkPlugin: false,
        pluginOptions: { autoCodeSplitting },
        files: { 'routes/index.tsx': indexRoute('react', 'v1') },
        ready: 'page v1 data v1',
      })
      expect(
        await app.edit(
          { 'routes/index.tsx': indexRoute('react', 'v2') },
          'page v2 data v2',
        ),
      ).toEqual(inPlace)
    },
  )
})

// A route file whose `Route` changes from the router's constructor to the
// app's own helper and back (R130: a route the app's helper makes is not
// split and is reported nothing): the page shows each version, with no
// error and nothing reported.
// Bug (Rsbuild, as on main): the edit to the app's helper is applied
// without showing, silently; a reload shows it, and the edit back to the
// router's constructor shows in place. Pinned.
describe.each(['vite', 'rsbuild'] as const)(
  '%s: a route file switching between the router constructor and an app helper',
  (bundler) => {
    const helper = `import { createFileRoute } from '@tanstack/react-router'
export const createAppRoute = (id: any) => (options: any) => createFileRoute(id)(options)
`
    const route = (made: 'router' | 'helper', version: string) =>
      made === 'router'
        ? `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <p>router ${version}</p> })
`
        : `import { createAppRoute } from '../app-route'
export const Route = createAppRoute('/')({ component: () => <p>helper ${version}</p> })
`
    it(
      'shows each version, reporting nothing',
      { fails: bundler === 'rsbuild' },
      async ({ expect }) => {
        const app = await openRouteHmrPage({
          bundler,
          files: {
            'app-route.ts': helper,
            'routes/index.tsx': route('router', 'v1'),
          },
          ready: 'router v1',
        })
        expect(
          (
            await app.edit(
              { 'routes/index.tsx': route('helper', 'v2') },
              'helper v2',
            )
          ).errors,
        ).toEqual([])
        expect(
          (
            await app.edit(
              { 'routes/index.tsx': route('router', 'v3') },
              'router v3',
            )
          ).errors,
        ).toEqual([])
        expect(app.warnings()).toEqual([])
      },
    )
  },
)

// The same switch to the app's helper while a route file created broken
// makes every generation fail (no tree is published): the route is still
// known not to be the router's, so nothing is reported about it and the
// page shows the edit.
describe('vite: a route file switching to an app helper while every generation fails', () => {
  it('shows the edit, reporting nothing about the route file', async ({
    expect,
  }) => {
    const helper = `import { createFileRoute } from '@tanstack/react-router'
export const createAppRoute = (id: any) => (options: any) => createFileRoute(id)(options)
`
    const app = await openRouteHmrPage({
      files: {
        'app-route.ts': helper,
        'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <p>router v1</p> })
`,
      },
      ready: 'router v1',
    })
    await app.edit(
      { 'routes/broken.tsx': 'export const Route = (' },
      'router v1',
    )
    await app.edit(
      {
        'routes/index.tsx': `import { createAppRoute } from '../app-route'
export const Route = createAppRoute('/')({ component: () => <p>helper v2</p> })
`,
      },
      'helper v2',
    )
    expect(
      app.warnings().filter(({ text }) => text.includes('routes/index.tsx')),
    ).toEqual([])
  })
})
