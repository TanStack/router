/**
 * Unusual but valid route files split like any other: a route file starting
 * with a hashbang, and route files with non-ASCII names, in real builds.
 */
import { expect, test } from 'vitest'
import { build, clientMountEntry, rootRoute } from './build-harness'
import { expectValidModules, head, loadRoute } from './regression-helpers'

test('a route file starting with a hashbang splits, and every module is valid', async () => {
  const loaded = await loadRoute(`#!/usr/bin/env node
${head}const label = 'MARK'
function Page() {
  return <p>{label} page</p>
}
export const Route = createFileRoute('/')({
  loader: () => label + ' data',
  component: Page,
})
`)
  await expectValidModules(loaded.modules)
  expect(loaded.isLazy('component')).toBe(true)
  expect((await loaded.load('component'))()).toBe('<p>MARK page</p>')
  expect(await (await loaded.load('loader'))()).toBe('MARK data')
})

test.each(['vite', 'rspack', 'webpack'] as const)(
  'a route file with a non-ASCII name is generated, split and rendered (%s)',
  async (bundler) => {
    const app = await build({
      bundler,
      env: 'client',
      files: {
        'routes/__root.tsx': rootRoute,
        'routes/café.日本語.tsx': `${head}function Page() {
  return <p>MARK_COMPONENT</p>
}
export const Route = createFileRoute('/café/日本語')({
  staticData: { label: 'MARK_ROUTE' },
  component: Page,
})
`,
        'entry.ts': clientMountEntry.replace(
          "'./routes/index'",
          "'./routes/café.日本語'",
        ),
      },
    })
    const run = await app.run(
      `await entry.mount(entry.Route.options.component)`,
    )
    expect({
      route: app.where('MARK_ROUTE'),
      component: app.where('MARK_COMPONENT'),
      html: run.html,
    }).toEqual({
      route: 'eager',
      component: 'lazy',
      html: '<div id="root"><p>MARK_COMPONENT</p></div>',
    })
  },
  120_000,
)
