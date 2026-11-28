/**
 * `<Hydrate>` pages of a Solid Start app (`@tanstack/solid-start`) in a
 * real browser, run for each bundler by its own test file
 * (`hydrate-pages-solid.test.ts`: Vite with `vite-plugin-solid`,
 * `hydrate-pages-solid-rsbuild.test.ts`: Rsbuild with Solid's Babel
 * preset): Start's plugin builds the app (`hydrate-pages.ts`), the SSR build renders a page with Solid's
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
import { beforeAll, describe, expect, test } from 'vitest'
import {
  barrelRows,
  buildHydrationApp,
  deferredUntilFocus,
  hydrateBarrelFiles,
  hydrateBarrelFixtures,
  isomorphicServerWritePage,
  isomorphicServerWriteScript,
  loadedOnInteraction,
  updatesExpected,
  updatesScript,
} from './hydrate-pages'
import type { HydrateOptions, HydrationApp } from './hydrate-pages'
import type { StartBundler } from '../build-harness'

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
 * With `inRow`, the boundary is in a component of its own (`Row`), whose
 * children read the values from its reactive `props`.
 */
function updatesPage(split: string, inRow = false) {
  const boundary = (values: string) =>
    `<Hydrate when={interaction()} prefetch={async ({ preload }) => { await preload() }}${split}>
            <Item ${values} />
          </Hydrate>`
  return `import { Hydrate } from '@tanstack/solid-start'
import { interaction } from '@tanstack/solid-start/hydration'
import { For, createSignal, useContext } from 'solid-js'
import { Theme } from '../theme'
function Item(props: { name: string; count: number; tag: string; onPick: () => void }) {
  const theme = useContext(Theme)
  return <button data-item={props.name} onClick={() => props.onPick()}>{[props.name, props.count, theme(), props.tag].join('|')}</button>
}
${
  inRow
    ? `function Row(props: { name: string; count: number; tag: string; onPick: () => void }) {
  return (
    ${boundary('name={props.name} count={props.count} tag={props.tag} onPick={() => props.onPick()}')}
  )
}
`
    : ''
}export function Page() {
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
          ${
            inRow
              ? `<Row name={item} count={count()} tag={ref()} onPick={() => setPicked(item + ':' + count() + ':' + theme())} />`
              : boundary(
                  `name={item} count={count()} tag={ref()} onPick={() => setPicked(item + ':' + count() + ':' + theme())}`,
                )
          }
        )}
      </For>
    </Theme.Provider>
  )
}`
}

/**
 * A page whose boundary's children bind an element to a `let` of the
 * component (Solid's `ref={input}` assigns the element to `input`), which a
 * button outside the boundary reads.
 */
function letRefPage(split: string, ref = 'input') {
  return `${head}import { createSignal } from 'solid-js'
export function Page() {
  let input: HTMLInputElement | undefined
  const [read, setRead] = createSignal('none')
  return (
    <div>
      <button data-read onClick={() => setRead(input ? input.value : 'unset')}>read</button>
      <output>{read()}</output>
      <Hydrate when={interaction()}${split}><input ref={${ref}} value="typed" /><Counter label="child" /></Hydrate>
    </div>
  )
}`
}

/**
 * A page whose boundary's children read, in a click handler, a `let` of the
 * component that a `ref` outside the boundary binds to an element mounted
 * later (a `<Show>` opened by a click).
 */
function lateRefPage(split: string) {
  return `${head}import { Show, createSignal } from 'solid-js'
export function Page() {
  const [editing, setEditing] = createSignal(false)
  const [read, setRead] = createSignal('none')
  let field: HTMLInputElement | undefined
  return (
    <div>
      <Hydrate when={idle()}${split}><button data-read onClick={() => setRead(field ? field.value : 'missing')}>read</button><Counter label="child" /></Hydrate>
      <button data-edit onClick={() => setEditing(true)}>edit</button>
      <Show when={editing()}><input ref={field} value="draft" /></Show>
      <output>{read()}</output>
    </div>
  )
}`
}

