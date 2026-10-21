/**
 * Route HMR with the router plugin configured in its supported ways, and
 * for the route files it recognises, as the developer sees it: a real dev
 * server serves a file-based app to a real browser page, and the test edits
 * its route files on disk (`route-hmr-page.ts`). What matters is what the
 * page shows after the edit, not which code the plugin serves.
 *
 * Sources: the former route-hmr.test.ts "route HMR in a Vite dev server
 * without automatic code splitting" (which looked for the hot API in the
 * served code), code-splitter-route-options.test.ts "hot-update a root
 * route created with ..." and code-splitter-plugin-pipeline.test.ts "a route
 * created inside a function ... is hot-updated" (which ran the route HMR
 * code against a modelled hot API), plugin-options.test.ts "makes routes
 * accept hot updates through the bundler even when plugin.hmr.style is vite"
 * (which scanned a build for the hot API).
 */
import { describe, it } from 'vitest'
import {
  expectEditShownOrReportedFallback,
  openRouteHmrPage,
} from '../route-hmr-page'
import type { TestContext } from 'vitest'
import type { RouteHmrPageOptions } from '../route-hmr-page'

const timeout = 90_000
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

/** `tsr.config.json` of an app of `target`, as the plugin reads it. */
const tsrConfig = (target: 'react' | 'solid') =>
  JSON.stringify({
    target,
    routesDirectory: './routes',
    generatedRouteTree: './routeTree.gen.ts',
    autoCodeSplitting: false,
  })

// The router plugin, configured as the plugin's public API allows: each
// configuration serves route HMR, so an edit shows in place.
describe.concurrent('the router plugin configured with', () => {
  const rows: Array<{
    name: string
    target?: 'react' | 'solid'
    options: Partial<RouteHmrPageOptions>
  }> = [
    {
      // Source: route-hmr.test.ts "works with plugin.hmr.style alone".
      name: 'plugin.hmr.style alone (vite)',
      options: {
        pluginOptions: {
          autoCodeSplitting: false,
          plugin: { hmr: { style: 'vite' } },
        },
      },
    },
    {
      // Source: route-hmr.test.ts "is limited to the environment
      // plugin.vite.environmentName names" (the excluded environment: the
      // pages/route-hmr.test.ts).
      name: 'plugin.vite.environmentName naming the client (vite)',
      options: {
        pluginOptions: {
          autoCodeSplitting: false,
          plugin: { vite: { environmentName: 'client' } },
        },
      },
    },
    {
      // Source: route-hmr.test.ts "takes plugin options given as a
      // function".
      name: 'its options given as a function (vite, solid)',
      target: 'solid',
      options: {
        pluginOptions: { autoCodeSplitting: false },
        pluginOptionsAsFunction: true,
      },
    },
    // Source: route-hmr.test.ts "compiles for the target of a
    // tsr.config.json in the Vite root".
    ...(['react', 'solid'] as const).map((target) => ({
      name: `no options, reading tsr.config.json (vite, ${target})`,
      target,
      options: {
        pluginOptions: null,
        files: { 'tsr.config.json': tsrConfig(target) },
      },
    })),
    {
      // The Rspack entry uses Rspack's hot API whatever `plugin.hmr.style`
      // says (src/rspack.ts). Source: plugin-options.test.ts.
      name: 'plugin.hmr.style: vite (rsbuild)',
      options: {
        bundler: 'rsbuild',
        pluginOptions: { plugin: { hmr: { style: 'vite' } } },
      },
    },
  ]

  it.for(rows)(
    '$name applies an edit of a route file in place',
    { timeout },
    async ({ target = 'react', options }, { expect, onTestFinished }) => {
      const app = await openRouteHmrPage({
        ...options,
        target,
        onTestFinished,
        files: {
          ...options.files,
          'routes/index.tsx': indexRoute(target, 'v1'),
        },
        ready: 'page v1 data v1',
      })
      expect(
        await app.edit(
          { 'routes/index.tsx': indexRoute(target, 'v2') },
          'page v2 data v2',
        ),
      ).toEqual(inPlace)
    },
  )
})

// Source: utils.test.ts routeFactoryCallCodeFilter (type arguments and
// whitespace before the call); the former code-splitter-route-options
// "hot-update a root route created with ...".
describe.concurrent('vite: an edited root route created with', () => {
  it.for([
    'createRootRoute({',
    'createRootRoute ({',
    'createRootRouteWithContext()({',
    'createRootRouteWithContext<{ user: string }>()({',
    'createRootRouteWithContext <{ user: string }>()({',
  ])(
    '`%s` shows in place',
    { timeout },
    async (call: string, { expect, onTestFinished }: TestContext) => {
      const root = (version: string) =>
        `import { createRootRoute, createRootRouteWithContext } from '@tanstack/react-router'
export const Route = ${call}
  loader: () => 'data ${version}',
  component: () => <p>root ${version} {Route.useLoaderData()}</p>,
})
`
      const app = await openRouteHmrPage({
        onTestFinished,
        files: { 'routes/__root.tsx': root('v1') },
        ready: 'root v1 data v1',
      })
      expect(
        await app.edit({ 'routes/__root.tsx': root('v2') }, 'root v2 data v2'),
      ).toEqual(inPlace)
    },
  )
})

