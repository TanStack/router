/**
 * Freshness of a Start app on Vite's dev server, seen by a page: after a file
 * event, a dependent whose compile now fails shows its error. (Split from
 * start-dev-freshness.test.ts, whose tests run without a browser, so that
 * file runs on the macOS and Windows smoke list.)
 */
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { waitForOutcome } from '@tanstack/compiler-test-utils/outcome'
import { startBrowserStartDevServer } from './importProtection/client-pages'

const timeout = 60_000

const builder = `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`

describe('Vite dev: a dependent that stops compiling', () => {
  // The page loads `main.ts`, which imports `d.ts` and `x.ts`; `x.ts`
  // re-exports `b.ts`'s `base` and accepts its own updates, so an update of
  // `b.ts` stops there. `d.ts` calls `base.handler()` with no
  // implementation: fine while `base` is a plain object, an error once it is
  // a server fn builder. After that edit of `b.ts` the error shows: the page
  // loads `d.ts` again, and the dev server reports its compile error.
  // Bug: the host compiled each dependent itself to keep unchanged ones out
  // of the update, and a dependent whose compile failed counted as
  // unchanged: nothing loaded `d.ts` again, and its error showed only once
  // something requested it.
  // Source: Fable 5.2 review of the Vite host (F6-5).
  test(
    'its error shows without a request of it',
    async () => {
      const server = await startBrowserStartDevServer({
        files: {
          'src/b.ts': `export const base = { handler: () => 'MARK_PLAIN' }\n`,
          'src/x.ts': `export { base } from './b'
if (import.meta.hot) {
  import.meta.hot.accept()
}
`,
          'src/d.ts': `import { base } from './x'
export const fn = base.handler()
`,
          'src/main.ts': `import { fn } from './d'
import { base } from './x'
export { fn, base }
`,
        },
      })
      const url = new URL('/__ip-fixture.html', server.url)
      url.searchParams.set('entry', '/src/main.ts')
      const page = await openPage(url.href, { registerCleanup: onTestFinished })
      const loaded = await page.page.waitForFunction(() => {
        const w = window as { __ipEntry?: unknown; __ipLoadError?: string }
        return w.__ipEntry ? 'loaded' : (w.__ipLoadError ?? false)
      })
      expect(await loaded.jsonValue()).toBe('loaded')
      const errorAtD = () =>
        findDiagnostics(server.diagnostics, {
          severity: 'error',
          file: 'src/d.ts',
          root: server.root,
        })
      expect(errorAtD()).toEqual([])
      await server.edit({ 'src/b.ts': builder })
      await waitForOutcome({
        applied: () => errorAtD().length > 0,
        timeout: 15_000,
        describe: () => 'no error reported at src/d.ts',
      })
    },
    timeout,
  )
})
