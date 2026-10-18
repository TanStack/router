/**
 * Unusual but valid route files split like any other: route files with
 * non-ASCII names, in real builds.
 */
import { expect, test } from 'vitest'
import { build, clientMountEntry, rootRoute } from './build-harness'
import { head } from './regression-helpers'

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

// A watch build (webpack-dev-server, `--watch`) rebuilds from its cache after
// an edit: the split stays as in a fresh build. Source: the #8504 probe (a
// module marked side-effect free lost the mark on a cached rebuild).
test.each(['rspack', 'webpack'] as const)(
  'an exported component a split component renders still loads with its chunk after a cached rebuild (%s)',
  async (bundler) => {
    const route = (version: string) => `${head}export function Card() {
  return <b>{'MARK_CARD_END'}</b>
}
function Page() {
  return <p><Card />{'${version}'}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`
    const app = await build({
      bundler,
      env: 'client',
      files: {
        'routes/__root.tsx': rootRoute,
        'routes/index.tsx': route('v1'),
        // Like the route tree, the entry imports only `Route`.
        'entry.ts': clientMountEntry.replace(
          "export * from './routes/index'",
          "export { Route } from './routes/index'",
        ),
      },
      rebuildAfter: { 'routes/index.tsx': route('v2') },
    })
    const run = await app.run(
      `await entry.mount(entry.Route.options.component)`,
    )
    expect({ card: app.where('MARK_CARD_END'), html: run.html }).toEqual({
      card: 'lazy',
      html: '<div id="root"><p><b>MARK_CARD_END</b>v2</p></div>',
    })
  },
  120_000,
)
