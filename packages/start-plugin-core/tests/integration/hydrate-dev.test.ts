/**
 * `<Hydrate>` on Start's Vite dev server, seen from a real browser page: the
 * app is a Start app (Start's whole Vite plugin, its dev middleware
 * rendering the page with the app's server entry, `StartClient` hydrating
 * it), the page is headless Chromium with Vite's HMR client and React
 * Refresh (`@vitejs/plugin-react`) or Solid's (`vite-plugin-solid`), and
 * the edits are files written to disk, which Vite's watcher reports.
 *
 * - A loaded child hot-updates in place, and a sibling whose code had not
 *   loaded yet shows the edited version when it opens (FIX-PLAN V2-20,
 *   SPEC J5.2, G10), React and Solid.
 * - Route code splitting and `<Hydrate>` in one route module: the split
 *   route component's boundaries hydrate the server's HTML (splitter
 *   composition, FIX-PLAN HYD-04).
 *
 * The edit rows also run on Start's Rsbuild dev server: React Refresh from
 * `@rsbuild/plugin-react`, Solid's hot updates from `@rsbuild/plugin-solid`
 * (with `@rsbuild/plugin-babel`, configured like a Solid Start app,
 * `solidAppConfig`).
 */
import react from '@vitejs/plugin-react'
import solid from 'vite-plugin-solid'
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { describeHmr } from '@tanstack/compiler-test-utils/dev-server'
import { pluginReact } from '@rsbuild/plugin-react'
import { startDevServer, startServerEntryFiles } from '../dev-server'
import { startRsbuildStartDevServer } from '../rsbuild-dev-server'
import { solidAppConfig } from './hydrate-pages'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'

const timeout = 60_000

/** The files of a React Start app whose root renders the document. */
const reactApp = {
  ...startServerEntryFiles,
  'harness/client-entry.ts': `import { createElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
hydrateRoot(document, createElement(StartClient), {
  onRecoverableError: (error) => {
    ;((globalThis as any).__recoverable ??= []).push(String(error))
  },
})
`,
  'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
  'src/routes/__root.tsx': `import { HeadContent, Outlet, Scripts, createRootRoute, useHydrated } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Root })
function Root() {
  const hydrated = useHydrated()
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <div id="app"><Outlet /></div>
        <span data-testid="hydrated">{hydrated ? 'hydrated' : 'hydrating'}</span>
        <Scripts />
      </body>
    </html>
  )
}
`,
  'src/counter.tsx': `import { useState } from 'react'
export function Counter(props: { label: string }) {
  const [clicks, setClicks] = useState(0)
  return <button data-label={props.label} onClick={() => setClicks(clicks + 1)}>{props.label + ':' + clicks}</button>
}
`,
}

/** Pre-bundled up front, as Vite does for an app that installed them. */
const reactOptimizeDeps = {
  include: [
    'react',
    'react/jsx-dev-runtime',
    'react-dom',
    'react-dom/client',
    '@tanstack/react-router',
    '@tanstack/react-router > @tanstack/router-core > seroval',
    '@tanstack/react-router > @tanstack/router-core > seroval-plugins/web',
  ],
}

/**
 * `src/widgets.tsx` of the edit rows: two boundaries hydrating on
 * interaction, each rendering a child (`<button data-child=name>` showing
 * `name label clicks`, counting its mounted instances in `__effects`) and
 * `children` after it; `label` is a local the children capture.
 */
const reactWidgets = (
  children: string,
  label: string,
) => `import { Hydrate } from '@tanstack/react-start'
import { interaction } from '@tanstack/react-start/hydration'
import { useEffect, useState } from 'react'
function Child(props: { name: string; label: string }) {
  const [clicks, setClicks] = useState(0)
  useEffect(() => {
    const page = globalThis as any
    page.__effects = (page.__effects ?? 0) + 1
    return () => {
      page.__effects -= 1
    }
  }, [])
  return <button data-child={props.name} onClick={() => setClicks(clicks + 1)}>{props.name + ' ' + props.label + ' ' + clicks}</button>
}
export function Widgets() {
  const label = '${label}'
  return (
    <div>
      <section><Hydrate when={interaction()}><Child name="a" label={label} />${children}</Hydrate></section>
      <section><Hydrate when={interaction()}><Child name="b" label={label} />${children}</Hydrate></section>
    </div>
  )
}
`

/**
 * The files of a Solid Start app whose root renders the document (with
 * Solid's hydration script), hydrated by Start's Solid client entry.
 */
