/**
 * `<Hydrate>` pages of a Solid Start app (`@tanstack/solid-start`) in a
 * real browser: Start's Vite plugin with `vite-plugin-solid` builds the
 * app (`hydrate-pages.ts`), the SSR build renders a page with Solid's
 * `renderToString`, and a page of headless Chromium runs Solid's hydration
 * script and `hydrate` over that HTML with the client build. Each child is
 * exercised (a click must update its signal); a hydration mismatch throws
 * (failing the run) or logs. The Solid twin of the React page tests
 * (`hydrate-pages-react.ts`) for what a compiler can get wrong per
 * framework: the identities of the boundaries (SPEC J5.4), the boundaries
 * it recognises (J5.1), the client-mount fallback (J5.3), `prefetch`
 * (J5.2) and the children under parent updates (J5.8: a Solid read must
 * not be frozen).
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  buildHydrationApp,
  loadedOnInteraction,
  updatesExpected,
  updatesScript,
} from './hydrate-pages'
import type { HydrateOptions, HydrationApp } from './hydrate-pages'

/** A counter: `<label>:<clicks>`; clicking it counts. */
const counterFile = `import { createSignal } from 'solid-js'
export function Counter(props: { label: string }) {
  const [clicks, setClicks] = createSignal(0)
  return <button data-label={props.label} onClick={() => setClicks(clicks() + 1)}>{props.label + ':' + clicks()}</button>
}
`

/** A context of the app, declared in its own module. */
const themeFile = `import { createContext } from 'solid-js'
export const Theme = createContext<() => string>(() => 'no-provider')
`

const head = `import { Hydrate } from '@tanstack/solid-start'
import { idle, interaction, visible } from '@tanstack/solid-start/hydration'
import { Counter } from '../counter'
`

/**
 * The parent-update page of `updatesScript` (see `hydrate-pages-react.ts`
 * `updatesPage`) in Solid: signals, a context holding an accessor, `<For>`.
 */
function updatesPage(split: string) {
  return `import { Hydrate } from '@tanstack/solid-start'
import { interaction } from '@tanstack/solid-start/hydration'
import { For, createSignal, useContext } from 'solid-js'
import { Theme } from '../theme'
function Item(props: { name: string; count: number; tag: string; onPick: () => void }) {
  const theme = useContext(Theme)
  return <button data-item={props.name} onClick={() => props.onPick()}>{[props.name, props.count, theme(), props.tag].join('|')}</button>
}
export function Page() {
  const [count, setCount] = createSignal(0)
  const [theme, setTheme] = createSignal('light')
  const [items, setItems] = createSignal(['a', 'b'])
  const [picked, setPicked] = createSignal('none')
  const ref = () => 'r' + count()
  return (
    <Theme.Provider value={theme}>
      <button data-label="inc" onClick={() => setCount(count() + 1)}>inc</button>
      <button data-label="theme" onClick={() => setTheme(theme() === 'light' ? 'dark' : 'light')}>theme</button>
      <button data-label="reverse" onClick={() => setItems([...items()].reverse())}>reverse</button>
      <output>{picked()}</output>
      <For each={items()}>
        {(item) => (
          <Hydrate when={interaction()} prefetch={async ({ preload }) => { await preload() }}${split}>
            <Item name={item} count={count()} tag={ref()} onPick={() => setPicked(item + ':' + count() + ':' + theme())} />
          </Hydrate>
        )}
      </For>
    </Theme.Provider>
  )
}`
}

/**
 * A page rendering `boundary` once the app hydrated (`useHydrated` of the
 * real router), like a boundary that appears after the app started (e.g.
 * after a client-side navigation): Solid's `Hydrate` then renders its
 * fallback until its children load. (Mounted with the app instead, it
 * treats the mount as the initial hydration and keeps the server's HTML,
 * which a mounted page has not.) `setup` comes before the component.
 */
function afterHydration(setup: string, boundary: string) {
  return `${head}import { Show } from 'solid-js'
import { useHydrated } from '@tanstack/solid-router'
${setup}export function Page() {
  const hydrated = useHydrated()
  return <Show when={hydrated()}>${boundary}</Show>
}`
}

