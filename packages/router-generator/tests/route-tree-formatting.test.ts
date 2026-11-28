/**
 * `enableRouteTreeFormatting: true`: Prettier formats the route tree the
 * generator prints. Prettier's `format` is counted through a passthrough
 * mock of the `prettier` package (the generator loads it on first use).
 */
import { expect, vi } from 'vitest'
import { Generator } from '../src'
import { configOf, createApp, fileRoute, read, rootRoute, save } from './app'
import { test } from './test'
import type * as Prettier from 'prettier'

const format = vi.hoisted(() => ({ calls: 0 }))

vi.mock('prettier', async (importOriginal) => {
  const prettier = await importOriginal<typeof Prettier>()
  return {
    ...prettier,
    format: (...args: Parameters<typeof prettier.format>) => {
      format.calls++
      return prettier.format(...args)
    },
  }
})

// Bug: every run that rebuilt the tree formatted it again, an unchanged one
// included (a production build, a dev server's restart, an unchanged rescan):
// 120–180 ms per run at 338 routes.
// Source: src/generator.ts `publishTree()` formatted before comparing.
test('an unchanged route tree is not formatted again', async ({ appRoot }) => {
  const root = await createApp(appRoot, {
    'src/routes/__root.tsx': rootRoute(),
    'src/routes/index.tsx': fileRoute('/'),
  })
  // (a footer Prettier reformats: the tree written is Prettier's output)
  const config = configOf(root, {
    enableRouteTreeFormatting: true,
    routeTreeFileFooter: ['export const footer   =   {a:1}'],
  })
  const generator = new Generator({ config, root })
  const before = format.calls
  await generator.run()
  expect(format.calls - before).toBe(1)
  const tree = await read(root, 'src/routeTree.gen.ts')
  expect(tree).toContain('export const footer = { a: 1 }')
  expect(tree).not.toContain('{a:1}')

  await generator.run()
  await generator.run({ type: 'build' })
  expect(format.calls - before).toBe(1)
  expect(await read(root, 'src/routeTree.gen.ts')).toBe(tree)

  // A changed tree is formatted
  const added = await save(root, 'src/routes/about.tsx', fileRoute('/about'))
  await generator.run({ type: 'create', path: added })
  expect(format.calls - before).toBe(2)
  expect(await read(root, 'src/routeTree.gen.ts')).toContain('/about')
})
