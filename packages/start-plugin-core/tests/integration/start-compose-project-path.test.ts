/**
 * The project's path and the generated route tree's name (SPEC §2.1,
 * J2.15, G1): a Start app whose directory carries characters a project path
 * may (`my app (2)+`) builds, and its client route tree leaves
 * out the server-only route like any other app's; and an app file whose
 * name is one character away from the generated route tree's
 * (`src/routeTree-gen.ts`) is the file it is, not the client route tree.
 * Built with Start's Vite plugin (Rsbuild as a control: it has no client
 * route tree of its own yet, see known-bugs-route-options.test.ts).
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../build-harness'
import type { StartBuild } from '../build-harness'

const timeout = 60_000

const head = `import { createFileRoute } from '@tanstack/react-router'\n`

const routes = {
  'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
  'src/routes/index.tsx': `${head}export const Route = createFileRoute('/')({ component: () => 'MARK_INDEX' })\n`,
  'src/routes/api.tsx': `${head}export const Route = createFileRoute('/api')({ server: { handlers: { GET: () => new Response('MARK_API') } } })\n`,
  'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
}

/** Ids of the routes of the build's client route tree. */
const clientRouteIds = `return Object.values(entry.getRouter().routeTree.children ?? {}).map((route) => route.options.id)`

describe.each(startBundlers)('%s build', (bundler) => {
  describe('of an app whose path has characters a regular expression reads', () => {
    let build: StartBuild
    let dispose: (() => Promise<void>) | undefined
    beforeAll(async () => {
      build = await buildStart({
        bundler,
        prefix: `.start-build-harness-${bundler} my app (2)+-`,
        files: {
          ...routes,
          'src/entry.ts': `export { getRouter } from './router'
export { renderPath } from '../harness/render'
`,
        },
        entry: 'src/entry.ts',
        registerCleanup: (cleanup) => {
          dispose = cleanup
        },
      })
    }, timeout)
    afterAll(() => dispose?.())

    test('builds, and the page renders', async () => {
      expect(build.client.root).toMatch(/my app \(2\)\+/)
      expect(
        (
          await build.ssr.run(
            `${clientRouteIds.replace('return ', 'const ids = ')}
return { ids, page: await entry.renderPath(entry.getRouter().routeTree, '/') }`,
          )
        ).result,
      ).toEqual({
        ids: expect.arrayContaining(['/', '/api']),
        page: expect.stringContaining('MARK_INDEX'),
      })
    })

    // Bug: Start's Vite plugin matches the module to serve the client route
    // tree for with `new RegExp(<path of the generated route tree>)`
    // (vite/start-router-plugin/plugin.ts, `clientTreePlugin.load.filter`),
    // the path unescaped, so under a path with `(`, `)` or `+` the
    // expression never matches the file and the client gets the full tree.
    // Rsbuild: no client route tree at all (known-bugs-route-options.test.ts
    // "a route with only server handlers is not in the client route tree").
    // Impact: the client bundle ships the server-only routes' entries and
    // modules; a page can navigate to a route that has no page.
    test.fails(
      'the client route tree leaves out the server-only route',
      async () => {
        expect((await build.client.run(clientRouteIds)).result).toEqual(['/'])
      },
    )
  })

  describe('of an app with a file named one character away from the generated route tree', () => {
    let build: StartBuild | undefined
    let failure: unknown
    let dispose: (() => Promise<void>) | undefined
    beforeAll(async () => {
      try {
        build = await buildStart({
          bundler,
          files: {
            ...routes,
            'src/routeTree-gen.ts': `export const sibling = 'MARK_SIBLING'\n`,
            'src/entry.ts': `export { getRouter } from './router'
export { sibling } from './routeTree-gen'
`,
          },
          entry: 'src/entry.ts',
          registerCleanup: (cleanup) => {
            dispose = cleanup
          },
        })
      } catch (error) {
        failure = error
      }
    }, timeout)
    afterAll(() => dispose?.())

    // Bug: the same unescaped `new RegExp(<path>)` (above): its `.` before
    // `gen` matches any character, so `src/routeTree-gen.ts` is served the
    // client route tree instead of its own code.
    // Impact: the build fails (the file's exports are gone) or the app
    // reads the wrong module.
    ;(bundler === 'vite' ? test.fails : test)(
      'the client gets the file, not the client route tree',
      async () => {
        if (!build) {
          throw failure
        }
        expect((await build.client.run(`return entry.sibling`)).result).toBe(
          'MARK_SIBLING',
        )
      },
    )
  })
})