const fixtures: Record<string, string> = {
  nested: `${head}export function Page() {
  return (
    <>
      <Hydrate when={visible()}>
        <Counter label="outer" />
        <Hydrate when={interaction()}>
          <Counter label="nested" />
        </Hydrate>
      </Hydrate>
      <Hydrate when={idle()}>
        <Counter label="sibling" />
      </Hydrate>
    </>
  )
}`,
  repeated: `${head}import { For } from 'solid-js'
export function Page(props: { items: Array<string> }) {
  return <ul><For each={props.items}>{(item) => <li><Hydrate when={idle()}><Counter label={item} /></Hydrate></li>}</For></ul>
}`,
  conditionals: `${head}import { Show } from 'solid-js'
export function Page(props: { flag: boolean; items: Array<string> }) {
  return <div>
    <Show when={props.flag} fallback={<Hydrate when={idle()}><Counter label="no" /></Hydrate>}><Hydrate when={idle()}><Counter label="yes" /></Hydrate></Show>
    {props.flag && <Hydrate when={idle()}><Counter label="and" /></Hydrate>}
    {props.items.map((item) => <Hydrate when={idle()}><Counter label={'arrow' + item} /></Hydrate>)}
  </div>
}`,
  renamed: `import { Hydrate as HW } from '@tanstack/solid-start'
import { interaction } from '@tanstack/solid-start/hydration'
import { Counter } from '../counter'
export function Page() {
  return <HW when={interaction()}><Counter label="search" /></HW>
}`,
  namespace: `import * as Start from '@tanstack/solid-start'
import { idle } from '@tanstack/solid-start/hydration'
import { Counter } from '../counter'
export function Page() {
  return <div><Start.Hydrate when={idle()}><Counter label="namespace" /></Start.Hydrate><Start.Hydrate when={idle()}><Counter label="second" /></Start.Hydrate></div>
}`,
  namespaceGated: `import * as Start from '@tanstack/solid-start'
import { interaction } from '@tanstack/solid-start/hydration'
import { Counter } from '../counter'
export function Page() {
  return <Start.Hydrate when={interaction()}><Counter label="child" /></Start.Hydrate>
}`,
  gated: `${head}export function Page() {
  return <Hydrate when={interaction()}><Counter label="child" /></Hydrate>
}`,
  destructured: `import * as Start from '@tanstack/solid-start'
import { interaction } from '@tanstack/solid-start/hydration'
import { Counter } from '../counter'
const { Hydrate } = Start
export function Page() {
  return <Hydrate when={interaction({ events: 'focusin' })}><Counter label="child" /></Hydrate>
}`,
  splitFalse: `${head}export function Page() {
  return <div><Hydrate when={idle()}><section><Hydrate when={idle()} split={false}><Counter label="inline" /></Hydrate></section></Hydrate><Hydrate when={idle()}><Counter label="second" /></Hydrate></div>
}`,
  dynamicSplit: `${head}export function Page(props: { flag: boolean }) {
  return <div><Hydrate when={idle()} split={props.flag}><Counter label="dynamic" /></Hydrate><Hydrate when={idle()}><Counter label="after" /></Hydrate></div>
}`,
  latestLet: `${head}export function Page(props: { active: boolean }) {
  let label = 'first'
  if (props.active) {
    label = 'second'
  }
  return <Hydrate when={idle()}><Counter label={label} /></Hydrate>
}`,
  prefetch: `${head}export function Page() {
  return <div><Hydrate when={interaction()}><Counter label="other" /></Hydrate><Hydrate when={interaction()} prefetch={idle({ timeout: 100 })}><Counter label="child" /></Hydrate></div>
}`,
  fallbackDirect: afterHydration(
    '',
    `<Hydrate when={visible()} fallback={<p>fallback-marker</p>}><Counter label="child" /></Hydrate>`,
  ),
  fallbackSpread: afterHydration(
    `const props = { when: visible(), fallback: <p>fallback-marker</p> }\n`,
    `<Hydrate {...props}><Counter label="child" /></Hydrate>`,
  ),
  fallbackModuleElement: afterHydration(
    `const fallback = <p>fallback-marker</p>\n`,
    `<Hydrate when={visible()} fallback={fallback}><Counter label="child" /></Hydrate>`,
  ),
  updates: updatesPage(''),
  updatesReference: updatesPage(' split={false}'),
  // A context declared in the page module itself.
  localContext: `import { Hydrate } from '@tanstack/solid-start'
import { idle } from '@tanstack/solid-start/hydration'
import { createContext, useContext } from 'solid-js'
const Theme = createContext('no-provider')
function Label() {
  return <span data-theme>{useContext(Theme)}</span>
}
export function Page() {
  return <Theme.Provider value="dark"><Hydrate when={idle()}><Label /></Hydrate></Theme.Provider>
}`,
}

