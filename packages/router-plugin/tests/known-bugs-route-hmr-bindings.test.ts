/**
 * Known bug (SPEC G15, J3.8): code the router plugin injects for route HMR
 * must not read a binding of the user's route file. With route HMR on
 * (React, the dev server's default `addHmr`), the injected React Refresh
 * bookkeeping constructs a `Map`; a route file that imports a class named
 * `Map` of its own (a map widget's, e.g. a maps library) hands the injected
 * code the user's class, and the route module throws when it loads, so the
 * page cannot render the route. The bookkeeping is built by the first route
 * module the page evaluates: the root route, which the route tree imports
 * first, so the route file here is the app's root. Found in review while
 * piloting the route app.
 *
 * Fix-agnostic: any fix that leaves the user's `Map` alone (a global
 * reference that no user binding captures, another structure, no
 * bookkeeping) makes the route render.
 */
import { expect, it } from 'vitest'
import { loadRoute } from './route-app'

const mapsLibrary = {
  'node_modules/maps/package.json': JSON.stringify({
    name: 'maps',
    type: 'module',
    exports: './index.js',
  }),
  // A map widget's class named Map, not a key-value store
  'node_modules/maps/index.js': `export class Map {
  constructor() { this.size = 0 }
  get(key) { return undefined }
}
`,
}

const route = `import { createRootRoute } from '@tanstack/react-router'
import { Map } from 'maps'
const cache = new Map()
export const Route = createRootRoute({
  loader: () => cache.size,
  component: () => <p>MARK_PAGE {String(Route.useLoaderData())}</p>,
})
`

it('a route file importing a binding named Map renders without route HMR (control)', async () => {
  const app = await loadRoute(route, { files: mapsLibrary })
  expect(await app.run('return renderRoute()')).toContain('MARK_PAGE 0')
})

it.fails(
  'a route file importing a binding named Map renders with route HMR',
  async () => {
    const app = await loadRoute(route, { files: mapsLibrary, hmr: true })
    expect(await app.run('return renderRoute()')).toContain('MARK_PAGE 0')
  },
)
