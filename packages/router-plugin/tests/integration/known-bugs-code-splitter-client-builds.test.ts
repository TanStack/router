// Slow-tier half of this suite: the tests that need a real tool. Its
// page tests are in pages/known-bugs-code-splitter.test.ts.
/**
 * Known code-splitter bugs. Each test asserts correct behaviour for a bug on
 * main and is marked .fails; remove .fails when the bug is fixed.
 */

import { describe, expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { build, head, routeApp } from '../build-harness'
import type { Bundler } from '@tanstack/compiler-test-utils/build-harness'

/**
 * Bundlers whose router plugin splits routes (the esbuild adapter does not;
 * pinned in build-harness.test.ts).
 */
const clientBundlers: Array<Bundler> = ['vite', 'rspack', 'webpack']

describe('route options written in other shapes', () => {
  // The unused `makeOptions` of the two rows above may name a `Page` its
  // module no longer declares (SPEC G8: the bundlers
  // delete it), as long as that dead code does not reach a production client
  // bundle (which the build harness also checks for any dangling name).
  test.each(
    clientBundlers.flatMap((bundler) =>
      [
        `createFileRoute('/')({ ssr: false, component: Page } as any)`,
        `(createFileRoute('/') as any)({ ssr: false, component: Page })`,
      ].map((route) => ({ bundler, route })),
    ),
  )(
    'a route written as $route drops its unused options factory from a production client build ($bundler)',
    async ({ bundler, route }) => {
      const app = await build({
        bundler,
        env: 'client',
        files: routeApp(
          `${head}function Page() {
  return <p>page</p>
}
const makeOptions = () => ({ component: Page, title: 'MARK_MAKE_OPTIONS_END' })
export const Route = ${route}
`,
          { env: 'client' },
        ),
      })
      const run = await app.run(
        `await entry.mount(entry.Route.options.component)`,
      )
      expect({
        makeOptions: app.where('MARK_MAKE_OPTIONS_END'),
        html: run.html,
      }).toEqual({
        makeOptions: 'nowhere',
        html: '<div id="root"><p>page</p></div>',
      })
    },
    60_000,
  )
})

describe('what split chunks hold', () => {
  // Bug: once the pin above is fixed, the split option must also end up
  // split, or the build must say why (SPEC J2.8, G5). Splitting the result of
  // a call would change when the call runs, so the user has to change the
  // pattern: a warning naming the file and the option is acceptable. Today
  // the build fails first (same root cause as the pin above).
  // Impact: the component loads with the entry chunk.
  test('a component declared by an array destructuring of a call shared with the errorComponent is split or reported', async () => {
    const app = await build({
      bundler: 'vite',
      env: 'client',
      files: routeApp(
        `${head}const createPair = () => [() => <div>{'MARK_PAGE'}</div>, () => <p>error</p>]
const [Page, ErrorView] = createPair()
export const Route = createFileRoute('/')({
  component: Page,
  errorComponent: ErrorView,
})
`,
        { env: 'client' },
      ),
    })
    const reported =
      findDiagnostics([...app.warnings, ...app.consoleMessages], {
        severity: 'warning',
        file: 'routes/index.tsx',
        root: app.root,
      }).length > 0
    expect({
      lazy: app.where('MARK_PAGE') === 'lazy',
      reported,
    }).not.toEqual({ lazy: false, reported: false })
  }, 60_000)
})

describe('code that reads a split binding', () => {
  /**
   * Builds a route whose split component `Page` an unused module-level
   * object also names, and mounts the component in the client bundle.
   */
  async function mountUnusedReader(bundler: Bundler) {
    const app = await build({
      bundler,
      env: 'client',
      files: routeApp(
        `${head}function Page() {
  return <p>MARK_PAGE</p>
}
const opts = { component: Page }
export const Route = createFileRoute('/')({ component: Page })
`,
        { env: 'client' },
      ),
    })
    const run = await app.run(
      `await entry.mount(entry.Route.options.component)`,
    )
    return run.html
  }

  // Control for the pin below: Rspack and webpack drop the unused object
  // while minifying, together with its read of the deleted binding.
  test.each(['rspack', 'webpack'] as const)(
    'a split component that an unused object names renders (%s)',
    async (bundler) => {
      expect(await mountUnusedReader(bundler)).toContain('<p>MARK_PAGE</p>')
    },
    60_000,
  )

  // Bug: same root cause as above, for an unused module-level object that
  // names the split component: the route module keeps the object but loses
  // `Page`. Rolldown keeps the object, as reading an undeclared binding can
  // throw. (The build harness now rejects that output before it runs: its
  // entry chunk reads the undeclared `Page`.)
  // Source: Wave B (a Vite Start client bundle crashed on it).
  // Impact: the client bundle throws when the route module loads ("Page is
  // not defined"), so the app never renders.
  test('a split component that an unused object names renders (vite)', async () => {
    expect(await mountUnusedReader('vite')).toContain('<p>MARK_PAGE</p>')
  }, 60_000)
})