// A route the route file creates inside a function of the same file (a
// helper, an IIFE) is unsupported but user-fixable (user ruling 2026-10-17,
// decision D11): it is either split like a module-scope route and
// hot-updated in place, or left unsplit with a warning naming the file
// (code-splitter-plugin-pipeline.test.ts). Either way, an edit shows its
// new loader data and component without errors: in place, or, when the
// compiler warns naming the route file through a real channel (the dev
// server's logger or console, or the page), possibly after a reload. A
// warning never excuses an edit that does not show (V1R hmr H08, split
// S11; `expectEditShownOrReportedFallback`). (A helper function
// without automatic code splitting keeps its old component silently:
// pinned in known-bugs-route-hmr.test.ts.)
describe.concurrent.each(['vite', 'rsbuild'] as const)(
  '%s: an edit of a route created inside',
  (bundler) => {
    const factoryRoutes = {
      helper: (version: string) =>
        `import { createFileRoute } from '@tanstack/react-router'
function makeRoute() {
  return createFileRoute('/')({
    loader: () => 'data ${version}',
    component: () => <p>helper ${version} {Route.useLoaderData()}</p>,
  })
}
export const Route = makeRoute()
`,
      iife: (version: string) =>
        `import { createFileRoute } from '@tanstack/react-router'
export const Route = (() =>
  createFileRoute('/')({
    loader: () => 'data ${version}',
    component: () => <p>iife ${version} {Route.useLoaderData()}</p>,
  }))()
`,
      'iife-module': (version: string) =>
        `import { createFileRoute } from '@tanstack/react-router'
function Made() {
  return <p>iife-module ${version} {Route.useLoaderData()}</p>
}
export const Route = (() =>
  createFileRoute('/')({ loader: () => 'data ${version}', component: Made }))()
`,
    }

    it.for(
      Object.keys(factoryRoutes)
        .flatMap((shape) =>
          [true, false].map((autoCodeSplitting) => ({
            shape,
            autoCodeSplitting,
          })),
        )
        .filter(
          ({ shape, autoCodeSplitting }) =>
            shape !== 'helper' || autoCodeSplitting,
        ),
    )(
      '$shape shows (autoCodeSplitting: $autoCodeSplitting)',
      { timeout },
      async ({ shape, autoCodeSplitting }, { onTestFinished }: TestContext) => {
        const route = factoryRoutes[shape as keyof typeof factoryRoutes]
        const app = await openRouteHmrPage({
          bundler,
          onTestFinished,
          pluginOptions: { autoCodeSplitting },
          files: { 'routes/index.tsx': route('v1') },
          ready: `${shape} v1 data v1`,
        })
        await expectEditShownOrReportedFallback(
          app,
          { 'routes/index.tsx': route('v2') },
          `${shape} v2 data v2`,
          'routes/index.tsx',
        )
      },
    )
  },
)

// Route files the framework plugin gives no refresh boundary: a React route
// file without JSX (`.ts`), and a React app without `@vitejs/plugin-react`
// (Vite compiles the JSX itself). An edit shows its new code, after a hot
// update or a reload; whether in place: pinned in
// known-bugs-route-hmr.test.ts.
describe.concurrent('vite: an edit of', () => {
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
    'a route file without JSX (.ts) shows its new loader data (autoCodeSplitting: %s)',
    { timeout },
    async (
      autoCodeSplitting: boolean,
      { expect, onTestFinished }: TestContext,
    ) => {
      const app = await openRouteHmrPage({
        onTestFinished,
        pluginOptions: { autoCodeSplitting },
        files: {
          'routes/__root.tsx': root,
          'routes/index.ts': loaderRoute('v1'),
        },
        ready: 'root data v1',
      })
      const { errors } = await app.edit(
        { 'routes/index.ts': loaderRoute('v2') },
        'root data v2',
      )
      expect(errors).toEqual([])
    },
  )

  it.for([true, false])(
    'a route component in an app without @vitejs/plugin-react shows (autoCodeSplitting: %s)',
    { timeout },
    async (
      autoCodeSplitting: boolean,
      { expect, onTestFinished }: TestContext,
    ) => {
      const app = await openRouteHmrPage({
        onTestFinished,
        frameworkPlugin: false,
        pluginOptions: { autoCodeSplitting },
        files: { 'routes/index.tsx': indexRoute('react', 'v1') },
        ready: 'page v1 data v1',
      })
      const { errors } = await app.edit(
        { 'routes/index.tsx': indexRoute('react', 'v2') },
        'page v2 data v2',
      )
      expect(errors).toEqual([])
    },
  )
})