let app: HydrationApp
const cleanups: Array<() => Promise<void>> = []

beforeAll(async () => {
  app = await buildHydrationApp({
    framework: 'solid',
    fixtures,
    files: { 'src/counter.tsx': counterFile, 'src/theme.tsx': themeFile },
    registerCleanup: (cleanup) => cleanups.push(cleanup),
  })
}, 60_000)

afterAll(async () => {
  await Promise.all(cleanups.map((cleanup) => cleanup()))
})

/**
 * Page script: clicks every counter once (in document order, each after the
 * previous one updated) and returns the labels and counts the page shows.
 */
const clickEveryCounter = `const counters = () => [...root.querySelectorAll('button[data-label]')]
for (const label of counters().map((button) => button.dataset.label)) {
  const button = () => root.querySelector('button[data-label="' + label + '"]')
  await waitFor(async () => {
    button().click()
    await settled(50)
    return button().textContent === label + ':1'
  })
}
return counters().map((button) => button.textContent)`

/** Hydrates fixture `name`; every child counts one click; no error. */
async function expectChildrenHydrate(
  name: string,
  labels: Array<string>,
  options: HydrateOptions = {},
) {
  const page = await app.hydrate(name, {
    script: clickEveryCounter,
    ...options,
  })
  for (const label of labels) {
    expect(page.serverHtml).toContain(`>${label}:0<`)
  }
  expect({ clicked: page.result, consoleErrors: page.consoleErrors }).toEqual({
    clicked: labels.map((label) => `${label}:1`),
    consoleErrors: [],
  })
  return page
}

describe.concurrent('boundaries hydrate the HTML the server rendered', () => {
  test('a nested boundary and a later sibling', async () => {
    await expectChildrenHydrate('nested', ['outer', 'nested', 'sibling'])
  })

  test('repeated instances of one boundary each hydrate their own children', async () => {
    const page = await expectChildrenHydrate('repeated', ['a', 'b', 'c'], {
      props: { items: ['a', 'b', 'c'] },
    })
    expect(page.requested).not.toEqual([])
  })

  test.each([
    { props: { flag: true, items: ['x'] }, labels: ['yes', 'and', 'arrowx'] },
    { props: { flag: false, items: ['x'] }, labels: ['no', 'arrowx'] },
  ])(
    'boundaries in conditionals and callbacks: $props.flag',
    async ({ props, labels }) => {
      await expectChildrenHydrate('conditionals', labels, { props })
    },
  )

  test('a renamed import of Hydrate', async () => {
    await expectChildrenHydrate('renamed', ['search'])
  })

  test('namespace-imported Start.Hydrate boundaries', async () => {
    await expectChildrenHydrate('namespace', ['namespace', 'second'])
  })

  test('a split={false} boundary nested in another, and a later boundary', async () => {
    await expectChildrenHydrate('splitFalse', ['inline', 'second'])
  })

  test.each([true, false])(
    'a dynamic split={flag} (%s) and a later boundary',
    async (flag) => {
      await expectChildrenHydrate('dynamicSplit', ['dynamic', 'after'], {
        props: { flag },
      })
    },
  )

  test('children reading a let reassigned before the boundary show its latest value', async () => {
    await expectChildrenHydrate('latestLet', ['second'], {
      props: { active: true },
    })
  })
})

