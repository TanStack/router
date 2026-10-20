/**
 * Known router plugin bugs that only show on a running dev server, after
 * edits, in a real browser page. Each pin asserts correct behaviour for a
 * bug on main and is marked .fails; remove .fails when the bug is fixed.
 * Each pin has a control test that runs the same harness on a case that
 * works. The in-process ones: ../known-bugs-dev-server.test.ts.
 */
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { isServedAppModule, routerDevServer } from '../dev-server'
import { head, importRequests } from '../regression-helpers'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'

const timeout = 60_000

describe('a dev server compiling an edited route out of order', () => {
  const route = '/routes/page.tsx'

  /** Without the HMR timestamps an edit adds to import URLs. */
  const withoutTimestamps = (code: string) =>
    code.replace(/([?&])t=\d+(&?)/g, (_, before, after) =>
      after ? before : '',
    )

  /**
   * The route module and every module of the app it reaches through
   * static and dynamic imports as the dev server serves them (its split
   * chunks, the modules they share, a module a plugin serves: whatever
   * their URLs), breadth first, as a page loading the route and its chunks
   * requests them: the dev server compiles each one now.
   */
  async function loadRouteModules(server: DevServer) {
    const urls = [route]
    // (The array's iterator reads its length at each step: it also visits
    // the requests pushed below.)
    for (const url of urls) {
      const code = withoutTimestamps(await server.transform(url))
      for (const { specifier } of importRequests(code, url)) {
        if (isServedAppModule(specifier) && !urls.includes(specifier)) {
          urls.push(specifier)
        }
      }
    }
    return urls
  }

  /**
   * The page: it imports the route module from the dev server, like an app
   * (the browser requests the route module and what it imports, getting
   * what the dev server compiled last), loads its `component` and, when the
   * route has one, its `errorComponent` (`preload()` of the real router's
   * lazy route component), renders each with React into the page, and
   * publishes their HTML.
   */
  const page = {
    'index.html': `<!doctype html>
<html>
  <body>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
`,
    'main.tsx': `import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { Route } from './routes/page'

const rendered: Array<string> = []
const errors: Array<string> = []
const report = (error: unknown) => {
  errors.push(error instanceof Error ? error.message : String(error))
}
for (const option of ['component', 'errorComponent'] as const) {
  const component = (Route.options as Record<string, any>)[option]
  if (!component) {
    continue
  }
  await component.preload?.()
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container, {
    onCaughtError: report,
    onUncaughtError: report,
    onRecoverableError: report,
  })
  flushSync(() => root.render(createElement(component)))
  rendered.push(container.innerHTML)
}
;(window as any).__rendered = { rendered, errors }
`,
  }

  /**
   * Opens the page and returns the HTML it rendered, or throws with what
   * the page reported when it could not render (e.g. a module failing to
   * link).
   */
  async function renderInPage(server: DevServer): Promise<Array<string>> {
    const opened = await openPage(server.url!, {
      registerCleanup: onTestFinished,
    })
    try {
      return await renderedBy(opened)
    } finally {
      await opened.close()
    }
  }

  /** What the page rendered, once it did (see `renderInPage`). */
  async function renderedBy(opened: BrowserPage): Promise<Array<string>> {
    const deadline = Date.now() + 15_000
    for (;;) {
      // (A page opened after an edit loads twice: Vite's server keeps the
      // edit's full reload for the next page that connects. Both loads get
      // the modules as the server compiled them.)
      const result = (await opened.page
        .evaluate(() => (window as any).__rendered)
        .catch(() => undefined)) as
        | { rendered: Array<string>; errors: Array<string> }
        | undefined
      const errors = [...opened.errors, ...(result?.errors ?? [])]
      if (result && errors.length === 0) {
        return result.rendered
      }
      if (errors.length > 0 || Date.now() > deadline) {
        throw new Error(
          `the page did not render the route:\n${errors.join('\n') || '(no error)'}\nconsole:\n${opened.console.join('\n')}`,
        )
      }
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
  }

  /**
   * Serves `before` as `routes/page.tsx`, loads the route's modules as a
   * page does, edits the route to `after`, requests the modules the page had
   * loaded again in the order `reorder` gives (a page re-requests the
   * modules the edit invalidated; unbundled Vite dev fetches them in
   * parallel, in no fixed order, and keeps each result until the next
   * edit), then opens a page loading the route from the dev server as it
   * is now (the current route module and whatever it imports) and renders
   * its components there.
   */
  async function editOutOfOrder(
    reorder: (urls: Array<string>) => Array<string>,
    before: string,
    after: string,
  ) {
    const server = await routerDevServer({
      browser: true,
      config: {
        optimizeDeps: {
          include: [
            'react',
            'react/jsx-dev-runtime',
            'react-dom',
            'react-dom/client',
            '@tanstack/react-router',
          ],
        },
      },
      files: { ...page, 'routes/page.tsx': before },
    })
    // A page loads the route first, then leaves (the edit's own update
    // must not reach a page: the test orders the requests).
    await renderInPage(server)
    const urls = await loadRouteModules(server)
    expect(urls.length).toBeGreaterThan(1)
    await server.edit({ 'routes/page.tsx': after })
    for (const url of reorder(urls)) {
      await server.transform(url)
    }
    return renderInPage(server)
  }

  /** The route module after the other modules the page had loaded. */
  const routeModuleLast = (urls: Array<string>) => [...urls.slice(1), route]

  /**
   * A route whose split `component` and `errorComponent` render the cards
   * `CardA` and, with `cardB`, `CardB`, which counts its renders in module
   * state: the two chunks share it.
   */
  const cards = (cardB: boolean) => `${head}function CardA() { return <b>A</b> }
${cardB ? 'let renders = 0\nfunction CardB() { renders++; return <i>{"B" + renders}</i> }\n' : ''}export const Route = createFileRoute('/page')({
  component: () => <p><CardA />${cardB ? '<CardB />' : ''}</p>,
  errorComponent: () => <p><CardA />${cardB ? '<CardB />' : ''}</p>,
})
`

  // Controls for the pins below (same harness): requested in import order.
  test.each([
    {
      name: 'removing a component two split options render',
      before: cards(true),
      after: cards(false),
      expected: ['<p><b>A</b></p>', '<p><b>A</b></p>'],
    },
    {
      name: 'adding a component two split options render',
      before: cards(false),
      after: cards(true),
      expected: ['<p><b>A</b><i>B1</i></p>', '<p><b>A</b><i>B2</i></p>'],
    },
  ])(
    'a page loading the route module first renders the edited route after $name',
    async ({ before, after, expected }) => {
      expect(await editOutOfOrder((urls) => urls, before, after)).toEqual(
        expected,
      )
    },
    timeout,
  )

  // Bug: the route module's transform computes the bindings that go to the
  // shared module (`?tsr-shared=1`) and stores them by file; the shared and
  // split transforms read that stored set instead of deriving it from the
  // code they compile (router-code-splitter-plugin.ts `sharedBindingsMap`).
  // After an edit, the browser requests the invalidated modules again in no
  // fixed order (unbundled Vite dev fetches them in parallel), and Vite keeps
  // each result until the next edit.
  // Impact: a shared or split module requested before the route module
  // compiles the new source with the previous set: a removed binding is still
  // exported ("Export 'CardB' is not defined") and the page stays broken until
  // the next edit or a restart; an added one is copied into each chunk instead
  // of shared (two module states: each chunk's `CardB` counts its own
  // renders).
  // Source: gap DV8 (gaps/dev-hmr.md); #8504 code-splitter-plugin-pipeline
  // .test.ts ("a dev server compiling an edited route out of order").
  // Any fix passes: the page renders the edited route, with one module
  // state for what the split options share.
  test.fails.each([
    {
      name: 'removing a component two split options render',
      before: cards(true),
      after: cards(false),
      expected: ['<p><b>A</b></p>', '<p><b>A</b></p>'],
    },
    {
      name: 'adding a component two split options render',
      before: cards(false),
      after: cards(true),
      expected: ['<p><b>A</b><i>B1</i></p>', '<p><b>A</b><i>B2</i></p>'],
    },
  ])(
    'a page loading the modules of the route file before the route module renders the edited route after $name',
    async ({ before, after, expected }) => {
      expect(await editOutOfOrder(routeModuleLast, before, after)).toEqual(
        expected,
      )
    },
    timeout,
  )

  // The same race for an exported component a split component renders,
  // whose private helper the edit removes: main keeps the exported component
  // and its helpers in the route module, so nothing is stored for them.
  // An implementation that moves them to a module the chunk shares must not
  // reach the race. Source: the #8504 probe (hybrid shared modules; #8504
  // code-splitter-plugin-pipeline.test.ts, first row).
  test(
    'a page loading the modules of the route file before the route module renders the edited route after removing a helper of an exported component a split component renders',
    async () => {
      expect(
        await editOutOfOrder(
          routeModuleLast,
          `${head}const prefix = 'a'
const suffix = 'b'
export function Card() { return <b>{prefix}{suffix}</b> }
export const Route = createFileRoute('/page')({ component: () => <Card /> })
`,
          `${head}const prefix = 'a'
export function Card() { return <b>{prefix}</b> }
export const Route = createFileRoute('/page')({ component: () => <Card /> })
`,
        ),
      ).toEqual(['<b>a</b>'])
    },
    timeout,
  )
})