/**
 * A page whose boundary's children use a Solid directive (`use:tip`, which
 * Solid's JSX transform turns into a call of `tip` where the JSX ends up),
 * declared at module level or in the component (`where`).
 */
function directivePage(where: 'module' | 'component') {
  const tip = `function tip(el: HTMLElement) {
  el.dataset.tip = '${where}'
}
`
  return `${head}${where === 'module' ? tip : ''}export function Page() {
  ${where === 'component' ? tip : ''}return <Hydrate when={idle()}><span use:tip><Counter label="child" /></span></Hydrate>
}`
}

/**
 * A page whose split children (`children`, before a counter) use `setup`, a
 * local of the component, only through a Solid directive or `ref`, inside a
 * visible error boundary (Solid's own: a free name in the children shows
 * there instead of a blank page). `nested` puts the children in a boundary
 * inside another. `iso(server, client)` writes an inline isomorphic fn
 * rendering one element per environment.
 */
function captureOnlyPage(setup: string, children: string, nested = false) {
  const inner = `<Hydrate when={idle()}>${children}<Counter label="child" /></Hydrate>`
  return `${head}import { ErrorBoundary } from 'solid-js'
import { createIsomorphicFn } from '@tanstack/solid-start'
export function Page() {
  ${setup}
  return <ErrorBoundary fallback={(error) => <p data-error>{String(error)}</p>}>${nested ? `<Hydrate when={idle()}><section>${inner}</section></Hydrate>` : inner}</ErrorBoundary>
}`
}
const iso = (server: string, client: string) =>
  `{createIsomorphicFn().server(() => ${server}).client(() => ${client})()}`
/** A directive or callback ref setting `data-painted` to `value`. */
const paint = (value: string) =>
  `(el: HTMLElement) => { el.dataset.painted = '${value}' }`

/**
 * Page script of `captureOnlyPage`: once the children hydrated (the counter
 * counts) or the error boundary shows, what the page shows: the error, the
 * `<b>`'s text and its `data-painted`.
 */
