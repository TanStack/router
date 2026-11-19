/**
 * Known route generator bugs. Each test asserts correct behaviour for a bug on
 * main and is marked .fails; remove .fails when the bug is fixed.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import { Generator, getConfig } from '../src'
import type { RouteNode } from '../src'

/**
 * Runs the generator on an app with a root route and `routes/moved.tsx`
 * holding `source`, like after moving a route file to `/moved`. Returns the
 * route file as the generator wrote it and its route node as generator
 * plugins receive it.
 */
async function generateMovedRoute(source: string) {
  const root = await mkdtemp(path.join(tmpdir(), 'tsr-known-bugs-'))
  try {
    await mkdir(path.join(root, 'routes'))
    await writeFile(
      path.join(root, 'routes/__root.tsx'),
      `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()`,
    )
    await writeFile(path.join(root, 'routes/moved.tsx'), source)
    let routeNodes: Array<RouteNode> = []
    const config = getConfig({
      disableLogging: true,
      routesDirectory: path.join(root, 'routes'),
      generatedRouteTree: path.join(root, 'routeTree.gen.ts'),
      // Same filesystem as the app, so the generator can rename its temp files
      tmpDir: path.join(root, '.tanstack/tmp'),
      plugins: [
        {
          name: 'route-nodes',
          onRouteTreeChanged: (opts) => {
            routeNodes = opts.routeNodes
          },
        },
      ],
    })
    await new Generator({ config, root }).run()
    return {
      written: await readFile(path.join(root, 'routes/moved.tsx'), 'utf8'),
      node: routeNodes.find((node) => node.routePath === '/moved'),
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

/**
 * Evaluates a route file with stub route constructors and returns the id its
 * `Route` is created with. Like a bundler, fails on an invalid module.
 */
async function routeIdOf(code: string) {
  const { code: javascript } = await transformWithOxc(code, 'route.tsx')
  const router = `data:text/javascript,${encodeURIComponent(
    `export const createFileRoute = (id) => (options) => ({ id, options })
export const createLazyFileRoute = createFileRoute`,
  )}`
  const linked = javascript.replaceAll(
    /(["'])@tanstack\/react-router\1/g,
    JSON.stringify(router),
  )
  const { Route } = await import(
    /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(linked)}`
  )
  return Route.id as string
}

/** Whether Start prunes the route as server-only (`pruneServerOnlySubtrees`). */
const isServerOnly = (node: RouteNode | undefined) =>
  !!node?.createFileRouteProps?.has('server') &&
  node.createFileRouteProps.size === 1

const routeHead = `import { createFileRoute } from '@tanstack/react-router'
const Page = () => null
const key = 'component'
const clientOptions = { component: Page }
`

describe('route options', () => {
  // Control for the route options pin below (same harness).
  test.each([
    {
      options: `{ server: { handlers: {} }, component: Page }`,
      expected: false,
    },
    { options: `{ server: { handlers: {} } }`, expected: true },
  ])(
    'the route node of $options is server-only: $expected',
    async ({ options, expected }) => {
      const { node } = await generateMovedRoute(
        `${routeHead}export const Route = createFileRoute('/moved')(${options})`,
      )
      expect(isServerOnly(node)).toBe(expected)
    },
  )

  // Bug: the route options the generator reports to its plugins
  // (`createFileRouteProps`) only count plain, non-computed properties, so a
  // spread, a computed key or a method is missed.
  // Impact: Start prunes a route that also has client options as a
  // server-only route, so it is missing from the client route tree.
  test.fails.each([
    { name: 'a spread', options: `...clientOptions` },
    { name: 'a computed key', options: `[key]: Page` },
    { name: 'a method', options: `component() { return null }` },
  ])(
    'a route with server handlers and $name is not server-only',
    async ({ options }) => {
      const { node } = await generateMovedRoute(
        `${routeHead}export const Route = createFileRoute('/moved')({ server: { handlers: {} }, ${options} })`,
      )
      expect(node).toBeDefined()
      expect(isServerOnly(node)).toBe(false)
    },
  )
})

describe('route constructor imports', () => {
  // Control for the route constructor pin below (same harness).
  test('a moved route gets the id of its new path', async () => {
    const { written } =
      await generateMovedRoute(`import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/old')({})`)
    expect(await routeIdOf(written)).toBe('/moved')
  })

  // Bug: the route constructor call is recognized by its callee name, apart
  // from its import: an aliased import (`createFileRoute as route`) is not
  // recognized, and a type-only import of `createFileRoute` is not seen as
  // its binding, so a value import of the same name is added next to it.
  // Impact: the route keeps its old id when its file moves, or the written
  // route file declares `createFileRoute` twice and fails to build.
  test.fails.each([
    {
      name: 'an aliased import',
      source: `import { createFileRoute as route } from '@tanstack/react-router'
export const Route = route('/old')({})`,
    },
    {
      name: 'a type-only import',
      source: `import type { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/old')({})`,
    },
  ])(
    'a moved route with $name gets the id of its new path',
    async ({ source }) => {
      const { written } = await generateMovedRoute(source)
      expect(await routeIdOf(written)).toBe('/moved')
    },
  )
})
