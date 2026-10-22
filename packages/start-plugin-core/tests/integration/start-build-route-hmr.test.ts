/**
 * Route HMR in Start: Start forces route HMR on in its client code
 * splitting (`addHmr: true`, vite/start-router-plugin/plugin.ts,
 * rsbuild/start-router-plugin.ts), so in development an edit of a route
 * file updates the page in place (controls on a real page, with the same
 * route file); production builds, through Start's Vite and Rsbuild plugins
 * (build-harness.ts), carry nothing of it, in the client and in the server
 * output (SPEC J3.7), and the page still renders.
 *
 * What production output must not carry is looked for by the names of the
 * bundlers' HMR APIs only (a partial check: how route HMR is written is the
 * compiler's business). Start offers no way to turn route HMR off (its
 * client code splitting forces `addHmr: true`), so no build without it can
 * be compared with these, as router-plugin's production-bundle.ts does with
 * `addedCode`; the dev controls show the route file does get route HMR
 * where it belongs.
 */
import react from '@vitejs/plugin-react'
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { buildStart, startBundlers } from '../build-harness'
import { startDevServer } from '../dev-server'
import {
  reportedErrors,
  startRsbuildStartDevServer,
} from '../rsbuild-dev-server'

const timeout = 60_000

/** The bundlers' HMR APIs (Vite's SSR transform spells `import.meta` its way). */
const hmrApi =
  /\b(?:import\.meta|__vite_ssr_import_meta__)\.(?:hot|webpackHot)\b|\bmodule\.hot\b/

/** The HMR APIs some module of `modules` uses. */
function hmrApisIn(modules: Array<string>) {
  return modules.flatMap((code) =>
    [...code.matchAll(new RegExp(hmrApi, 'g'))].map((match) => match[0]),
  )
}

/** A page route whose loader and component carry markers of `version`. */
const pageRoute = (
  version = '',
) => `import { createFileRoute } from '@tanstack/react-router'
function Page() {
  return <p>{'MARK_PAGE ' + Route.useLoaderData()}</p>
}
export const Route = createFileRoute('/')({
  loader: () => 'MARK_LOADER${version}',
  component: Page,
})
`

/** The app of the production builds. */
const files = {
  'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
  'src/routes/index.tsx': pageRoute(),
  'src/router.ts': `import { routeTree } from './routeTree.gen'
export const getRouter = () => ({ routeTree })
`,
  'src/entry.ts': `export { getRouter } from './router'
export { renderPath } from '../harness/render'
`,
}

/** The router of the dev pages, over the generated route tree. */
const routerFile = `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`

// Controls: in development, the same route file gets route HMR. An edit of
// its loader shows the new data in place: without route HMR the bundler
// finds no module accepting the edit, and the page reloads.
describe("dev servers with Start's plugin hot-update the route (controls)", () => {
  // A real Vite dev server with Start's whole Vite plugin and
  // `@vitejs/plugin-react` serves the app (rendered on the client from
  // `index.html`; Start's own page middleware is off) to a real page. The
  // server environment's route module has no route HMR code.
  test(
    'Vite dev: an edit of the route loader shows in place, and the server environment gets no route HMR code',
    async () => {
      const server = await startDevServer({
        start: { vite: { installDevServerMiddleware: false } },
        browser: true,
        // Pre-bundled up front, as Vite does for an app that installed them
        // (the router is a linked workspace package here)
        config: {
          optimizeDeps: {
            include: [
              'react',
              'react/jsx-dev-runtime',
              'react-dom',
              'react-dom/client',
              '@tanstack/react-router',
            ],
          },
        },
        plugins: [react()],
        files: {
          'index.html': `<!doctype html>
<html>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
          'src/main.tsx': `import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { getRouter } from './router'
createRoot(document.getElementById('app')!).render(<RouterProvider router={getRouter()} />)
`,
          'src/router.ts': routerFile,
          'src/routes/__root.tsx': files['src/routes/__root.tsx'],
          'src/routes/index.tsx': pageRoute(),
        },
      })
      const page = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      await page.waitForText('MARK_PAGE MARK_LOADER', { selector: '#app' })
      await server.edit({ 'src/routes/index.tsx': pageRoute('_V2') })
      await page.waitForText('MARK_PAGE MARK_LOADER_V2', { selector: '#app' })
      expect(page.loads()).toBe(1)
      expect(page.errors).toEqual([])
      // Every module the server environment serves from the route module,
      // the router's packages and any support module the compiler imports
      // included; left out: Vite's own client, and packages the environment
      // externalizes (bare ids: Node loads the installed package itself).
      const ssr = await server.load('/src/routes/index.tsx', {
        environment: 'ssr',
        skip: /^\/@(?:vite|react-refresh)\b|^[^./]/,
      })
      expect(hmrApisIn(Object.values(ssr))).toEqual([])
    },
    timeout,
  )

  // A real Rsbuild dev server with Start's Rsbuild plugin and HMR serves
  // the app's pages (Start's server entry renders them, the client entry
  // hydrates) to a real page.
  test(
    'Rsbuild dev: an edit of the route loader shows in place',
    async () => {
      const server = await startRsbuildStartDevServer({
        hmr: true,
        browser: true,
        config: {
          tools: {
            // Start serves the pages, not an HTML template
            htmlPlugin: false,
          },
        },
        files: {
          'harness/client-entry.ts': `import { createElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
hydrateRoot(document, createElement(StartClient))
`,
          'harness/server-entry.ts': `export { default } from '@tanstack/react-start/server-entry'\n`,
          'src/router.ts': routerFile,
          'src/routes/__root.tsx': `import { HeadContent, Outlet, Scripts, createRootRoute, useHydrated } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Root })
function Root() {
  const hydrated = useHydrated()
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <div id="app"><Outlet /></div>
        <span data-testid="hydrated">{hydrated ? 'hydrated' : 'hydrating'}</span>
        <Scripts />
      </body>
    </html>
  )
}
`,
          'src/routes/index.tsx': pageRoute(),
        },
      })
      expect(reportedErrors(server)).toEqual([])
      const page = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      await page.waitForText('MARK_PAGE MARK_LOADER', { selector: '#app' })
      await page.waitForText('hydrated', { selector: '[data-testid=hydrated]' })
      await server.write({ 'src/routes/index.tsx': pageRoute('_V2') })
      await server.settle()
      expect(reportedErrors(server)).toEqual([])
      await page.waitForText('MARK_PAGE MARK_LOADER_V2', { selector: '#app' })
      expect(page.loads()).toBe(1)
      expect(page.errors).toEqual([])
    },
    timeout,
  )
})

describe.each(startBundlers)('%s production build', (bundler) => {
  // Source: audit E2 missing coverage #1 (only router-plugin's
  // build-production.test.ts checked R7, without Start's forced `addHmr`).
  test(
    'the client and server outputs use no HMR API, and the page renders',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files,
        entry: 'src/entry.ts',
      })
      expect(hmrApisIn(client.chunks.map((chunk) => chunk.code))).toEqual([])
      expect(hmrApisIn(ssr.chunks.map((chunk) => chunk.code))).toEqual([])
      const { result } = await client.run(`const route = Object.values(
  entry.getRouter().routeTree.children,
).find((candidate) => candidate.options.id === '/')
return {
  loader: await route.options.loader(),
  page: await entry.renderPath(entry.getRouter().routeTree, '/'),
}`)
      expect(result).toEqual({
        loader: 'MARK_LOADER',
        page: expect.stringContaining('MARK_PAGE MARK_LOADER'),
      })
    },
    timeout,
  )
})
