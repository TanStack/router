/**
 * Known router plugin bugs that only show on a running dev server, after
 * edits, in a real browser page. Each pin asserts correct behaviour for a
 * bug on main and is marked .fails; remove .fails when the bug is fixed.
 * Each pin has a control test that runs the same harness on a case that
 * works. The in-process ones: ../known-bugs-dev-server.test.ts.
 */
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { routeHead } from '../build-harness'
import { routerDevServer } from '../dev-server'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'

const timeout = 60_000

describe('a dev server compiling an edited route out of order', () => {
  /**
   * The page: it imports the route module from the dev server, like an app
   * (the browser requests the route module and what it imports, getting
   * what the dev server compiled last), then (`renderRoute()`, at once
   * unless the page's URL has `?later`) loads its `component` and, when the
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

async function renderRoute() {
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
}
;(window as any).__renderRoute = renderRoute
;(window as any).__routeLoaded = true
if (!location.search.includes('later')) {
  await renderRoute()
}
`,
  }

  /**
   * Opens the page and returns the HTML it rendered, or throws with what
   * the page reported when it could not render (e.g. a module failing to
   * link).
   */
  async function renderInPage(server: DevServer) {
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
  async function renderedBy(
    opened: BrowserPage,
  ): Promise<{ rendered: Array<string> }> {
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
        return { rendered: result.rendered }
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
   * Serves `before` as `routes/page.tsx` to a page whose dev server HMR
   * client cannot connect (the WebSocket fails, as behind a proxy that
   * drops it: the page gets no update of the edit), which imports the route
   * module only. Edits the route to `after`. With `lazyFirst`, that page
   * then loads the route's split options (`renderRoute()`: what a page
   * does when it first renders the route, e.g. on navigation): the browser
   * requests the split modules, and what they import, before anything
   * requested the edited route module, and the dev server keeps each
   * result until the next edit. Without it (the control), the page reloads
   * first, which requests the route module before the rest. Then a fresh
   * page loads the route from the dev server as it is now (the current
   * route module and whatever it imports) and renders its components.
   */
  async function editOutOfOrder(
    lazyFirst: boolean,
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
    const stale = await openPage('about:blank', {
      registerCleanup: onTestFinished,
    })
    await stale.page.context().routeWebSocket(/./, (ws) => ws.close())
    await stale.page.goto(new URL('/?later', server.url).href)
    await stale.page.waitForFunction(() => (window as any).__routeLoaded)
    await server.edit({ 'routes/page.tsx': after })
    if (!lazyFirst) {
      await stale.page.reload()
      await stale.page.waitForFunction(() => (window as any).__routeLoaded)
    }
    // (What this page renders is the old route module's, and a stale
    // module it asks for may fail as a stale request does: not judged)
    await stale.page
      .evaluate(() => (window as any).__renderRoute())
      .catch(() => undefined)
    await stale.close()
    return (await renderInPage(server)).rendered
  }

  /**
   * A route whose split `component` and `errorComponent` render the cards
   * `CardA` and, with `cardB`, `CardB`, which counts its renders in module
   * state: the two chunks share it.
   */
  const cards = (
    cardB: boolean,
  ) => `${routeHead()}function CardA() { return <b>A</b> }
${cardB ? 'let renders = 0\nfunction CardB() { renders++; return <i>{"B" + renders}</i> }\n' : ''}export const Route = createFileRoute('/page')({
  component: () => <p><CardA />${cardB ? '<CardB />' : ''}</p>,
  errorComponent: () => <p><CardA />${cardB ? '<CardB />' : ''}</p>,
})
`

  // Controls for the pins below (same harness): the route module requested
  // first after the edit.
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
      expect(await editOutOfOrder(false, before, after)).toEqual(expected)
    },
    timeout,
  )

  // Bug: the route module's transform computes the bindings that go to the
  // shared module (`?tsr-shared=1`) and stores them by file; the shared and
  // split transforms read that stored set instead of deriving it from the
  // code they compile (router-code-splitter-plugin.ts `sharedBindingsMap`).
  // After an edit, a page can request the split modules before the route
  // module: here a page whose HMR client cannot connect (so no update
  // re-imports the route module) renders the route for the first time after
  // the edit, which loads its split options; Vite keeps each result until
  // the next edit, so every later page gets them. (With a connected HMR
  // client, the update re-imports the route module first: a real page with
  // route HMR and React Refresh did not reach the state in 12 tries.)
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
      expect(await editOutOfOrder(true, before, after)).toEqual(expected)
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
          true,
          `${routeHead()}const prefix = 'a'
const suffix = 'b'
export function Card() { return <b>{prefix}{suffix}</b> }
export const Route = createFileRoute('/page')({ component: () => <Card /> })
`,
          `${routeHead()}const prefix = 'a'
export function Card() { return <b>{prefix}</b> }
export const Route = createFileRoute('/page')({ component: () => <Card /> })
`,
        ),
      ).toEqual(['<b>a</b>'])
    },
    timeout,
  )
})
