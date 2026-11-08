// Slow-tier half of this suite: the tests that need a real tool. Its
// page tests are in pages/known-bugs-code-splitter.test.ts.
/**
 * Known code-splitter bugs. Each test asserts the correct behaviour for a bug
 * main had, which today's compiler fixes (a regression test,
 * oracle/KNOWN-BUGS.md).
 */

import { describe, expect, test } from 'vitest'
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
})