const solidApp = {
  'harness/client-entry.ts': `import { createComponent, hydrate } from 'solid-js/web'
import { StartClient, hydrateStart } from '@tanstack/solid-start/client'
hydrateStart().then((router) => {
  hydrate(() => createComponent(StartClient, { router }), document)
})
`,
  'harness/server-entry.ts': `export { default } from '@tanstack/solid-start/server-entry'\n`,
  'src/router.ts': `import { createRouter } from '@tanstack/solid-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
  'src/routes/__root.tsx': `import { HeadContent, Outlet, Scripts, createRootRoute, useHydrated } from '@tanstack/solid-router'
import { HydrationScript } from 'solid-js/web'
export const Route = createRootRoute({ component: Root })
function Root() {
  const hydrated = useHydrated()
  return (
    <html>
      <head>
        <HydrationScript />
        <HeadContent />
      </head>
      <body>
        <div id="app"><Outlet /></div>
        <span data-testid="hydrated">{hydrated() ? 'hydrated' : 'hydrating'}</span>
        <Scripts />
      </body>
    </html>
  )
}
`,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/solid-router'
import { Widgets } from '../widgets'
export const Route = createFileRoute('/')({ component: Widgets })
`,
}

/** `reactWidgets` in Solid (a signal; mounted instances in `__effects`). */
const solidWidgets = (
  children: string,
  label: string,
) => `import { Hydrate } from '@tanstack/solid-start'
import { interaction } from '@tanstack/solid-start/hydration'
import { createSignal, onCleanup, onMount } from 'solid-js'
function Child(props: { name: string; label: string }) {
  const [clicks, setClicks] = createSignal(0)
  onMount(() => {
    const page = globalThis as any
    page.__effects = (page.__effects ?? 0) + 1
    onCleanup(() => {
      page.__effects -= 1
    })
  })
  return <button data-child={props.name} onClick={() => setClicks(clicks() + 1)}>{props.name + ' ' + props.label + ' ' + clicks()}</button>
}
export function Widgets() {
  const label = '${label}'
  return (
    <div>
      <section><Hydrate when={interaction()}><Child name="a" label={label} />${children}</Hydrate></section>
      <section><Hydrate when={interaction()}><Child name="b" label={label} />${children}</Hydrate></section>
    </div>
  )
}
`

/**
 * The edit scenario on an opened page: opens `a`, edits the children's JSX
 * (`v1` -> `v2`) then the captured `label`, opens `b`. `widgets(children,
 * label)` is the source of `src/widgets.tsx`. Returns what the sections of
 * `a` and `b` showed at each step, the mounted children (`effects`) and
 * React's recoverable errors.
 */
