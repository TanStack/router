/**
 * The apps and the edit scenario of the `<Hydrate>` dev-server tests,
 * shared by their Vite (`hydrate-dev.test.ts`) and Rsbuild
 * (`hydrate-dev-rsbuild.test.ts`) files: React and Solid Start apps whose
 * root renders the document, two boundaries hydrating on interaction
 * (`src/widgets.tsx`), and the edits of their children on an opened page
 * (`editLoadedChild`, `expectEditsReached`).
 */
import { expect } from 'vitest'
import { startServerEntryFiles } from '../dev-server'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'

/**
 * Modules only the children of one boundary import, each with a marker in
 * its code: which of them the page downloaded (not when their top-level
 * code runs, which is free: ruling "child-only module evaluation", SPEC G3).
 */
const childModules = Object.fromEntries(
  ['a', 'b'].map((name) => [
    `src/child-${name}.ts`,
    `export const probe = 'child-${name}-exclusive-marker'\n`,
  ]),
)

/** The files of a React Start app whose root renders the document. */
export const reactApp = {
  ...childModules,
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
/**
 * `src/widgets.tsx` of the edit rows: two boundaries hydrating on
 * interaction, each rendering a child (`<button data-child=name>` showing
 * `name label clicks`, counting its mounted instances in `__effects`) and
 * `children` after it; `label` is a local the children capture.
 */
export const reactWidgets = (
  children: string,
  label: string,
) => `import { Hydrate } from '@tanstack/react-start'
import { interaction } from '@tanstack/react-start/hydration'
import { probe as probeA } from './child-a'
import { probe as probeB } from './child-b'
import { useEffect, useState } from 'react'
function Child(props: { name: string; label: string; probe: string }) {
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
      <section><Hydrate when={interaction()}><Child name="a" label={label} probe={probeA} />${children}</Hydrate></section>
      <section><Hydrate when={interaction()}><Child name="b" label={label} probe={probeB} />${children}</Hydrate></section>
    </div>
  )
}
`

/**
 * The files of a Solid Start app whose root renders the document (with
 * Solid's hydration script), hydrated by Start's Solid client entry.
 */
export const solidApp = {
  ...childModules,
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
export const solidWidgets = (
  children: string,
  label: string,
) => `import { Hydrate } from '@tanstack/solid-start'
import { interaction } from '@tanstack/solid-start/hydration'
import { probe as probeA } from './child-a'
import { probe as probeB } from './child-b'
import { createSignal, onCleanup, onMount } from 'solid-js'
function Child(props: { name: string; label: string; probe: string }) {
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
      <section><Hydrate when={interaction()}><Child name="a" label={label} probe={probeA} />${children}</Hydrate></section>
      <section><Hydrate when={interaction()}><Child name="b" label={label} probe={probeB} />${children}</Hydrate></section>
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
export async function editLoadedChild(
  server: { edit: (files: Record<string, string>) => Promise<unknown> },
  browser: BrowserPage,
  widgets: (children: string, label: string) => string,
) {
  const { page } = browser
  /** The child-only modules the page requested by their own URL. */
  const childRequests = async () =>
    page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((url) => /child-[ab]\.ts(?:\?|$)/.test(url)),
    )
  // Inspect the scripts the browser actually requested, including opaque
  // Rsbuild chunk URLs. The test-side HTTP client reads their real response
  // bodies; it neither evaluates them nor requests them from the page.
  const inspected = new Map<string, string>()
  /** Whether the page downloaded the code of `src/child-<name>.ts`. */
  const downloaded = async (name: 'a' | 'b') => {
    const urls = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .filter((entry) =>
          ['script', 'link'].includes(
            (entry as PerformanceResourceTiming).initiatorType,
          ),
        )
        .map((entry) => entry.name),
    )
    await Promise.all(
      urls
        .filter((url) => !inspected.has(url))
        .map(async (url) => {
          const response = await page.request.get(url)
          inspected.set(url, await response.text())
        }),
    )
    return [...inspected.values()].some((body) =>
      body.includes(`child-${name}-exclusive-marker`),
    )
  }
  expect(await downloaded('a')).toBe(false)
  expect(await downloaded('b')).toBe(false)
  expect(await childRequests()).toEqual([])
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
  expect(await downloaded('b')).toBe(false)

  await server.edit({ 'src/widgets.tsx': widgets('<i>v2</i>', 'capture-v1') })
  await shows('a', 'v2')
  const childrenEdited = await step()
  if (childrenEdited.b === 'b capture-v1 0v1') {
    expect(await downloaded('b')).toBe(false)
    expect(
      (await childRequests()).filter((url) => /child-b\.ts(?:\?|$)/.test(url)),
    ).toEqual([])
  }

  await server.edit({ 'src/widgets.tsx': widgets('<i>v2</i>', 'capture-v2') })
  await shows('a', 'capture-v2')
  const captureEdited = await step()
  if (captureEdited.b === 'b capture-v1 0v1') {
    expect(await downloaded('b')).toBe(false)
    expect(
      (await childRequests()).filter((url) => /child-b\.ts(?:\?|$)/.test(url)),
    ).toEqual([])
  }

  await clickUntil('b', 'b capture-v2 1')
  const siblingOpened = await step()
  expect(await downloaded('b')).toBe(true)
  return { opened, childrenEdited, captureEdited, siblingOpened }
}

/**
 * What `editLoadedChild` must see: the loaded child `a` shows each edit (its
 * state may reset: a remount is allowed), and `b`, whose code had not
 * loaded, either still shows the server's HTML or (when the framework's hot
 * update remounts the edited module's components: Solid) the edited
 * version, never a mix of versions; once opened it shows the edited
 * version. The gauge counts currently mounted children (`effects`: `a`, and `b`
 * once it is mounted); it does not count cumulative mounts, and React reported no recoverable error.
 */
export function expectEditsReached(
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