const readCaptureOnly = `const counter = () => root.querySelector('button[data-label="child"]')
const error = () => root.querySelector('[data-error]')
await waitFor(() => error() || counter())
await clickUntil(() => counter() ?? root, () => error() || counter().textContent === 'child:1')
const b = root.querySelector('b')
return { error: error()?.textContent ?? null, text: b?.textContent ?? null, painted: b?.dataset.painted ?? null }`

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
  updatesProps: updatesPage('', true),
  updatesPropsReference: updatesPage(' split={false}', true),
  letRef: letRefPage(''),
  letRefReference: letRefPage(' split={false}'),
  // the forms Solid's own JSX transform unwraps for `ref`
  letRefNonNull: letRefPage('', 'input!'),
  letRefCast: letRefPage('', 'input as HTMLInputElement'),
  letRefParens: letRefPage('', '(input)'),
  // A local of the component holding a function (a method read off an
  // object), called in the children directly and through client-only and
  // isomorphic fns kept in place (in a group, under a cast, nested, as a
  // tag): in the client's children it is a prop of the split component, and
  // no call may bind the props as its receiver.
  receivers: `${head}import { createClientOnlyFn, createIsomorphicFn } from '@tanstack/solid-start'
import { createSignal } from 'solid-js'
const input = {
  cb(this: unknown) {
    return this === undefined ? 'unbound' : 'bound'
  },
}
export function Page() {
  const cb = input.cb
  const [shown, setShown] = createSignal('none')
  return (
    <Hydrate when={idle()}>
      <button
        data-label="receivers"
        onClick={() =>
          setShown(
            [
              cb(),
              createClientOnlyFn(cb)(),
              createClientOnlyFn((cb))(),
              createClientOnlyFn(cb as any)(),
              createClientOnlyFn(createClientOnlyFn(cb))(),
              createIsomorphicFn().client(cb)(),
              createClientOnlyFn(cb)\`x\`,
            ].join(':'),
          )
        }
      >
        {shown()}
      </button>
    </Hydrate>
  )
}`,
  // A handler of several statements without semicolons, calling locals of
  // the component at each statement's start.
  statements: `${head}import { createSignal } from 'solid-js'
export function Page() {
  const [count, setCount] = createSignal(0)
  const [open, setOpen] = createSignal(false)
  return (
    <Hydrate when={idle()}>
      <button
        data-label="statements"
        onClick={() => {
          setCount(count() + 1)
          setOpen(true)
        }}
      >
        {'statements:' + (open() ? count() : 0)}
      </button>
    </Hydrate>
  )
}`,
  directiveModule: directivePage('module'),
  directiveComponent: directivePage('component'),
  // The Solid twin of the React row (hydrate-pages-react.ts).
  isomorphicServerWrite: isomorphicServerWritePage('solid'),
  lateRef: lateRefPage(''),
  lateRefReference: lateRefPage(' split={false}'),
  // Locals the split children use only through a directive or a ref
  // (`captureOnlyPage`). The server-only ones carry a canary the client
  // must not ship.
  directiveServerHalf: captureOnlyPage(
    `function paint(el: HTMLElement) { el.dataset.painted = 'server-directive-canary' }`,
    iso('<b use:paint>ok</b>', '<b>ok</b>'),
  ),
  directiveClientHalf: captureOnlyPage(
    `function paint(el: HTMLElement) { el.dataset.painted = 'client-directive-mark' }`,
    iso('<b>ok</b>', '<b use:paint>ok</b>'),
  ),
  refServerHalfNested: captureOnlyPage(
    `let paint = ${paint('server-ref-canary')}`,
    iso('<b ref={paint}>ok</b>', '<b>ok</b>'),
    true,
  ),
  refClientHalf: captureOnlyPage(
    `let paint = ${paint('client-ref-mark')}`,
    iso('<b>ok</b>', '<b ref={paint}>ok</b>'),
  ),
  refLetFunction: captureOnlyPage(
    `let paint = ${paint('ref')}`,
    '<b ref={paint}>ok</b>',
  ),
  refLetElement: captureOnlyPage(
    'let el: HTMLElement | undefined',
    '<b ref={el}>ok</b>',
  ),
  // A context declared in the page module itself.
}

/**
 * Page script: clicks every counter once (in document order, each after the
 * previous one updated) and returns the labels and counts the page shows.
 */
const clickEveryCounter = `const counters = () => [...root.querySelectorAll('button[data-label]')]
for (const label of counters().map((button) => button.dataset.label)) {
  const button = () => root.querySelector('button[data-label="' + label + '"]')
  await clickUntil(button, () => button().textContent === label + ':1')
}
return counters().map((button) => button.textContent)`

/**
 * Page script of `lateRefPage`: once the boundary hydrated (its counter
 * counts), mounts the input, then clicks the reader; returns what it read.
 */
const readLateRef = `const counter = () => root.querySelector('button[data-label="child"]')
await clickUntil(counter, () => counter().textContent === 'child:1')
root.querySelector('button[data-edit]').click()
await waitFor(() => root.querySelector('input'))
root.querySelector('button[data-read]').click()
await waitFor(() => root.querySelector('output').textContent !== 'none')
return root.querySelector('output').textContent`

