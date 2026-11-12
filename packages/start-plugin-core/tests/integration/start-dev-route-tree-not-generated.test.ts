/**
 * A Start Vite dev server started while route generation fails (a route
 * file that does not parse): the routes are not known yet, so a module that
 * exports a `Route` is not served as written (its `server` code would reach
 * the client) but fails with the generator's error, as the client's route
 * tree does and as Rsbuild refuses to compile. Once the broken file is
 * fixed, the route is compiled as a route. Source: REVIEW-design5-final
 * finding 2 (served as written, `server` handler included, and import
 * protection reported the route's server import as a violation).
 */
import { expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { startDevServer, startServerEntryFiles } from '../dev-server'

const timeout = 90_000
const RP = '@tanstack/react-router'

const badRoute = (fixed: boolean) =>
  `import { createFileRoute } from '${RP}'
export const Route = createFileRoute('/bad')({ component: () => <p>bad</p> }${fixed ? ')' : ''}
`

test(
  'a route is not served while generation has never succeeded, and is split once it does',
  async () => {
    const server = await startDevServer({
      start: {},
      listen: true,
      files: {
        ...startServerEntryFiles,
        'src/router.ts': `import { createRouter } from '${RP}'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
        'src/routes/__root.tsx': `import { Outlet, createRootRoute } from '${RP}'
export const Route = createRootRoute({ component: () => <Outlet /> })
`,
        'src/db.server.ts': `export const secret = () => 'MARK_DB'\n`,
        'src/routes/x.tsx': `import { createFileRoute } from '${RP}'
import { secret } from '../db.server'
export const Route = createFileRoute('/x')({
  component: () => <p>MARK_PAGE</p>,
  server: { handlers: { GET: () => new Response('MARK_SERVER' + secret()) } },
})
`,
        // another module of the app reaches the route (the route tree fails)
        'src/nav.tsx': `import { Route } from './routes/x'
export const nav = () => Route.fullPath
`,
        // the route tree of an earlier run
        'src/routeTree.gen.ts': `import { Route as rootRouteImport } from './routes/__root'
import { Route as XRouteImport } from './routes/x'
const XRoute = XRouteImport.update({ id: '/x', path: '/x', getParentRoute: () => rootRouteImport } as any)
export const routeTree = rootRouteImport.addChildren([XRoute] as any)
`,
        'src/routes/bad.tsx': badRoute(false),
      },
    })

    const served = await server.fetch('/src/routes/x.tsx')
    expect(served.body).not.toContain('MARK_SERVER')
    expect(served.status).not.toBe(200)
    await server.fetch('/src/nav.tsx')
    await server.idle()
    expect(
      findDiagnostics(server.diagnostics, {
        severity: ['warning', 'error'],
        file: 'src/db.server.ts',
        root: server.root,
      }),
    ).toEqual([])

    await server.edit({ 'src/routes/bad.tsx': badRoute(true) })
    const fixed = await server.transform('/src/routes/x.tsx', 'client')
    expect(fixed).not.toContain('MARK_SERVER')
    // (split: the component is in a chunk of its own)
    expect(fixed).not.toContain('MARK_PAGE')
  },
  timeout,
)
