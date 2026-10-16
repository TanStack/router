/**
 * Known route generator bugs. Each test asserts correct behaviour for a bug on
 * main and is marked .fails; remove .fails when the bug is fixed.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { Generator, getConfig } from '../src'
import { routeIdOf } from './route-id'
import type { RouteNode } from '../src'

/**
 * Runs the generator on an app with a root route and `routes/moved.tsx`
 * holding `source`, like after moving a route file to `/moved`. Returns the
 * route file as the generator wrote it and its route node as generator
 * plugins receive it.
 */
async function generateMovedRoute(source: string) {
  const warnings: Array<string> = []
  const warn = vi
    .spyOn(console, 'warn')
    .mockImplementation((...args) => warnings.push(args.join(' ')))
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  const info = vi.spyOn(console, 'info').mockImplementation(() => {})
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
      warnings,
    }
  } finally {
    warn.mockRestore()
    log.mockRestore()
    info.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
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

describe('route calls with TypeScript wrappers', () => {
  // Control: "a moved route gets the id of its new path" below (same
  // harness).

  // Bug: the generator reads the route constructor and the route id only
  // as a plain identifier and a plain string: a TypeScript wrapper around the
  // constructor is not recognized (the file is left as it is), and one around
  // the id is rejected ("expected route id to be a string literal or plain
  // template literal").
  // Impact: a moved route keeps its old id, or route generation fails for
  // the file.
  // Source: #8504 router-generator transform.test.ts ("reads route call
  // parts through parentheses and TypeScript wrappers"), where it passes.
  test.fails.each([
    {
      name: 'a cast constructor',
      call: `(createFileRoute as typeof createFileRoute)('/old')({})`,
    },
    { name: 'an id `as const`', call: `createFileRoute('/old' as const)({})` },
    {
      name: 'an id that `satisfies` a type',
      call: `createFileRoute('/old' satisfies string)({})`,
    },
  ])(
    'a moved route with $name gets the id of its new path',
    async ({ call }) => {
      const { written } =
        await generateMovedRoute(`import { createFileRoute } from '@tanstack/react-router'
export const Route = ${call}`)
      expect(await routeIdOf(written)).toBe('/moved')
    },
  )
})

describe('type-only Route exports', () => {
  // Control for the pin below (same harness): a file without a Route export
  // is left out of the route tree, with a warning naming it.
  test('a route file without a Route export is left out with a warning', async () => {
    const { node, warnings } = await generateMovedRoute(
      `export const helper = 1`,
    )
    expect(node).toBeUndefined()
    expect(warnings.join('\n')).toContain('moved.tsx')
  })

  // Bug: the generator takes a type-only export named `Route` for the route
  // export: `export type { MyRoute as Route }` gets its route id rewritten,
  // and `export declare const Route` is left as is; both stay in the route
  // tree, which imports a `Route` value the module does not export.
  // Impact: the app fails to build or load ("does not provide an export
  // named 'Route'") instead of the file being left out with a warning.
  // Source: gap G8; #8504 router-generator transform.test.ts ("does not
  // treat a type-only Route export as a route"), where it passes.
  test.fails.each([
    `const MyRoute = createFileRoute('/moved')({})\nexport type { MyRoute as Route }`,
    `const MyRoute = createFileRoute('/moved')({})\nexport { type MyRoute as Route }`,
    'export declare const Route: unknown',
  ])(
    'a route file whose Route export is type-only is left out: %s',
    async (code) => {
      const { node, warnings } =
        await generateMovedRoute(`import { createFileRoute } from '@tanstack/react-router'
${code}`)
      expect(node).toBeUndefined()
      expect(warnings.join('\n')).toContain('moved.tsx')
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