async function editLoadedChild(
  server: { edit: (files: Record<string, string>) => Promise<unknown> },
  browser: BrowserPage,
  widgets: (children: string, label: string) => string,
) {
  const { page } = browser
  /** The text of the section of child `name` (`''` while it has none). */
  const section = (name: string) =>
    page.evaluate(
      (selector) =>
        document.querySelector(selector)?.closest('section')?.textContent ?? '',
      `[data-child=${name}]`,
    )
  /**
   * What the page shows once both sections are rendered and unchanged for
   * 100 ms (a hot update that remounts the module's components, as Solid's
   * does, re-renders them one after the other).
   */
  const step = async () => {
    const read = async () => ({
      a: await section('a'),
      b: await section('b'),
      ...(await page.evaluate(() => ({
        effects: (globalThis as any).__effects ?? 0,
        recoverable: (globalThis as any).__recoverable ?? [],
      }))),
    })
    const deadline = Date.now() + 10_000
    let last = await read()
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      const next = await read()
      if (next.a && next.b && JSON.stringify(next) === JSON.stringify(last)) {
        return next as {
          a: string
          b: string
          effects: number
          recoverable: Array<string>
        }
      }
      if (Date.now() > deadline) {
        throw new Error(`the page did not settle: ${JSON.stringify(next)}`)
      }
      last = next
    }
  }
  /** Clicks child `name` until its section shows `expected`. */
  const clickUntil = async (name: string, expected: string) => {
    const deadline = Date.now() + 10_000
    while (!(await section(name)).includes(expected)) {
      if (Date.now() > deadline) {
        throw new Error(
          `${name} never showed ${expected}: ${await section(name)}`,
        )
      }
      await page.locator(`[data-child=${name}]`).click()
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  /** Waits until the section of `name` shows `expected`. */
  const shows = async (name: string, expected: string) => {
    const deadline = Date.now() + 10_000
    while (!(await section(name)).includes(expected)) {
      if (Date.now() > deadline) {
        throw new Error(
          `${name} never showed ${expected}: ${await section(name)}`,
        )
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
  await clickUntil('a', 'a capture-v1 1')
  const opened = await step()

  await server.edit({ 'src/widgets.tsx': widgets('<i>v2</i>', 'capture-v1') })
  await shows('a', 'v2')
  const childrenEdited = await step()

  await server.edit({ 'src/widgets.tsx': widgets('<i>v2</i>', 'capture-v2') })
  await shows('a', 'capture-v2')
  const captureEdited = await step()

  await clickUntil('b', 'b capture-v2 1')
  const siblingOpened = await step()
  return { opened, childrenEdited, captureEdited, siblingOpened }
}

/**
 * What `editLoadedChild` must see: the loaded child `a` shows each edit (its
 * state may reset: a remount is allowed), and `b`, whose code had not
 * loaded, either still shows the server's HTML or (when the framework's hot
 * update remounts the edited module's components: Solid) the edited
 * version, never a mix of versions; once opened it shows the edited
 * version. Every mounted child ran its effect once (`effects`: `a`, and `b`
 * once it is mounted), and React reported no recoverable error.
 */
function expectEditsReached(
  steps: Awaited<ReturnType<typeof editLoadedChild>>,
) {
  const serverB = 'b capture-v1 0v1'
  /** `b`'s text, as one of `accepted`; the children mounted then. */
  const mounted = (b: string, edited: string) => {
    expect([serverB, edited]).toContain(b)
    return b === serverB ? 1 : 2
  }
  const { opened, childrenEdited, captureEdited, siblingOpened } = steps
  expect(opened).toEqual({
    a: 'a capture-v1 1v1',
    b: serverB,
    effects: 1,
    recoverable: [],
  })
  expect(childrenEdited).toEqual({
    a: expect.stringMatching(/^a capture-v1 \dv2$/),
    b: childrenEdited.b,
    effects: mounted(childrenEdited.b, 'b capture-v1 0v2'),
    recoverable: [],
  })
  expect(captureEdited).toEqual({
    a: expect.stringMatching(/^a capture-v2 \dv2$/),
    b: captureEdited.b,
    effects: mounted(captureEdited.b, 'b capture-v2 0v2'),
    recoverable: [],
  })
  expect(siblingOpened).toEqual({
    a: expect.stringMatching(/^a capture-v2 \dv2$/),
    b: 'b capture-v2 1v2',
    effects: 2,
    recoverable: [],
  })
}

describe('Vite dev, React', () => {
  // Source: FIX-PLAN V2-20 (React half)
  test(
    'a loaded child hot-updates in place, and a sibling opened later shows the edited version',
    async () => {
      const server = await startDevServer({
        start: {},
        browser: true,
        config: { optimizeDeps: reactOptimizeDeps },
        plugins: [react()],
        files: {
          ...reactApp,
          'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { Widgets } from '../widgets'
export const Route = createFileRoute('/')({ component: Widgets })
`,
          'src/widgets.tsx': reactWidgets('<i>v1</i>', 'capture-v1'),
        },
      })
      const browser = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      await browser.waitForText('hydrated', {
        selector: '[data-testid=hydrated]',
      })
      await server.idle()
      expectEditsReached(await editLoadedChild(server, browser, reactWidgets))
      expect(browser.loads()).toBe(1)
      expect(
        describeHmr(
          server.hmr.filter(
            (message) =>
              message.environment === 'client' &&
              message.type === 'full-reload',
          ),
        ),
      ).toEqual([])
      expect(browser.errors).toEqual([])
    },
    timeout,
  )

  // The router splits the route component into its own module, which the
  // Hydrate plugin splits again: the page hydrates the server's HTML with
  // both, the deferred child loading its code on its interaction.
  // Source: FIX-PLAN HYD-04 "splitter composition" (W2-h-1 hand-over)
  test(
    'boundaries of a split route component hydrate the server HTML',
    async () => {
      const server = await startDevServer({
        start: {},
        browser: true,
        config: { optimizeDeps: reactOptimizeDeps },
        plugins: [react()],
        files: {
          ...reactApp,
          'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { Hydrate } from '@tanstack/react-start'
import { idle, interaction } from '@tanstack/react-start/hydration'
import { Counter } from '../counter'
export const Route = createFileRoute('/')({ component: Page })
function Page() {
  return (
    <main>
      <Counter label="route" />
      <Hydrate when={interaction()}><Counter label="deferred" /></Hydrate>
      <Hydrate when={idle()}><Counter label="idle" /></Hydrate>
    </main>
  )
}
`,
        },
      })
      const browser = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      await browser.waitForText('hydrated', {
        selector: '[data-testid=hydrated]',
      })
      expect(await browser.text('#app')).toBe('route:0deferred:0idle:0')
      /** How many resources the page requested so far. */
      const requested = () =>
        browser.page.evaluate(
          () => performance.getEntriesByType('resource').length,
        )
      /** Clicks the counter `label` until it counts. */
      const count = async (label: string) => {
        const deadline = Date.now() + 10_000
        while (!(await browser.text('#app')).includes(`${label}:1`)) {
          if (Date.now() > deadline) {
            throw new Error(
              `${label} never counted: ${await browser.text('#app')}`,
            )
          }
          await browser.page.locator(`[data-label=${label}]`).click()
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      }
      await count('route')
      await count('idle')
      await server.idle()
      // The deferred child's code loads when it hydrates.
      const beforeDeferred = await requested()
      await count('deferred')
      expect(await requested()).toBeGreaterThan(beforeDeferred)
      expect(await browser.text('#app')).toBe('route:1deferred:1idle:1')
      expect(
        await browser.page.evaluate(
          () => (globalThis as any).__recoverable ?? [],
        ),
      ).toEqual([])
      expect(browser.errors).toEqual([])
    },
    timeout,
  )
})

describe('Vite dev, Solid', () => {
  // A Solid boundary is served with the Solid packages, its chunk renders,
  // and an edit reaches it (the stand-in row deleted in wave 2, on the real
  // packages, with Solid's hot updates).
  // Source: FIX-PLAN V2-20 (Solid half); W2-h-2 hand-over (gaps H21/H22)
  test(
    'a loaded child hot-updates in place, and a sibling opened later shows the edited version',
    async () => {
      const server = await startDevServer({
        start: {},
        framework: 'solid',
        browser: true,
        plugins: [solid({ ssr: true })],
        files: {
          ...solidApp,
          'src/widgets.tsx': solidWidgets('<i>v1</i>', 'capture-v1'),
        },
      })
      const browser = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      await browser.waitForText('hydrated', {
        selector: '[data-testid=hydrated]',
      })
      await server.idle()
      expectEditsReached(await editLoadedChild(server, browser, solidWidgets))
      expect(browser.loads()).toBe(1)
      expect(browser.errors).toEqual([])
    },
    timeout,
  )
})

describe('Rsbuild dev', () => {
  // Source: FIX-PLAN V2-20 (Rsbuild, React)
  test(
    'React: a loaded child hot-updates in place, and a sibling opened later shows the edited version',
    async () => {
      const server = await startRsbuildStartDevServer({
        hmr: true,
        browser: true,
        // Start serves the pages, not an HTML template.
        config: { tools: { htmlPlugin: false }, plugins: [pluginReact()] },
        files: {
          ...reactApp,
          'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { Widgets } from '../widgets'
export const Route = createFileRoute('/')({ component: Widgets })
`,
          'src/widgets.tsx': reactWidgets('<i>v1</i>', 'capture-v1'),
        },
      })
      expect(server.errors).toEqual([])
      const browser = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      await browser.waitForText('hydrated', {
        selector: '[data-testid=hydrated]',
      })
      expectEditsReached(await editLoadedChild(server, browser, reactWidgets))
      expect(server.errors).toEqual([])
      expect(browser.loads()).toBe(1)
      expect(browser.errors).toEqual([])
    },
    timeout,
  )

  // Source: FIX-PLAN V2-20 (Rsbuild, Solid)
  test(
    'Solid: a loaded child hot-updates in place, and a sibling opened later shows the edited version',
    async () => {
      const server = await startRsbuildStartDevServer({
        framework: 'solid',
        hmr: true,
        browser: true,
        config: {
          ...solidAppConfig.rsbuildConfig,
          // Start serves the pages, not an HTML template.
          tools: { htmlPlugin: false },
        },
        files: {
          ...solidApp,
          'src/widgets.tsx': solidWidgets('<i>v1</i>', 'capture-v1'),
        },
      })
      expect(server.errors).toEqual([])
      const browser = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      await browser.waitForText('hydrated', {
        selector: '[data-testid=hydrated]',
      })
      expectEditsReached(await editLoadedChild(server, browser, solidWidgets))
      expect(server.errors).toEqual([])
      expect(browser.loads()).toBe(1)
      expect(browser.errors).toEqual([])
    },
    timeout,
  )
})