/** The Solid page tests, on an app built with `bundler`. */
export function solidPageSuite(bundler: StartBundler) {
  let app: HydrationApp

  beforeAll(async () => {
    app = await buildHydrationApp({
      framework: 'solid',
      bundler,
      fixtures: { ...fixtures, ...hydrateBarrelFixtures('solid') },
      files: {
        'src/counter.tsx': counterFile,
        'src/theme.tsx': themeFile,
        ...hydrateBarrelFiles('solid'),
      },
    })
    return () => app.close()
  }, 60_000)

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
    expect({ clicked: page.result, consoleErrors: page.consoleErrors }).toEqual(
      {
        clicked: labels.map((label) => `${label}:1`),
        consoleErrors: [],
      },
    )
    return page
  }

  describe('boundaries hydrate the HTML the server rendered', () => {
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

    // On main, the click threw "… is not a function" and the second statement
    // never ran.
    test('a handler of statements without semicolons runs each of them', async () => {
      await expectChildrenHydrate('statements', ['statements'])
    })

    // Source: Astra review of the splicing design (Solid capture receiver:
    // the client-only fn's call rendered `props.cb()`).
    test('a captured function called in the children, directly and through client-only and isomorphic fns, gets no receiver', async () => {
      const page = await app.hydrate('receivers', {
        script: `const button = () => root.querySelector('button[data-label="receivers"]')
await clickUntil(button, () => button().textContent !== 'none')
return button().textContent`,
      })
      expect({
        shown: page.result,
        consoleErrors: page.consoleErrors,
      }).toEqual({
        shown: Array(7).fill('unbound').join(':'),
        consoleErrors: [],
      })
    })

    // Source: Astra review of #8817, round 3, hydrate B1 (main builds it).
    test('a write in the server implementation of an isomorphic fn in the children', async () => {
      const page = await app.hydrate('isomorphicServerWrite', {
        script: isomorphicServerWriteScript,
      })
      expect(page.serverHtml).toMatch(/<p[^>]*data-value[^>]*>1<\/p>/)
      expect({
        hydrated: page.result,
        consoleErrors: page.consoleErrors,
      }).toEqual({ hydrated: ['child:1', '1'], consoleErrors: [] })
    })

    test('children reading a let reassigned before the boundary show its latest value', async () => {
      await expectChildrenHydrate('latestLet', ['second'], {
        props: { active: true },
      })
    })

    // On main, the children throw "tip is not defined" when the boundary
    // hydrates, and stay the server's HTML.
    test.each([
      { where: 'module', fixture: 'directiveModule' },
      { where: 'component', fixture: 'directiveComponent' },
    ])(
      'split children run a directive declared in the $where',
      async ({ where, fixture }) => {
        const page = await app.hydrate(fixture, {
          script: `return root.querySelector('span').dataset.tip ?? 'none'`,
        })
        expect({
          tip: page.result,
          consoleErrors: page.consoleErrors,
        }).toEqual({ tip: where, consoleErrors: [] })
      },
    )
  })

  // Locals the children use only through a Solid directive or `ref`: the
  // placeholder passes those the client's children use, and only those.
  // Source: Astra review of #8817, round 4, hydrate B1 (head rendered
  // "paint is not defined" / "el is not defined" in the error boundary for
  // the server-half directive and the refs of a `let` nothing else reads,
  // and refused the nested server-half ref; main renders and builds them).
  describe('locals the children use only through a directive or a ref', () => {
    test.each([
      {
        fixture: 'directiveServerHalf',
        how: 'a directive in the server implementation of an isomorphic fn',
        painted: null,
      },
      {
        fixture: 'directiveClientHalf',
        how: 'a directive in the client implementation of an isomorphic fn',
        painted: 'client-directive-mark',
      },
      {
        fixture: 'refServerHalfNested',
        how: 'a ref in the server implementation of an isomorphic fn, under two boundaries',
        painted: null,
      },
      {
        fixture: 'refClientHalf',
        how: 'a ref in the client implementation of an isomorphic fn',
        painted: 'client-ref-mark',
      },
      {
        fixture: 'refLetFunction',
        how: 'a ref naming a let holding a function',
        painted: 'ref',
      },
      {
        fixture: 'refLetElement',
        how: 'a ref of a let nothing else reads',
        painted: null,
      },
    ] as const)('$how', async ({ fixture, painted }) => {
      for (const mode of ['hydrate', 'mount'] as const) {
        const page = await app.hydrate(fixture, {
          mode,
          script: readCaptureOnly,
        })
        expect({
          mode,
          shown: page.result,
          consoleErrors: page.consoleErrors,
        }).toEqual({
          mode,
          shown: { error: null, text: 'ok', painted },
          consoleErrors: [],
        })
      }
    })

    // What only the server's code uses stays out of the client; the same
    // local in the client implementation ships (the control).
    test.each([
      { canary: 'server-directive-canary', mark: 'client-directive-mark' },
      { canary: 'server-ref-canary', mark: 'client-ref-mark' },
    ])('the client ships no $canary', ({ canary, mark }) => {
      const shipped = (marker: string) => {
        const { eager, lazy } = app.build.client.locate(marker)
        return eager.length + lazy.length
      }
      expect({ canary: shipped(canary), mark: shipped(mark) > 0 }).toEqual({
        canary: 0,
        mark: true,
      })
    })
  })

  describe('which elements are boundaries, and when code loads', () => {
    // Control of the pin below: a named import's children load when the
    // boundary hydrates.
    test('a boundary loads its children when it hydrates', async () => {
      const page = await app.hydrate('gated', { script: loadedOnInteraction })
      expect(page.result).toEqual({ beforeClick: 0, loadedByClick: true })
      expect(page.consoleErrors).toEqual([])
    })

    // Goal (SPEC J5.1, J7.2): a
    // namespace member `<Start.Hydrate>` of `@tanstack/solid-start` is a
    // boundary like a named import. On main it is left unsplit (it hydrates:
    // "namespace-imported Start.Hydrate boundaries" above), so the click
    // loads nothing.
    test('a namespace-imported Start.Hydrate loads its children when it hydrates', async () => {
      const page = await app.hydrate('namespaceGated', {
        script: loadedOnInteraction,
      })
      expect(page.result).toEqual({ beforeClick: 0, loadedByClick: true })
      expect(page.consoleErrors).toEqual([])
    })

    // SPEC J5.1: recognition by binding follows the app's re-exports of the
    // Start `Hydrate` (`hydrateBarrelFiles`), as with a direct import.
    test.each(barrelRows)(
      'a Hydrate the app re-exports (%s) loads its children when it hydrates',
      async (name) => {
        const page = await app.hydrate(name, { script: loadedOnInteraction })
        expect({
          result: page.result,
          consoleErrors: page.consoleErrors,
        }).toEqual({
          result: { beforeClick: 0, loadedByClick: true },
          consoleErrors: [],
        })
      },
    )

    // The `#ui` barrel is another module in each environment.
    test('a barrel resolving to another module in each environment hydrates every boundary the server rendered', async () => {
      await expectChildrenHydrate('barrelPerEnv', ['child', 'after'])
    })

    // Not followed: a re-export under another name.
    test('a Hydrate re-exported under another name still defers hydration', async () => {
      const page = await app.hydrate('reexportRenamed', {
        script: deferredUntilFocus,
      })
      expect(page.result).toBe('child:0')
      expect(page.consoleErrors).toEqual([])
    })

    // Not analysed (SPEC 2.2): split or not, it keeps the server's HTML until
    // its strategy fires (a focus, not a click).
    test('a Hydrate destructured from the namespace still defers hydration', async () => {
      const page = await app.hydrate('destructured', {
        script: `const button = () => root.querySelector('button')
  button().click()
  await settled()
  const beforeFocus = button().textContent
  button().focus()
  await clickUntil(() => button(), () => button().textContent === 'child:1')
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
  // What the prefetch requested before any interaction (a prefetch still
  // loading is not in the resource timeline yet)
  const prefetched = await waitFor(() => requested().length > 0 && requested()).catch(() => [])
  const click = async (label) => {
    const before = requested().length
    await clickUntil(() => button(label), () => button(label).textContent === label + ':1')
    return requested().slice(before)
  }
  const other = await click('other')
  const child = await click('child')
  return { prefetched: prefetched.length > 0, other: other.length > 0, child }`,
      })
      expect(page.result).toEqual({
        prefetched: true,
        other: true,
        child: [],
      })
      expect(page.consoleErrors).toEqual([])
    })
  })

  // A boundary that appears after the app started shows its fallback until
  // its children load, then the children (J5.3: the client keeps the
  // fallback, however it is passed).
  describe('the fallback of a boundary mounted on the client', () => {
    test.each([
      { name: 'fallbackDirect', how: 'a direct fallback' },
      { name: 'fallbackSpread', how: 'a spread used once' },
      { name: 'fallbackModuleElement', how: 'a module-level element' },
    ])('$how shows, then the children', async ({ name }) => {
      const page = await app.hydrate(name, {
        mode: 'mount',
        script: `await waitFor(() => root.querySelector('button'))
  await clickUntil(() => root.querySelector('button'), () => root.querySelector('button').textContent === 'child:1')`,
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

  describe('the children under parent updates', () => {
    // The split children read the newest signals, context and callbacks
    // (never a frozen first read), before their boundary hydrates, after
    // their code loaded and after a reorder, in the boundary clicked. The
    // same page with `split={false}` is the reference (SPEC J5.8, J5.4).
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

    // The same through the reactive `props` of the component holding the
    // boundary (a Solid read of `props.count` must stay live, SPEC J5.8).
    test('split children follow the props of their component through updates and a reorder, like unsplit ones', async () => {
      const [split, reference] = await Promise.all([
        app.hydrate('updatesProps', { script: updatesScript }),
        app.hydrate('updatesPropsReference', { script: updatesScript }),
      ])
      for (const page of [split, reference]) {
        expect({
          result: page.result,
          consoleErrors: page.consoleErrors,
        }).toEqual({ result: updatesExpected, consoleErrors: [] })
      }
      expect(split.requested).not.toEqual([])
    })

    // On main, silently, the parent never sees the element (`input` stays
    // `undefined`): focusing or reading it does nothing.
    test('a ref in split children binds the let of their component', async () => {
      const script = `const counter = () => root.querySelector('button[data-label="child"]')
await clickUntil(counter, () => counter().textContent === 'child:1')
root.querySelector('button[data-read]').click()
await settled()
return root.querySelector('output').textContent`
      const [split, reference] = await Promise.all([
        app.hydrate('letRef', { script }),
        app.hydrate('letRefReference', { script }),
      ])
      expect(
        [split, reference].map((page) => ({
          read: page.result,
          consoleErrors: page.consoleErrors,
        })),
      ).toEqual([
        { read: 'typed', consoleErrors: [] },
        { read: 'typed', consoleErrors: [] },
      ])
    })

    // Control of the row below: unsplit, the handler reads the element.
    test('an unsplit handler reads an element a later ref outside the boundary binds', async () => {
      const page = await app.hydrate('lateRefReference', {
        script: readLateRef,
      })
      expect({
        read: page.result,
        consoleErrors: page.consoleErrors,
      }).toEqual({ read: 'draft', consoleErrors: [] })
    })

    // A Solid `ref={field}` outside the boundary assigns `field` too: the
    // split children read it through a getter, and see the element once it
    // mounts after the boundary rendered (`main` passes the value of then:
    // the handler read `undefined`). Source: Astra review of #8817, round 3,
    // hydrate B2.
    test('a split handler reads an element a later ref outside the boundary binds', async () => {
      const page = await app.hydrate('lateRef', { script: readLateRef })
      expect({
        read: page.result,
        consoleErrors: page.consoleErrors,
      }).toEqual({ read: 'draft', consoleErrors: [] })
    })

    // On main, silently, the parent's `let` stays `undefined`.
    test.each(['letRefNonNull', 'letRefCast', 'letRefParens'])(
      'a wrapped ref in split children binds the let of their component (%s)',
      async (fixture) => {
        const page = await app.hydrate(fixture, {
          script: `const counter = () => root.querySelector('button[data-label="child"]')
await clickUntil(counter, () => counter().textContent === 'child:1')
root.querySelector('button[data-read]').click()
await settled()
return root.querySelector('output').textContent`,
        })
        expect({
          read: page.result,
          consoleErrors: page.consoleErrors,
        }).toEqual({ read: 'typed', consoleErrors: [] })
      },
    )
  })
}
