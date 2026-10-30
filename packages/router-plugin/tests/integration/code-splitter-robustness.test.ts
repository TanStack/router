/**
 * Unusual but valid route files split like any other: route files with
 * non-ASCII names and JavaScript route files, in real builds.
 */
import { expect, test } from 'vitest'
import { build, clientMountEntry, head, rootRoute } from '../build-harness'

/**
 * One app per bundler holds both unusual route files: a route
 * file with a non-ASCII name (its route at `/café/日本語`, re-exported by
 * the entry as `CafeRoute`) and a JavaScript route file (`routes/index.jsx`,
 * the entry's `Route`). Built once and run once per route; each test reads
 * its own route's markers.
 */
type BundlerName = 'vite' | 'rspack' | 'webpack'

const results = new Map<BundlerName, ReturnType<typeof buildApp>>()

function appOf(bundler: BundlerName) {
  let result = results.get(bundler)
  if (!result) {
    result = buildApp(bundler)
    results.set(bundler, result)
  }
  return result
}

async function buildApp(bundler: BundlerName) {
  const app = await build({
    bundler,
    env: 'client',
    // No outcome here depends on webpack's minifier (terser), which takes
    // most of a webpack build: generation, placement of live code and the
    // rendering.
    ...(bundler === 'webpack' && { minify: false }),
    // Files outlive the test that built them; the result is all we keep
    registerCleanup: undefined,
    files: {
      'routes/__root.tsx': rootRoute,
      'routes/café.日本語.tsx': `${head}function Page() {
  return <p>MARK_CAFE_COMPONENT</p>
}
export const Route = createFileRoute('/café/日本語')({
  staticData: { label: 'MARK_CAFE_ROUTE' },
  component: Page,
})
`,
      'routes/index.jsx': `${head}const shared = { label: 'MARK_SHARED' }
function Page() {
  return <p>MARK_COMPONENT {shared.label}</p>
}
export const Route = createFileRoute('/')({
  loader: () => shared,
  component: Page,
})
`,
      'entry.ts': `${clientMountEntry}export { Route as CafeRoute } from './routes/café.日本語'
`,
    },
  })
  try {
    const cafe = await app.run(
      `await entry.mount(entry.CafeRoute.options.component)`,
    )
    const jsx = await app.run(
      `await entry.mount(entry.Route.options.component)
return entry.Route.options.loader().label`,
    )
    return {
      cafe: {
        route: app.where('MARK_CAFE_ROUTE'),
        component: app.where('MARK_CAFE_COMPONENT'),
        html: cafe.html,
      },
      jsx: {
        component: app.where('MARK_COMPONENT'),
        html: jsx.html,
        loaded: jsx.result,
      },
    }
  } finally {
    await app.dispose()
  }
}

test.each(['vite', 'rspack', 'webpack'] as const)(
  'a route file with a non-ASCII name is generated, split and rendered (%s)',
  async (bundler) => {
    expect((await appOf(bundler)).cafe).toEqual({
      route: 'eager',
      component: 'lazy',
      html: '<div id="root"><p>MARK_CAFE_COMPONENT</p></div>',
    })
  },
  120_000,
)

// A JavaScript route file (`.jsx`) splits like a TypeScript one in each
// bundler's build.
test.each(['vite', 'rspack', 'webpack'] as const)(
  'a .jsx route file is generated, split and rendered (%s)',
  async (bundler) => {
    expect((await appOf(bundler)).jsx).toEqual({
      component: 'lazy',
      html: '<div id="root"><p>MARK_COMPONENT MARK_SHARED</p></div>',
      loaded: 'MARK_SHARED',
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
        'entry.ts': clientMountEntry,
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
