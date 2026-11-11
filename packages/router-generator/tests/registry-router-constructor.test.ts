/**
 * The registry (`getRoutesByFileMap`) says whether a route file's `Route` is
 * the router package's own constructor call (`routerConstructor`): a
 * consumer may then take that export as a route without reading the file.
 * A file whose Route comes from the app's own factory is listed as foreign,
 * and a change of that fact republishes the registry.
 */
import { expect, test } from 'vitest'
import { Generator } from '../src'
import { configOf, createApp, fileRoute, rootRoute, save } from './app'

const foreignRoute = (
  id: string,
) => `import { makeRoute } from '../lib/make-route'

export const Route = makeRoute('${id}')({})
`

test('a batch that fails keeps the routes but not a constructor fact the file no longer holds', async () => {
  const root = await createApp({
    'src/lib/make-route.ts': `export const makeRoute = (id: string) => (options: object) => ({ id, options })\n`,
    'src/routes/__root.tsx': rootRoute(),
    'src/routes/about.tsx': fileRoute('/about'),
  })
  const generator = new Generator({ config: configOf(root), root })
  await generator.run({ type: 'build' })

  const broken = await save(
    root,
    'src/routes/broken.tsx',
    'export const Route = (',
  )
  await expect(
    generator.run({ type: 'create', path: broken }),
  ).rejects.toThrow()
  const entry = () =>
    [...generator.getRoutesByFileMap().values()].find(
      (v) => v.routeId === '/about',
    )
  expect(entry()?.routerConstructor).toBe(true)

  const about = await save(root, 'src/routes/about.tsx', foreignRoute('/about'))
  await expect(generator.run({ type: 'update', path: about })).rejects.toThrow()
  expect(entry()?.routerConstructor).toBe(false)
  // the failed tree publishes no route
  expect(
    [...generator.getRoutesByFileMap().values()].map((v) => v.routeId),
  ).not.toContain('/broken')
})

test('a route made by the router package is listed with routerConstructor, a foreign one without', async () => {
  const root = await createApp({
    'src/lib/make-route.ts': `export const makeRoute = (id: string) => (options: object) => ({ id, options })\n`,
    'src/routes/__root.tsx': rootRoute(),
    'src/routes/about.tsx': fileRoute('/about'),
    'src/routes/foreign.tsx': foreignRoute('/foreign'),
  })
  const config = configOf(root)
  const generator = new Generator({ config, root })
  await generator.run({ type: 'build' })

  const byRoute = () =>
    Object.fromEntries(
      [...generator.getRoutesByFileMap().values()].map((v) => [
        v.routeId,
        v.routerConstructor,
      ]),
    )
  expect(byRoute()).toEqual({
    '/__root': false,
    '/about': true,
    '/foreign': false,
  })

  // the fact changes without the tree changing: the registry is republished
  const before = generator.getRoutesByFileMap()
  const file = await save(root, 'src/routes/foreign.tsx', fileRoute('/foreign'))
  await generator.run({ type: 'update', path: file })
  expect(generator.getRoutesByFileMap()).not.toBe(before)
  expect(byRoute()['/foreign']).toBe(true)

  // an edit that changes neither the tree nor the fact keeps the registry object
  const same = generator.getRoutesByFileMap()
  const edited = await save(
    root,
    'src/routes/foreign.tsx',
    fileRoute('/foreign', `{ component: () => 'edited' }`),
  )
  await generator.run({ type: 'update', path: edited })
  expect(generator.getRoutesByFileMap()).toBe(same)
})

// The registry's verdict per spelling of the route call: the router
// package's constructor of the file's kind, by binding, through any wrapper
// (a cast around a namespace import too); another framework's router package
// or a subpath of the router package is not the app's router.
// Bug: the root route file is never read, so its route is listed as not
// made by the router package's constructor, and a compiler reads the file
// for its `Route` (design 5 D2).
test.fails(
  'a root route made by createRootRoute is listed with routerConstructor',
  async () => {
    const root = await createApp({ 'src/routes/__root.tsx': rootRoute() })
    const generator = new Generator({ config: configOf(root), root })
    await generator.run({ type: 'build' })

    expect(
      [...generator.getRoutesByFileMap().values()].find(
        (v) => v.routeId === '/__root',
      )?.routerConstructor,
    ).toBe(true)
  },
)

const spellings = [
  {
    name: 'a namespace import in a cast',
    source: `import * as R from '@tanstack/react-router'
export const Route = (R as any).createFileRoute('/x')({})
`,
    routerConstructor: true,
    // Bug: a cast around the namespace object is not unwrapped (design 5 D1)
    pinned: true,
  },
  {
    name: "another framework's router package",
    source: `import { createFileRoute } from '@tanstack/solid-router'
export const Route = createFileRoute('/x')({})
`,
    routerConstructor: false,
  },
  {
    name: 'a subpath of the router package',
    source: `import { createFileRoute } from '@tanstack/react-router/ssr/client'
export const Route = createFileRoute('/x')({})
`,
    routerConstructor: false,
  },
]

async function listedConstructor(source: string) {
  const root = await createApp({
    'src/routes/__root.tsx': rootRoute(),
    'src/routes/x.tsx': source,
  })
  const generator = new Generator({ config: configOf(root), root })
  await generator.run({ type: 'build' })
  return [...generator.getRoutesByFileMap().values()].find(
    (v) => v.routeId === '/x',
  )?.routerConstructor
}

test.for(spellings.filter((row) => !row.pinned))(
  'a route made with $name is listed with routerConstructor $routerConstructor',
  async ({ source, routerConstructor }) => {
    expect(await listedConstructor(source)).toBe(routerConstructor)
  },
)

test.for(spellings.filter((row) => row.pinned))(
  'a route made with $name is listed with routerConstructor $routerConstructor',
  { fails: true },
  async ({ source, routerConstructor }) => {
    expect(await listedConstructor(source)).toBe(routerConstructor)
  },
)
