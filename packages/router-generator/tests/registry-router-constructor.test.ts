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
