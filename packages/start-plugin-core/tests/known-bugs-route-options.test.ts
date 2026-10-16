/**
 * Known bugs in how Start reads route options from route files. Each pin
 * asserts correct behaviour for a bug on main and is marked .fails; remove
 * .fails when the bug is fixed. Each pin has a control test that runs the
 * same harness on a case that works.
 *
 * Start decides from the route generator's view of a route file which routes
 * are server-only (pruned from the client route tree) and which pages to
 * prerender. Resolving every option key is best effort, but a missed key must
 * never prune a route or skip prerendering a page.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Generator, getConfig } from '@tanstack/router-generator'
import { afterEach, describe, expect, test } from 'vitest'
import { prerenderRoutesPlugin } from '../src/start-router-plugin/generator-plugins/prerender-routes-plugin'
import { pruneServerOnlySubtrees } from '../src/start-router-plugin/pruneServerOnlySubtrees'

afterEach(() => {
  globalThis.TSS_PRERENDABLE_PATHS = undefined
})

/**
 * Runs the route generator with Start's generator plugins on an app with a
 * root route and `routes/moved.tsx` holding `source`. Returns whether
 * `/moved` is in the client route tree (after Start prunes server-only
 * routes) and in the paths Start prerenders.
 */
async function startRouteOf(source: string) {
  const root = await mkdtemp(path.join(tmpdir(), 'tss-route-options-'))
  try {
    await mkdir(path.join(root, 'routes'))
    await writeFile(
      path.join(root, 'routes/__root.tsx'),
      `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()`,
    )
    await writeFile(path.join(root, 'routes/moved.tsx'), source)
    const config = getConfig({
      disableLogging: true,
      routesDirectory: path.join(root, 'routes'),
      generatedRouteTree: path.join(root, 'routeTree.gen.ts'),
      // Same filesystem as the app, so the generator can rename its temp files
      tmpDir: path.join(root, '.tanstack/tmp'),
      plugins: [prerenderRoutesPlugin()],
    })
    const generator = new Generator({ config, root })
    await generator.run()
    const crawlingResult = await generator.getCrawlingResult()
    if (!crawlingResult) {
      throw new Error('the generator did not crawl the routes')
    }
    const client = pruneServerOnlySubtrees(crawlingResult)
    return {
      inClientTree: client.routeNodes.some(
        (node) => node.routePath === '/moved',
      ),
      prerendered: (globalThis.TSS_PRERENDABLE_PATHS ?? []).some(
        (page) => page.path === '/moved',
      ),
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const routeHead = `import { createFileRoute } from '@tanstack/react-router'
const Page = () => null
const key = 'component'
const clientOptions = { component: Page }
`

describe('server-only routes', () => {
  // Control for the pins below (same harness). Moved from router-generator
  // known-bugs.test.ts, which asserted Start's rule on the generator's
  // option keys instead of what Start does with them.
  test.each([
    {
      options: `{ server: { handlers: {} }, component: Page }`,
      expected: { inClientTree: true, prerendered: true },
    },
    {
      options: `{ server: { handlers: {} } }`,
      expected: { inClientTree: false, prerendered: false },
    },
  ])(
    'a route with $options is in the client route tree and prerendered: $expected',
    async ({ options, expected }) => {
      expect(
        await startRouteOf(
          `${routeHead}export const Route = createFileRoute('/moved')(${options})`,
        ),
      ).toEqual(expected)
    },
  )

  // Bug: the route generator records only plain, non-computed, non-method
  // property keys of the route options (`createFileRouteProps`), so a
  // spread, a computed key, a method or an accessor is missed, and Start
  // takes a route with server handlers and only such client options for a
  // server-only route.
  // Impact: the route is pruned from the client route tree: navigating to it
  // in the browser finds no route.
  // Source: gap G11; #8504 router-generator transform.test.ts ("records
  // method, async method and accessor option keys"), where the method and
  // accessor rows pass.
  test.fails.each([
    { name: 'a spread', options: `...clientOptions` },
    { name: 'a computed key', options: `[key]: Page` },
    { name: 'a method', options: `component() { return null }` },
    { name: 'an async method', options: `async loader() { return null }` },
    { name: 'an accessor', options: `get component() { return Page }` },
  ])(
    'a route with server handlers and $name is in the client route tree',
    async ({ options }) => {
      const { inClientTree } = await startRouteOf(
        `${routeHead}export const Route = createFileRoute('/moved')({ server: { handlers: {} }, ${options} })`,
      )
      expect(inClientTree).toBe(true)
    },
  )
})

describe('prerendered pages', () => {
  // Control: "a route with { server: { handlers: {} }, component: Page }"
  // above (same harness).

  // Bug: same root cause as above: a page whose component comes from a
  // spread, a computed key or a method has no recorded `component` key, and
  // Start's prerender plugin skips it.
  // Impact: the page is not prerendered.
  // Source: gap G11.
  test.fails.each([
    { name: 'a spread', options: `...clientOptions` },
    { name: 'a computed key', options: `[key]: Page` },
    { name: 'a method', options: `component() { return null }` },
  ])(
    'a page whose component comes from $name is prerendered',
    async ({ options }) => {
      const { prerendered } = await startRouteOf(
        `${routeHead}export const Route = createFileRoute('/moved')({ ${options} })`,
      )
      expect(prerendered).toBe(true)
    },
  )
})
