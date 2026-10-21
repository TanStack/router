/**
 * Known bug (SPEC G15, J3.8): code the router plugin injects for route HMR
 * must not read a binding of the user's route file. With route HMR on
 * (React, the dev server's default `addHmr`), the injected React Refresh
 * bookkeeping constructs a `Map`; a route file that imports its own `Map`
 * (immutable's, a realistic import) hands the injected code the user's
 * class, and the route module throws when it loads, so the page cannot
 * render the route. Found by B1 while piloting the route app (2026-10-21).
 *
 * Fix-agnostic: any fix that leaves the user's `Map` alone (a global
 * reference that no user binding captures, another structure, no
 * bookkeeping) makes the route render.
 */
import { expect, it } from 'vitest'
import { head, loadRoute } from './route-app'

const immutable = {
  'node_modules/immutable/package.json': JSON.stringify({
    name: 'immutable',
    type: 'module',
    exports: './index.js',
  }),
  // A Map without `set`, like immutable's persistent Map
  'node_modules/immutable/index.js': `export class Map {
  constructor() { this.size = 0 }
  get(key) { return undefined }
}
`,
}

const route = `${head}import { Map } from 'immutable'
const cache = new Map()
export const Route = createFileRoute('/')({
  loader: () => cache.size,
  component: () => <p>MARK_PAGE {String(Route.useLoaderData())}</p>,
})
`

it('a route file importing a binding named Map renders without route HMR (control)', async () => {
  const app = await loadRoute(route, { files: immutable })
  expect(await app.run('return renderRoute()')).toContain('MARK_PAGE 0')
})

it.fails(
  'a route file importing a binding named Map renders with route HMR',
  async () => {
    const app = await loadRoute(route, { files: immutable, hmr: true })
    expect(await app.run('return renderRoute()')).toContain('MARK_PAGE 0')
  },
)
