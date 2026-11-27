/**
 * A Solid route file edit that adds or removes a split component (an
 * `errorComponent` of its own chunk) next to components that stay where
 * they are: every save shows in place (SPEC J3.2), on the open route and on
 * a route the page has not shown. A component that moves to another module
 * (`route-hmr-browser-regroup.test.ts`), or leaves a split chunk another
 * component stays in, reloads the page: solid-refresh stops patching a
 * module that lost a component
 * (https://github.com/solidjs/solid-refresh/issues/88), so that save would
 * not show.
 *
 * Bug: the router compared the whole split layout of the route module with
 * its first evaluation's, so an added or removed component read as a move.
 * Impact: each such save reloaded the page, on Vite, Rsbuild and webpack
 * (main updated in place).
 */
import { describe, it } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'
import { openWebpackHmrPage } from '../webpack-hmr-page'
import type { TestContext } from 'vitest'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'

const timeout = 90_000

type Bundler = 'vite' | 'rsbuild' | 'webpack'

interface App {
  page: BrowserPage
  edit: (
    files: Record<string, string>,
    expected: string,
  ) => Promise<{ reloaded: boolean; errors: Array<string> }>
}

async function open(
  bundler: Bundler,
  files: Record<string, string>,
  ready: string,
  onTestFinished: TestContext['onTestFinished'],
): Promise<App> {
  if (bundler === 'webpack') {
    // its own page and server cleanup (`test-scope`)
    return openWebpackHmrPage({ target: 'solid', files, ready })
  }
  return openRouteHmrPage({
    bundler,
    target: 'solid',
    onTestFinished,
    files,
    ready,
  })
}

/** The index route, with an error component when `error`. */
const index = (groupings: string, version: number, error: boolean) =>
  `import { createFileRoute } from '@tanstack/solid-router'
export const Route = createFileRoute('/')({
  codeSplitGroupings: ${groupings},
  loader: () => 'data',${error ? '\n  errorComponent: Oops,' : ''}
  component: Page,
})
function Page() {
  return <p>page v${version}</p>
}${error ? '\nfunction Oops() {\n  return <p>oops</p>\n}' : ''}
`

const apart = `[['loader'], ['component'], ['errorComponent']]`

/** Whether the page still runs the document it loaded first, once `check` holds in it. */
async function sameDocumentOnce(
  page: BrowserPage,
  check: string,
): Promise<boolean> {
  const deadline = Date.now() + 15_000
  for (;;) {
    try {
      const state = await page.page.evaluate<{ ok: boolean; kept: boolean }>(
        `({ ok: Boolean(${check}), kept: window.__keptDocument === true })`,
      )
      if (state.ok) {
        return state.kept
      }
    } catch {
      // a document loading again
    }
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${check}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

describe.each(['vite', 'rsbuild', 'webpack'] as const)(
  '%s: a solid app',
  (bundler) => {
    it(
      'adds, edits and removes the error component of the open route in place',
      { timeout },
      async ({ expect, onTestFinished }: TestContext) => {
        const app = await open(
          bundler,
          { 'routes/index.tsx': index(apart, 1, false) },
          'page v1',
          onTestFinished,
        )
        const saves = [true, true, false, false, true, true]
        for (const [i, error] of saves.entries()) {
          const v = i + 2
          expect(
            await app.edit(
              { 'routes/index.tsx': index(apart, v, error) },
              `page v${v}`,
            ),
            `save v${v}`,
          ).toEqual({ reloaded: false, errors: [] })
        }
      },
    )

    it(
      'adds and removes the error component of a route the page has not shown, in place',
      { timeout },
      async ({ expect, onTestFinished }: TestContext) => {
        const extra = (error: boolean) =>
          `import { createFileRoute } from '@tanstack/solid-router'
export const Route = createFileRoute('/extra')({${error ? '\n  errorComponent: () => <p>oops</p>,' : ''}
  component: () => <p>extra</p>,
})
`
        const app = await open(
          bundler,
          {
            'routes/index.tsx': `import { createFileRoute } from '@tanstack/solid-router'
export const Route = createFileRoute('/')({ component: () => <p>home</p> })
`,
            'routes/extra.tsx': extra(false),
          },
          'home',
          onTestFinished,
        )
        await app.page.page.evaluate('window.__keptDocument = true')
        const option = `window.__APP_ROUTER__.routesById['/extra'].options.errorComponent`
        for (const error of [true, false]) {
          await app.edit({ 'routes/extra.tsx': extra(error) }, 'home')
          expect(
            await sameDocumentOnce(app.page, error ? option : `!${option}`),
            `errorComponent ${error ? 'added' : 'removed'}`,
          ).toBe(true)
        }
      },
    )

    it(
      'reloads once to remove the error component sharing the chunk of the open route component, then edits and adds it back in place',
      { timeout },
      async ({ expect, onTestFinished }: TestContext) => {
        const shared = `[['loader'], ['component', 'errorComponent']]`
        const app = await open(
          bundler,
          { 'routes/index.tsx': index(shared, 1, true) },
          'page v1',
          onTestFinished,
        )
        const saves = [false, false, true, true]
        for (const [i, error] of saves.entries()) {
          const v = i + 2
          expect(
            await app.edit(
              { 'routes/index.tsx': index(shared, v, error) },
              `page v${v}`,
            ),
            `save v${v}`,
          ).toEqual({ reloaded: v === 2, errors: [] })
        }
      },
    )
  },
)