describe.concurrent(
  'which elements are boundaries, and when code loads',
  () => {
    // Control of the pin below: a named import's children load when the
    // boundary hydrates.
    test('a boundary loads its children when it hydrates', async () => {
      const page = await app.hydrate('gated', { script: loadedOnInteraction })
      expect(page.result).toEqual({ beforeClick: 0, loadedByClick: true })
      expect(page.consoleErrors).toEqual([])
    })

    // Goal (DECISIONS 2026-10-18 "namespace imports"; SPEC J5.1): a
    // namespace member `<Start.Hydrate>` of `@tanstack/solid-start` is a
    // boundary like a named import. On main it is left unsplit (it hydrates:
    // "namespace-imported Start.Hydrate boundaries" above), so the click
    // loads nothing.
    // Source: FIX-PLAN §D "Namespace <Hydrate>" (Solid row)
    test.fails(
      'a namespace-imported Start.Hydrate loads its children when it hydrates',
      async () => {
        const page = await app.hydrate('namespaceGated', {
          script: loadedOnInteraction,
        })
        expect(page.result).toEqual({ beforeClick: 0, loadedByClick: true })
        expect(page.consoleErrors).toEqual([])
      },
    )

    // Not analysed (SPEC 2.2): split or not, it keeps the server's HTML until
    // its strategy fires (a focus, not a click).
    test('a Hydrate destructured from the namespace still defers hydration', async () => {
      const page = await app.hydrate('destructured', {
        script: `const button = () => root.querySelector('button')
button().click()
await settled()
const beforeFocus = button().textContent
button().focus()
await waitFor(async () => { button().click(); await settled(50); return button().textContent === 'child:1' })
return beforeFocus`,
      })
      expect(page.result).toBe('child:0')
      expect(page.consoleErrors).toEqual([])
    })

    // The prefetched boundary's children load before any interaction; the
    // other boundary's on its click; the prefetched one's click loads
    // nothing more.
    test('a prefetched boundary loads its own children before any interaction', async () => {
      const page = await app.hydrate('prefetch', {
        script: `const button = (label) => root.querySelector('button[data-label="' + label + '"]')
const prefetched = requested()
const click = async (label) => {
  const before = requested().length
  await waitFor(async () => { button(label).click(); await settled(50); return button(label).textContent === label + ':1' })
  return requested().slice(before)
}
const other = await click('other')
const child = await click('child')
return { prefetched: prefetched.length > 0, other: other.length > 0, child }`,
      })
      expect(page.result).toEqual({ prefetched: true, other: true, child: [] })
      expect(page.consoleErrors).toEqual([])
    })
  },
)

// A boundary that appears after the app started shows its fallback until
// its children load, then the children (J5.3: the client keeps the
// fallback, however it is passed).
describe.concurrent('the fallback of a boundary mounted on the client', () => {
  test.each([
    { name: 'fallbackDirect', how: 'a direct fallback' },
    { name: 'fallbackSpread', how: 'a spread used once' },
    { name: 'fallbackModuleElement', how: 'a module-level element' },
  ])('$how shows, then the children', async ({ name }) => {
    const page = await app.hydrate(name, {
      mode: 'mount',
      script: `await waitFor(() => root.querySelector('button'))
await waitFor(async () => { root.querySelector('button').click(); await settled(50); return root.querySelector('button').textContent === 'child:1' })`,
    })
    const fallbackAt = page.snapshots.findIndex((html) =>
      html.includes('fallback-marker'),
    )
    expect(fallbackAt).toBeGreaterThanOrEqual(0)
    expect(page.snapshots.slice(0, fallbackAt).join()).not.toContain('child:')
    expect(page.html).not.toContain('fallback-marker')
    expect(page.html).toContain('child:1')
    expect(page.consoleErrors).toEqual([])
  })
})

describe.concurrent('the children under parent updates', () => {
  // The split children read the newest signals, context and callbacks
  // (never a frozen first read), before their boundary hydrates, after
  // their code loaded and after a reorder, in the boundary clicked. The
  // same page with `split={false}` is the reference.
  // Source: FIX-PLAN V2-19 (SPEC J5.8, J5.4)
  test('split children follow their parent through updates and a reorder, like unsplit ones', async () => {
    const [split, reference] = await Promise.all([
      app.hydrate('updates', { script: updatesScript }),
      app.hydrate('updatesReference', { script: updatesScript }),
    ])
    expect(reference.result).toEqual(updatesExpected)
    for (const page of [split, reference]) {
      expect({
        result: page.result,
        consoleErrors: page.consoleErrors,
      }).toEqual({ result: updatesExpected, consoleErrors: [] })
    }
    expect(split.requested).not.toEqual([])
  })

  // Bug: the chunk re-declares the module-level bindings its children use
  // instead of using the parent module's (`createContext` runs again
  // there), the Solid twin of known-bugs-hydrate.test.ts "client: the
  // children use the module-level context of the parent module".
  // Source: FIX-PLAN V2-19 probe (a context declared in the page module)
  // Impact: split children of a Solid page read another context than the
  // one their parent provides (here its default value).
  test.fails(
    'split children read a context declared in the page module',
    async () => {
      const page = await app.hydrate('localContext')
      expect(page.serverHtml).toContain('>dark<')
      expect(page.html).toContain('>dark<')
      expect(page.consoleErrors).toEqual([])
    },
  )
})
