// Slow-tier half of this suite: the tests that need a real tool. Its
// in-process tests are in ../code-splitter-dead-code.test.ts (fast tier).
import { describe, expect, it } from 'vitest'
import { build, clientMountEntry, head, routeApp } from '../build-harness'

/**
 * Which code a production client build drops is the bundler's decision: one
 * app per bundler holds the route of every test below (`routes/index.tsx`
 * and the routes the entry exports as `<name>Route`), built once and run
 * once per route (speedup 6).
 */
type BundlerName = 'vite' | 'rspack' | 'webpack'

const unusedFunctions = `${head}function helper() { return 'helper' }
function unused() { return 'MARK_UNUSED_END' + helper() }
function ping(): number { return pong() + ('MARK_PING_END' + Math.random()).length }
function pong(): number { return ping() }
export const Route = createFileRoute('/')({ component: () => <p>{helper()}</p> })
`

/**
 * A route with a pragma whose split component calls `makeLabel` once
 * unused (`marker`) and once for what it renders; `makeLabel` calls an
 * effectful `format`.
 */
const annotatedRoute = (
  path: string,
  annotation: string,
  marker: string,
) => `/** @jsxImportSource @emotion/react */
${head}import { format } from '../format'
${annotation}function makeLabel(text: string) {
  return format(text)
}
export const Route = createFileRoute('${path}')({
  component: () => {
    makeLabel('${marker}')
    return <p>{makeLabel('used')}</p>
  },
})
`

/** Routes besides `routes/index.tsx`, by the name the entry exports them. */
const otherRoutes: Record<BundlerName, Record<string, string>> = {
  vite: {
    annotated: annotatedRoute(
      '/annotated',
      '/* #__NO_SIDE_EFFECTS__ */ ',
      'MARK_ANNOTATED_UNUSED_CALL',
    ),
    plain: annotatedRoute('/plain', '', 'MARK_PLAIN_UNUSED_CALL'),
  },
  rspack: {
    annotated: annotatedRoute(
      '/annotated',
      '/* #__NO_SIDE_EFFECTS__ */ ',
      'MARK_ANNOTATED_UNUSED_CALL',
    ),
  },
  // webpack's production minifier keeps an unused call of an annotated
  // function even when nothing is split (`autoCodeSplitting: false`), in
  // every spelling of the annotation: not an outcome of the router plugin.
  webpack: {},
}

const markers = [
  'MARK_UNUSED_END',
  'MARK_PING_END',
  'MARK_ANNOTATED_UNUSED_CALL',
  'MARK_PLAIN_UNUSED_CALL',
]

/** Where each marker is and what each route's component renders, per bundler. */
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
  const others = otherRoutes[bundler]
  const app = await build({
    bundler,
    env: 'client',
    // Files outlive the test that built them; the result is all we keep
    registerCleanup: undefined,
    files: routeApp(unusedFunctions, {
      env: 'client',
      files: {
        // `format` has an effect: only the annotation lets a bundler drop a
        // call of `makeLabel`.
        'format.ts': `export function format(text: string) {
  ;(globalThis as any).formatted = ((globalThis as any).formatted ?? 0) + 1
  return text.toUpperCase()
}
`,
        ...Object.fromEntries(
          Object.entries(others).map(([name, route]) => [
            `routes/${name}.tsx`,
            route,
          ]),
        ),
        'entry.ts': `${clientMountEntry}${Object.keys(others)
          .map(
            (name) =>
              `export { Route as ${name}Route } from './routes/${name}'\n`,
          )
          .join('')}`,
      },
    }),
  })
  try {
    const html: Record<string, string> = {}
    for (const name of ['', ...Object.keys(others)]) {
      const run = await app.run(
        `await entry.mount(entry.${name ? `${name}Route` : 'Route'}.options.component)`,
      )
      html[name || 'index'] = run.html!
    }
    return {
      where: Object.fromEntries(
        markers.map((marker) => [marker, app.where(marker)]),
      ),
      html,
    }
  } finally {
    await app.dispose()
  }
}

describe('the reference module only drops code that splitting left unused', () => {
  // Source: babel-dead-code-elimination dead-code-elimination.test.ts "only
  // eliminates newly unreferenced identifiers", "unexported circular references"
  // and "SCC with external caller used -> all preserved". Whether unused user
  // code is kept or dropped is free, and unused code may name a binding its
  // module no longer declares (user ruling 2026-10-17, widened: the bundlers
  // delete it; the validator checks what Rolldown's tree-shaking keeps);
  // every module stays valid and the split component still reaches its
  // helper.

  // The other half of the ruling: the unused functions (and any binding they
  // name that their module no longer declares) do not reach a production
  // client bundle.
  it.each(['vite', 'rspack', 'webpack'] as const)(
    'drops unused functions, one calling a helper of the split component, from a production client build (%s)',
    async (bundler) => {
      const { where, html } = await appOf(bundler)
      expect({
        unused: where.MARK_UNUSED_END,
        ping: where.MARK_PING_END,
        html: html.index,
      }).toEqual({
        unused: 'nowhere',
        ping: 'nowhere',
        html: '<div id="root"><p>helper</p></div>',
      })
    },
    60_000,
  )
})

// Bundlers drop an unused call of a function annotated #__NO_SIDE_EFFECTS__,
// so the annotation must move with the function into whichever module the
// code splitter puts it in, also in a file whose pragma comment every
// emitted module repeats (SPEC G2, G12; V1 split F38). Observed on the
// production client output: the unused call (and the effect it would run)
// is gone, the used one still renders. The emitted name of the function is
// free.
describe('a function annotated #__NO_SIDE_EFFECTS__', () => {
  // Which calls a minifier drops is the bundler's decision: every bundler
  // that honours the annotation (see `otherRoutes` for webpack).
  it.each(['vite', 'rspack'] as const)(
    'loses its unused call and keeps rendering the used one in a production client build (%s)',
    async (bundler) => {
      const { where, html } = await appOf(bundler)
      expect({
        unusedCall: where.MARK_ANNOTATED_UNUSED_CALL,
        html: html.annotated,
      }).toEqual({
        unusedCall: 'nowhere',
        html: '<div id="root"><p>USED</p></div>',
      })
    },
    60_000,
  )

  // Control: without the annotation the effectful call stays (any bundler
  // keeps a call with an effect; Vite stands for the others).
  it('keeps the unused call without the annotation (vite)', async () => {
    const { where, html } = await appOf('vite')
    expect({
      unusedCall: where.MARK_PLAIN_UNUSED_CALL,
      html: html.plain,
    }).toEqual({
      unusedCall: expect.not.stringMatching(/^nowhere$/),
      html: '<div id="root"><p>USED</p></div>',
    })
  }, 60_000)
})
