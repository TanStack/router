/**
 * The client route tree of a real build, through Start's Vite and Rsbuild
 * plugins (build-harness.ts): it leaves out server-only routes.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../build-harness'
import { probeRoutePath } from '../request-probe'
import type { StartBuild } from '../build-harness'

const timeout = 60_000

const head = `import { createFileRoute } from '@tanstack/react-router'\n`
const handlers = `server: { handlers: { GET: () => new Response('x') } }`

/**
 * Pages (`/`, and `/users/profile` under the server-only `/users`) and a
 * server-only subtree (`/api`, `/api/inner`).
 */
const files = {
  'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
  'src/routes/index.tsx': `${head}export const Route = createFileRoute('/')({ component: () => 'MARK_INDEX' })\n`,
  'src/routes/users.tsx': `${head}export const Route = createFileRoute('/users')({ ${handlers} })\n`,
  'src/routes/users/profile.tsx': `${head}import { Profile } from '../../components/Profile'
export const Route = createFileRoute('/users/profile')({ component: Profile })
`,
  'src/components/Profile.tsx': `export const Profile = () => 'MARK_PROFILE'\n`,
  'src/routes/api.tsx': `${head}export const Route = createFileRoute('/api')({ ${handlers} })\n`,
  'src/routes/api/inner.tsx': `${head}export const Route = createFileRoute('/api/inner')({ ${handlers} })\n`,
  'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
}

/**
 * Script returning the route tree of the build: whether the root is a root
 * (the generated tree gives it no parent) and the paths of its routes,
 * depth first.
 */
const routeTree = `const tree = entry.getRouter().routeTree
const paths = (route) => Object.values(route.children ?? {}).flatMap((child) => [
  child.options.path,
  ...paths(child),
])
return { rootIsRoot: !('getParentRoute' in tree.options), paths: paths(tree) }`

describe.each(startBundlers)('%s build', (bundler) => {
  let build: StartBuild
  let dispose: (() => Promise<void>) | undefined
  beforeAll(async () => {
    build = await buildStart({
      bundler,
      files,
      entry: 'src/router.ts',
      registerCleanup: (cleanup) => {
        dispose = cleanup
      },
    })
  }, timeout)
  afterAll(() => dispose?.())

  // Source: mutation testing.
  test('a server-only route with a page under it stays in the client route tree, under the root', async () => {
    const { result } = await build.client.run(routeTree)
    expect(result).toEqual({
      rootIsRoot: true,
      paths: expect.arrayContaining(['/', '/users', '/profile']),
    })
  })

  // Vite: Start prunes server-only subtrees from the client route tree.
  // Rsbuild: same bug as known-bugs-route-options.test.ts "a route with only
  // server handlers is not in the client route tree" (only the Vite plugin
  // prunes).
  test('the client route tree is the SSR route tree without the server-only subtree', async () => {
    const ssr = (await build.ssr.run(routeTree)).result as {
      paths: Array<string>
    }
    expect(ssr.paths).toEqual(expect.arrayContaining(['/api', '/inner']))
    // (the harness's probe route, which serves the requests SSR scripts
    // run in, is a server-only route too)
    const serverOnly = ['/api', '/inner', probeRoutePath]
    expect((await build.client.run(routeTree)).result).toEqual({
      rootIsRoot: true,
      paths: ssr.paths.filter((path) => !serverOnly.includes(path)),
    })
  })
})
