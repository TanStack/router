/**
 * `<Hydrate>` pages of a React Start app in a real browser, run for each
 * bundler by its own test file (`hydrate-pages.test.ts`: Vite,
 * `hydrate-pages-rsbuild.test.ts`: Rsbuild): the SSR build renders the
 * page, a page of headless Chromium hydrates that HTML with the client
 * build (`hydrate-pages.ts`), and each child is exercised (a click must
 * update it). React's recoverable errors and hydration warnings
 * (development build) must stay empty. This is where the identities of the
 * boundaries are checked (SPEC J5.4): whatever ids the compiler assigns,
 * every boundary hydrates the HTML the server rendered and reaches the
 * children the server rendered in it. Also: `prefetch` (J5.2, J5.6), a
 * function `when` evaluated on the client only (J5.8), the fallback of a
 * boundary mounted after startup (J5.3), a server fn called from split
 * children (J4.13), which `Hydrate` elements are boundaries (J5.1), and
 * the children under parent updates (J5.8).
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  buildHydrationApp,
  loadedOnInteraction,
  updatesExpected,
  updatesScript,
} from './hydrate-pages'
import type { HydrateOptions, HydrationApp } from './hydrate-pages'
import type { StartBundler } from '../build-harness'
/** A counter: `<label>:<clicks>`; clicking it counts. */
const counterFile = `import { useState } from 'react'
export function Counter({ label }: { label: string }) {
  const [clicks, setClicks] = useState(0)
  return <button data-label={label} onClick={() => setClicks(clicks + 1)}>{label + ':' + clicks}</button>
}
`

const head = `import { Hydrate } from '@tanstack/react-start'
import { idle, interaction, load, visible } from '@tanstack/react-start/hydration'
import { Counter } from '../counter'
`

/** A context of the app, declared in its own module. */
const themeFile = `import { createContext } from 'react'
export const Theme = createContext('no-provider')
`

/**
 * A page whose two keyed boundaries render the same child, reading the
 * page's state through captures (`count`, a local named `ref`), a context
 * and a callback; the page changes them, and reverses the boundaries. The
 * `when` and `prefetch` props are new objects on every render. `split` is
 * added to each boundary (`split={false}`: the reference, which the
 * compiler leaves in place).
 */
function updatesPage(split: string) {
  return `import { Hydrate } from '@tanstack/react-start'
import { interaction } from '@tanstack/react-start/hydration'
import { useContext, useState } from 'react'
import { Theme } from '../theme'
function Item(props: { name: string; count: number; tag: string; onPick: () => void }) {
  const theme = useContext(Theme)
  return <button data-item={props.name} onClick={props.onPick}>{[props.name, props.count, theme, props.tag].join('|')}</button>
}
export function Page() {
  const [count, setCount] = useState(0)
  const [theme, setTheme] = useState('light')
  const [items, setItems] = useState(['a', 'b'])
  const [picked, setPicked] = useState('none')
  const ref = 'r' + count
  return (
    <Theme.Provider value={theme}>
      <button data-label="inc" onClick={() => setCount(count + 1)}>inc</button>
      <button data-label="theme" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>theme</button>
      <button data-label="reverse" onClick={() => setItems([...items].reverse())}>reverse</button>
      <output>{picked}</output>
      {items.map((item) => (
        <Hydrate key={item} when={interaction()} prefetch={async ({ preload }) => { await preload() }}${split}>
          <Item name={item} count={count} tag={ref} onPick={() => setPicked(item + ':' + count + ':' + theme)} />
        </Hydrate>
      ))}
    </Theme.Provider>
  )
}`
}

const fixtures: Record<string, string> = {
  // A boundary nested in a split boundary, behind a gate that never opens:
  // the outer boundary's split code is compiled again (Rsbuild loads it
  // from the module's source alone, by its own loader run) and splits the
  // nested boundary in turn, with this framework's packages: the outer
  // children hydrate, the nested ones keep the server's markup and stay
  // inert. (Solid: the "nested" row of hydrate-pages-solid.ts runs the same
  // path on Rsbuild.)
  // Source: hydrate-split-modules.test.ts "react chunks loaded from the
  // source code alone ..." (its Rsbuild path, which that test no longer
  // covers).
  nestedGates: `import { Hydrate } from '@tanstack/react-start'
import { load, never } from '@tanstack/react-start/hydration'
import { Counter } from '../counter'
export function Page() {
  return <Hydrate when={load()}><section><Counter label="outer" /><Hydrate when={never()}><Counter label="inner" /></Hydrate></section></Hydrate>
}`,
  // These are eleven literal boundaries in one
  // source module, rather than eleven instances of one mapped boundary.
  eleven: `${head}export function Page() {
    return <>${Array.from({ length: 11 }, (_, index) => `<Hydrate when={idle()}><Counter label="boundary-${index}" /></Hydrate>`).join('')}</>
  }`,
  // Edge spaces are visible inline content.
  edgeSpaces: `${head}export function Page() {
    return <><span data-spacing>A<Hydrate when={load()}> B </Hydrate>C</span><Hydrate when={load()}><Counter label="ready" /></Hydrate></>
  }`,
  // The options object is shared by a boundary
  // and an ordinary server/client render consumer.
  sharedFallback: `${head}const opts = { when: idle(), fallback: <b>wait</b> }
export function Page() {
    return <><Hydrate {...opts}><Counter label="child" /></Hydrate><aside>{opts.fallback}</aside></>
  }`,
  // A render-local hoisted function still
  // captures this render's values when the child runs in another module.
  hoistedRows: `${head}export function Page() {
    const rows = ['a', 'b']
    const suffix = '-row'
    return <Hydrate when={idle()}><ul>{rows.map(renderRow)}</ul></Hydrate>
    function renderRow(row: string) {
      return <li key={row}><Counter label={row + suffix} /></li>
    }
  }`,
  // Source: hydrate-boundary-forms.test.ts "a nested boundary and a later
  // sibling hydrate with the ids the server renders"
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
  // Repeated instances of one boundary: each hydrates its own children.
  repeated: `${head}export function Page({ items }: { items: Array<string> }) {
  return <ul>{items.map((item) => <li key={item}><Hydrate when={idle()}><Counter label={item} /></Hydrate></li>)}</ul>
}`,
  // Source: hydrate-split-modules.test.ts "boundaries in conditionals and
  // callbacks hydrate like the server renders them"
  conditionals: `${head}export function Page({ flag, items }: { flag: boolean; items: Array<string> }) {
  return <div>
    {flag ? <Hydrate when={idle()}><Counter label="yes" /></Hydrate> : <Hydrate when={idle()}><Counter label="no" /></Hydrate>}
    {flag && <Hydrate when={idle()}><Counter label="and" /></Hydrate>}
    {items.map(function (item, idx) { return <Hydrate when={idle()} key={idx}><Counter label={'fn' + item} /></Hydrate> })}
    {items.map((item) => <Hydrate when={idle()} key={item}><Counter label={'arrow' + item} /></Hydrate>)}
  </div>
}
export function Other({ early }: { early: boolean }) {
  if (early) { return <Hydrate when={idle()}><Counter label="early" /></Hydrate> }
  return <Hydrate when={idle()}><Counter label="late" /></Hydrate>
}`,
  // Boundaries in mutually exclusive branches at the same position, then
  // the page switches branches after it hydrated.
  switching: `${head}import { useState } from 'react'
export function Page() {
  const [flag, setFlag] = useState(true)
  return <div>
    <button data-label="switch" onClick={() => setFlag(!flag)}>switch</button>
    {flag ? <Hydrate when={idle()}><Counter label="yes" /></Hydrate> : <Hydrate when={idle()}><Counter label="no" /></Hydrate>}
    <Hydrate when={idle()}><Counter label="last" /></Hydrate>
  </div>
}`,
  // Source: hydrate-boundary-forms.test.ts "a renamed import of Hydrate is a
  // boundary"
  renamed: `import { Hydrate as HW } from '@tanstack/react-start'
import { interaction } from '@tanstack/react-start/hydration'
import { Counter } from '../counter'
export function Page() {
  return (
    <HW when={interaction()}>
      <Counter label="search" />
    </HW>
  )
}`,
  // Source: hydrate-boundary-forms.test.ts "a namespace-imported
  // <Start.Hydrate> hydrates like the server renders it"
  namespace: `import * as Start from '@tanstack/react-start'
import { idle } from '@tanstack/react-start/hydration'
import { Counter } from '../counter'
export function Page() {
  return <div><Start.Hydrate when={idle()}><Counter label="namespace" /></Start.Hydrate><Start.Hydrate when={idle()}><Counter label="second" /></Start.Hydrate></div>
}`,
  // Source: hydrate-split-modules.test.ts "a split={false} boundary nested in
  // another does not shift the ids of later boundaries"
  splitFalse: `${head}export function Page() {
  return <div><Hydrate when={idle()}><section><Hydrate when={idle()} split={false}><Counter label="inline" /></Hydrate></section></Hydrate><Hydrate when={idle()}><Counter label="second" /></Hydrate></div>
}`,
  // Source: hydrate-boundary-forms.test.ts "a dynamic split={flag} (%s)
  // still splits the children"
  dynamicSplit: `${head}export function Page({ flag }: { flag: boolean }) {
  return <div><Hydrate when={idle()} split={flag}><Counter label="dynamic" /></Hydrate><Hydrate when={idle()}><Counter label="after" /></Hydrate></div>
}`,
  // A let the component reassigns before the boundary renders: the
  // hydrated children read its latest value.
  latestLet: `${head}export function Page({ active }: { active: boolean }) {
  let label = 'first'
  if (active) {
    label = 'second'
  }
  return <Hydrate when={idle()}><Counter label={label} /></Hydrate>
}`,
}

/** `Page` with an `other` boundary and a `child` boundary written as `child`. */
const prefetchPage = (
  child: string,
  setup = '',
  app = '',
) => `${head}import type { HydrateOptions } from '@tanstack/react-start'
export function Page(props: any) {
  ${setup}return <div><Hydrate when={interaction()}><Counter label="other" /></Hydrate>${child}</div>
}
${app}`

// Source: hydrate-split-modules.test.ts "a boundary with $name preloads its
// own chunk" (hydrateWhen Basic fixture), with `interaction()` boundaries so
// that only `prefetch` loads code before a click.
const prefetchRows = {
  // Control: without prefetch, nothing loads before a click.
  prefetchNone: prefetchPage(
    `<Hydrate when={interaction()}><Counter label="child" /></Hydrate>`,
  ),
  prefetchDirect: prefetchPage(
    `<Hydrate when={interaction()} prefetch={idle({ timeout: 100 })}><Counter label="child" /></Hydrate>`,
  ),
  prefetchSpreadLiteral: prefetchPage(
    `<Hydrate {...{ when: interaction(), prefetch: idle() }}><Counter label="child" /></Hydrate>`,
  ),
  prefetchSpreadConst: prefetchPage(
    `<Hydrate {...opts}><Counter label="child" /></Hydrate>`,
    '',
    `const opts: HydrateOptions = { when: interaction(), prefetch: idle() }`,
  ),
  prefetchComputedKey: prefetchPage(
    `<Hydrate when={interaction()} {...{ [props.name]: idle() }}><Counter label="child" /></Hydrate>`,
    '',
    `export const App = () => <Page name="prefetch" />`,
  ),
  prefetchNestedSpread: prefetchPage(
    `<Hydrate {...{ ...props.rest }}><Counter label="child" /></Hydrate>`,
    '',
    `export const App = () => <Page rest={{ when: interaction(), prefetch: idle() }} />`,
  ),
  prefetchPropsSpread: prefetchPage(
    `<Hydrate {...props}><Counter label="child" /></Hydrate>`,
    '',
    `export const App = () => <Page when={interaction()} prefetch={idle()} />`,
  ),
  prefetchMemberSpread: prefetchPage(
    `<Hydrate {...props.options}><Counter label="child" /></Hydrate>`,
    '',
    `export const App = () => <Page options={{ when: interaction(), prefetch: idle() }} />`,
  ),
  prefetchReassigned: prefetchPage(
    `<Hydrate {...opts}><Counter label="child" /></Hydrate>`,
    `let opts: HydrateOptions = { when: interaction() }
  if (props.eager) {
    opts = { when: interaction(), prefetch: idle() }
  }
  `,
  ),
  // Source: hydrateWhen PrefetchState fixture
  prefetchState: `${head}import { useState } from 'react'
export function Page({ split }: { split: boolean }) {
  const [status, setStatus] = useState('idle')
  return (
    <section>
      <p data-status>{status}</p>
      <Hydrate
        when={interaction()}
        prefetch={async ({ preload }) => {
          await preload()
          setStatus('prefetched')
        }}
      >
        <Counter label="child" />
      </Hydrate>
    </section>
  )
}
export function Inline() {
  const [status, setStatus] = useState('idle')
  return (
    <section>
      <p data-status>{status}</p>
      <Hydrate
        when={interaction()}
        split={false}
        prefetch={async ({ preload }) => {
          await preload()
          setStatus('prefetched')
        }}
      >
        <Counter label="child" />
      </Hydrate>
    </section>
  )
}`,
}
// Source: hydrate-boundary-forms.test.ts "client: $name reaches the
// boundary" (hydrate-when-transform.test.ts fallback forms; hydrateWhen
// ObjectFallback and SplitFalse fixtures)
const fallbackForms = {
  fallback_direct: `${head}export function Page() {
  return <Hydrate when={visible()} fallback={<p>fallback-marker</p>}><Counter label="child" /></Hydrate>
}`,
  fallback_directSplitFalse: `${head}export function Page() {
  return <Hydrate when={visible()} split={false} fallback={<p>fallback-marker</p>}><Counter label="child" /></Hydrate>
}`,
  fallback_directWithOthers: `${head}export function Page() {
  return <Hydrate when={visible()} prefetch={() => {}} fallback={<p>fallback-marker</p>} onHydrated={() => {}}><Counter label="child" /></Hydrate>
}`,
  fallback_inlineSpread: `${head}export function Page() {
  return <Hydrate {...{ when: visible(), fallback: <p>fallback-marker</p> }}><Counter label="child" /></Hydrate>
}`,
  fallback_parenSpread: `${head}export function Page() {
  return <Hydrate {...({ when: visible(), fallback: <p>fallback-marker</p> })}><Counter label="child" /></Hydrate>
}`,
  fallback_spreadBefore: `${head}const props = { when: visible(), fallback: <p>fallback-marker</p> }
export function Page() {
  return <Hydrate {...props}><Counter label="child" /></Hydrate>
}`,
  fallback_spreadAfter: `${head}export function Page() {
  return <Hydrate {...props}><Counter label="child" /></Hydrate>
}
const props = { when: visible(), fallback: <p>fallback-marker</p> }`,
  fallback_parenSpreadConst: `${head}const props = ({ when: visible(), fallback: <p>fallback-marker</p> })
export function Page() {
  return <Hydrate {...(props)}><Counter label="child" /></Hydrate>
}`,
  fallback_moduleElement: `${head}const fallback = <p>fallback-marker</p>
export function Page() {
  return <Hydrate when={visible()} fallback={fallback}><Counter label="child" /></Hydrate>
}`,
  fallback_moduleElementSplitFalse: `${head}const fallback = <p>fallback-marker</p>
export function Page() {
  return <Hydrate when={visible()} split={false} fallback={fallback}><Counter label="child" /></Hydrate>
}`,
  fallback_computedKey: `${head}export function Page() {
  return <Hydrate {...{ when: visible(), ['fallback']: <p>fallback-marker</p> }}><Counter label="child" /></Hydrate>
}`,
  fallback_quotedKeys: `${head}export function Page() {
  return <Hydrate {...{ 'when': visible(), 'fallback': <p>fallback-marker</p> }}><Counter label="child" /></Hydrate>
}`,
  fallback_spreadSplitFalse: `${head}const props = { when: visible(), fallback: <p>fallback-marker</p> }
export function Page() {
  return <Hydrate split={false} {...props}><Counter label="child" /></Hydrate>
}`,
}

Object.assign(fixtures, fallbackForms, prefetchRows, {
  // Source: hydrate-boundary-forms.test.ts "a direct fallback next to
  // prefetch and onHydrated": both reach the client boundary.
  callbacks: `${head}export function Page() {
  return <Hydrate when={idle()} prefetch={() => { (globalThis as any).__prefetched = true }} onHydrated={() => { (globalThis as any).__hydrated = true }} fallback={<p>fallback-marker</p>}><Counter label="child" /></Hydrate>
}`,
  // Source: hydrate-boundary-forms.test.ts \`when\` table (interaction
  // with options): the boundary hydrates on the events written only.
  focusGate: `${head}export function Page() {
  return <Hydrate when={interaction({ events: 'focusin' })}><Counter label="child" /></Hydrate>
}`,
  // Source: hydrate-split-modules.test.ts "client: children may contain
  // return statements" (#8504, click handler and IIFE)
  returns: `${head}const letters = ['a', 'b']
export function Page() {
  return <Hydrate when={load()}><ul onClick={() => { (globalThis as any).__clicked = 'click'; return 'click' }}>{letters.map((letter) => { const upper = letter.toUpperCase(); return <li key={letter}>{upper}</li> })}{(function () { return 'iife' })()}</ul></Hydrate>
}`,
  // A function \`when\`: evaluated on the client only.
  whenFunction: `${head}export function Page() {
  return (
    <Hydrate
      when={() => {
        ;((globalThis as any).__whenCalls ??= []).push(typeof window)
        return idle()
      }}
    >
      <Counter label="dynamic" />
    </Hydrate>
  )
}`,
  // Source: hydrate-split-modules.test.ts "$name is called from the split
  // chunk by the id the server runs" (Qwik optimizer example_strip_exports_used)
  serverFnExported: `import { Hydrate, createServerFn } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
const call = () => {
  greet({ fetch: (globalThis as any).__recordFetch }).catch(() => {})
}
export const greet = createServerFn().handler(async () => 'greet-handler-marker')
export function Page() {
  return <><button data-label="a" onClick={call}>a</button><Hydrate when={load()}><button data-label="b" onClick={() => greet({ fetch: (globalThis as any).__recordFetch }).catch(() => {})}>b</button></Hydrate></>
}`,
  serverFnPrivate: `import { Hydrate, createServerFn } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
const greet = createServerFn().handler(async () => 'greet-handler-marker')
export function Page() {
  return <Hydrate when={load()}><button data-label="b" onClick={() => greet({ fetch: (globalThis as any).__recordFetch }).catch(() => {})}>b</button></Hydrate>
}`,
  // A namespace-imported boundary hydrating on interaction (recognised like
  // a named import, J5.1).
  namespaceGated: `import * as Start from '@tanstack/react-start'
import { interaction } from '@tanstack/react-start/hydration'
import { Counter } from '../counter'
export function Page() {
  return <Start.Hydrate when={interaction()}><Counter label="child" /></Start.Hydrate>
}`,
  // Variable indirection is not analysed (SPEC 2.2): the boundary still
  // defers hydration at runtime, split or not.
  destructured: `import * as Start from '@tanstack/react-start'
import { interaction } from '@tanstack/react-start/hydration'
import { Counter } from '../counter'
const { Hydrate } = Start
export function Page() {
  return <Hydrate when={interaction({ events: 'focusin' })}><Counter label="child" /></Hydrate>
}`,
  updates: updatesPage(''),
  updatesReference: updatesPage(' split={false}'),
})

/**
 * What the page mounts for the rows of a boundary mounted on the client:
 * the fixture's page below the fold (see the scripts that scroll to it).
 */
const belowTheFold = `h('div', { children: [h('div', { key: 'above', style: { height: '5000px' } }), h(m.Page, { key: 'page' })] })`

/**
 * Page script: clicks every counter once (in document order, each after the
 * previous one updated, so a boundary that hydrates on interaction hydrates
 * first) and returns the labels and counts the page then shows.
 */
const clickEveryCounter = `const counters = () => [...root.querySelectorAll('button[data-label]')].filter((button) => button.dataset.label !== 'switch')
for (const label of counters().map((button) => button.dataset.label)) {
  const button = () => root.querySelector('button[data-label="' + label + '"]')
  await clickUntil(button, () => button().textContent === label + ':1')
}
return counters().map((button) => button.textContent)`

/** The React page tests, on an app built with `bundler`. */
export function reactPageSuite(bundler: StartBundler) {
  describe.concurrent('React Hydrate pages', () => {
    let app: HydrationApp
    const cleanups: Array<() => Promise<void>> = []

    beforeAll(async () => {
      app = await buildHydrationApp({
        bundler,
        fixtures,
        files: { 'src/counter.tsx': counterFile, 'src/theme.tsx': themeFile },
        registerCleanup: (cleanup) => cleanups.push(cleanup),
      })
    }, 60_000)

    afterAll(async () => {
      await Promise.all(cleanups.map((cleanup) => cleanup()))
    })

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
      expect({
        clicked: page.result,
        recoverableErrors: page.recoverableErrors,
        consoleErrors: page.consoleErrors,
      }).toEqual({
        clicked: labels.map((label) => `${label}:1`),
        recoverableErrors: [],
        consoleErrors: [],
      })
      return page
    }

    describe.concurrent(
      'boundaries hydrate the HTML the server rendered',
      () => {
        test('eleven literal boundaries all hydrate and respond independently', async () => {
          await expectChildrenHydrate(
            'eleven',
            Array.from({ length: 11 }, (_, index) => `boundary-${index}`),
          )
        })

        test('inline text keeps its leading and trailing spaces after hydration', async () => {
          const page = await app.hydrate('edgeSpaces', {
            script: `await clickUntil(() => root.querySelector('button'), () => root.querySelector('button').textContent === 'ready:1')
  return root.querySelector('[data-spacing]').textContent`,
          })
          expect(page.result).toBe('A B C')
          expect(page.recoverableErrors).toEqual([])
          expect(page.consoleErrors).toEqual([])
        })

        test('a shared fallback remains visible in an aside on server and client', async () => {
          const page = await expectChildrenHydrate('sharedFallback', ['child'])
          expect(page.serverHtml).toContain('<aside><b>wait</b></aside>')
          expect(page.html).toContain('<aside><b>wait</b></aside>')
        })

        test('rows.map renders a function declared below its boundary', async () => {
          await expectChildrenHydrate('hoistedRows', ['a-row', 'b-row'])
        })
        test('a nested boundary in split children waits for its own gate', async () => {
          const page = await app.hydrate('nestedGates', {
            script: `const button = (label) => root.querySelector('button[data-label="' + label + '"]')
await clickUntil(() => button('outer'), () => button('outer').textContent === 'outer:1')
for (let i = 0; i < 3; i++) {
  button('inner').click()
  await settled(50)
}
return [button('outer').textContent, button('inner').textContent]`,
          })
          expect(page.serverHtml).toContain('>outer:0<')
          expect(page.serverHtml).toContain('>inner:0<')
          expect(page.result).toEqual(['outer:1', 'inner:0'])
          expect(page.consoleErrors).toEqual([])
          expect(page.recoverableErrors).toEqual([])
        })

        test('a nested boundary and a later sibling', async () => {
          await expectChildrenHydrate('nested', ['outer', 'nested', 'sibling'])
        })

        test('repeated instances of one boundary each hydrate their own children', async () => {
          const page = await expectChildrenHydrate(
            'repeated',
            ['a', 'b', 'c'],
            {
              props: { items: ['a', 'b', 'c'] },
            },
          )
          expect(page.requested).not.toEqual([])
        })

        test.each([
          {
            render: 'h(m.Page, { flag: true, items: ["x"] })',
            labels: ['yes', 'and', 'fnx', 'arrowx'],
          },
          {
            render: 'h(m.Page, { flag: false, items: ["x"] })',
            labels: ['no', 'fnx', 'arrowx'],
          },
          { render: 'h(m.Other, { early: true })', labels: ['early'] },
          { render: 'h(m.Other, { early: false })', labels: ['late'] },
        ])(
          'boundaries in conditionals and callbacks: $render',
          async ({ render, labels }) => {
            await expectChildrenHydrate('conditionals', labels, { render })
          },
        )

        // Boundaries in mutually exclusive branches may share an identity; after
        // the switch the other branch's boundary renders and works, and the
        // boundary after them keeps its state.
        test('switching between boundaries in exclusive branches after hydration', async () => {
          const page = await app.hydrate('switching', {
            script: `const button = (label) => root.querySelector('button[data-label="' + label + '"]')
  await clickUntil(() => button('last'), () => button('last').textContent === 'last:1')
  button('switch').click()
  await waitFor(() => button('no'))
  await clickUntil(() => button('no'), () => button('no').textContent === 'no:1')
  return { yes: Boolean(button('yes')), no: button('no').textContent, last: button('last').textContent }`,
          })
          expect(page.result).toEqual({
            yes: false,
            no: 'no:1',
            last: 'last:1',
          })
          expect(page.recoverableErrors).toEqual([])
          expect(page.consoleErrors).toEqual([])
        })

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
      },
    )

    // The children of the prefetched boundary load before any interaction, and
    // only them: clicking the other boundary loads its own code, clicking the
    // prefetched one loads nothing more; both then work.
    describe.concurrent('prefetch', () => {
      test.each([
        {
          name: 'prefetchDirect',
          how: 'a direct prefetch prop',
          render: undefined,
        },
        {
          name: 'prefetchSpreadLiteral',
          how: 'a spread object literal',
          render: undefined,
        },
        {
          name: 'prefetchSpreadConst',
          how: 'a spread single-use object',
          render: undefined,
        },
        {
          name: 'prefetchComputedKey',
          how: 'a spread with a computed key',
          render: 'h(m.App)',
        },
        {
          name: 'prefetchNestedSpread',
          how: 'a nested spread',
          render: 'h(m.App)',
        },
        {
          name: 'prefetchPropsSpread',
          how: 'a spread of the props param',
          render: 'h(m.App)',
        },
        {
          name: 'prefetchMemberSpread',
          how: 'a spread of a member of the props',
          render: 'h(m.App)',
        },
        {
          name: 'prefetchReassigned',
          how: 'a spread of a reassigned object',
          render: 'h(m.Page, { eager: true })',
        },
      ])(
        'a boundary with $how loads its own children before any interaction',
        async ({ name, render }) => {
          const page = await app.hydrate(name, {
            render,
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
          expect({
            result: page.result,
            recoverableErrors: page.recoverableErrors,
            consoleErrors: page.consoleErrors,
          }).toEqual({
            result: { prefetched: true, other: true, child: [] },
            recoverableErrors: [],
            consoleErrors: [],
          })
        },
      )

      test('control: without prefetch, the children load on interaction only', async () => {
        const page = await app.hydrate('prefetchNone', {
          script: `const prefetched = requested().length
  const before = requested().length
  await clickUntil(() => root.querySelector('button[data-label="child"]'), () => root.querySelector('button[data-label="child"]').textContent === 'child:1')
  return { prefetched, child: requested().length - before }`,
        })
        expect(page.result).toEqual({
          prefetched: 0,
          child: expect.any(Number),
        })
        expect((page.result as { child: number }).child).toBeGreaterThan(0)
        expect(page.recoverableErrors).toEqual([])
      })

      // A prefetch function's `preload()` loads the boundary's children; the
      // state it sets shows before any interaction.
      // Source: hydrateWhen PrefetchState fixture
      test('a prefetch function preloads the children and updates the parent state', async () => {
        const page = await app.hydrate('prefetchState', {
          script: `await waitFor(() => root.querySelector('[data-status]').textContent === 'prefetched')
  // What the prefetch requested before any interaction (a prefetch still
  // loading is not in the resource timeline yet)
  const prefetched = await waitFor(() => requested().length > 0 && requested()).catch(() => [])
  const button = root.querySelector('button[data-label="child"]')
  await clickUntil(() => root.querySelector('button[data-label="child"]'), () => root.querySelector('button[data-label="child"]').textContent === 'child:1')
  return { prefetched: prefetched.length > 0, afterClick: requested().length - prefetched.length }`,
        })
        expect(page.result).toEqual({ prefetched: true, afterClick: 0 })
        expect(page.recoverableErrors).toEqual([])
        expect(page.consoleErrors).toEqual([])
      })

      // With `split={false}` there is no chunk: `preload()` settles without
      // loading code.
      test('with split={false}, preload() settles without loading code', async () => {
        const page = await app.hydrate('prefetchState', {
          render: 'h(m.Inline)',
          script: `await waitFor(() => root.querySelector('[data-status]').textContent === 'prefetched')
  return requested()`,
        })
        expect(page.result).toEqual([])
        expect(page.recoverableErrors).toEqual([])
        expect(page.consoleErrors).toEqual([])
      })
    })

    // The function form of `when` is evaluated on the client only (J5.8): the
    // server renders the boundary without calling it.
    // Source: hydrate-boundary-forms.test.ts `when` table
    test('a function when is called on the client only, and its strategy hydrates the children', async () => {
      const page = await app.hydrate('whenFunction', {
        serverScript: 'globalThis.__whenCalls ?? []',
        script: `await clickUntil(() => root.querySelector('button'), () => root.querySelector('button').textContent === 'dynamic:1')
  return globalThis.__whenCalls`,
      })
      expect(page.serverResult).toEqual([])
      expect(page.result).toEqual(expect.arrayContaining(['object']))
      expect(page.result).not.toContain('undefined')
      expect(page.recoverableErrors).toEqual([])
      expect(page.consoleErrors).toEqual([])
    })

    // A click in the split children calls the server fn by the id the server
    // runs it under, however the chunk reaches it (its own caller or the
    // parent's); the SSR build's server entry runs the handler for that id.
    describe.concurrent('server fns called from split children', () => {
      test.each([
        {
          name: 'serverFnExported',
          labels: ['a', 'b'],
          what: 'an exported server fn also called by the parent',
        },
        {
          name: 'serverFnPrivate',
          labels: ['b'],
          what: 'a private server fn only called by the children',
        },
      ])('$what', async ({ name, labels }) => {
        const page = await app.hydrate(name, {
          beforeHydration: `globalThis.__requests = []
  globalThis.__recordFetch = (url) => {
    globalThis.__requests.push(new URL(String(url), location.href).pathname)
    return Promise.reject(new Error('no server in the page'))
  }`,
          script: `for (const label of ${JSON.stringify(labels)}) {
    const before = globalThis.__requests.length
    await clickUntil(() => root.querySelector('button[data-label="' + label + '"]'), () => globalThis.__requests.length > before)
  }
  return globalThis.__requests`,
        })
        expect(page.recoverableErrors).toEqual([])
        expect(page.consoleErrors).toEqual([])
        const paths = page.result as Array<string>
        expect(paths.length).toBeGreaterThanOrEqual(labels.length)
        for (const path of new Set(paths)) {
          expect(await app.callServerFn(path)).toBe('greet-handler-marker')
        }
      })
    })

    // A boundary that first mounts after the app started (no server HTML, e.g.
    // after a client-side navigation) shows its fallback until its children
    // load, then the children (J5.3: the client keeps the fallback, however it
    // is passed; the server strips it, hydrate-boundary-forms.test.ts). The
    // boundary (`visible()`) mounts below the fold, and the page scrolls to
    // it once the page is idle (`requestIdleCallback`: React has no work
    // left). A `visible()` boundary that becomes visible while React renders
    // it hits a bug of the runtime boundary (react-start-client's
    // `HydrationBoundary`, `src/hydration/visible.tsx`), outside the
    // compilers, so these rows do not race it.
    describe.concurrent(
      'the fallback of a boundary mounted on the client',
      () => {
        test.each([
          { name: 'fallback_direct', how: 'a direct fallback' },
          {
            name: 'fallback_directSplitFalse',
            how: 'a direct fallback with split={false}',
          },
          {
            name: 'fallback_directWithOthers',
            how: 'a direct fallback next to prefetch and onHydrated',
          },
          { name: 'fallback_inlineSpread', how: 'an inline spread' },
          {
            name: 'fallback_parenSpread',
            how: 'a parenthesized inline spread',
          },
          {
            name: 'fallback_spreadBefore',
            how: 'a spread used once, declared before the component',
          },
          {
            name: 'fallback_spreadAfter',
            how: 'a spread used once, declared after the component',
          },
          {
            name: 'fallback_parenSpreadConst',
            how: 'a parenthesized spread used once',
          },
          { name: 'fallback_moduleElement', how: 'a module-level element' },
          {
            name: 'fallback_moduleElementSplitFalse',
            how: 'a module-level element with split={false}',
          },
          { name: 'fallback_computedKey', how: 'a computed fallback key' },
          {
            name: 'fallback_quotedKeys',
            how: 'an inline spread with quoted keys',
          },
          {
            name: 'fallback_spreadSplitFalse',
            how: 'a spread used once with split={false}',
          },
        ])('$how shows, then the children', async ({ name }) => {
          const page = await app.hydrate(name, {
            mode: 'mount',
            render: belowTheFold,
            script: `await new Promise((resolve) => requestIdleCallback(resolve))
  root.firstElementChild.lastElementChild.scrollIntoView()
  await waitFor(() => root.querySelector('button'))
  await clickUntil(() => root.querySelector('button'), () => root.querySelector('button').textContent === 'child:1')`,
          })
          const fallbackAt = page.snapshots.findIndex((html) =>
            html.includes('fallback-marker'),
          )
          expect(fallbackAt).toBeGreaterThanOrEqual(0)
          expect(page.snapshots.slice(0, fallbackAt).join()).not.toContain(
            'child:',
          )
          expect(page.html).not.toContain('fallback-marker')
          expect(page.html).toContain('child:1')
          expect(page.consoleErrors).toEqual([])
        })
      },
    )

    describe.concurrent(
      'what the children and the boundary do once hydrated',
      () => {
        test('prefetch and onHydrated reach the client boundary', async () => {
          const page = await app.hydrate('callbacks', {
            script: `await waitFor(() => globalThis.__hydrated)
  return { prefetched: globalThis.__prefetched ?? false, hydrated: globalThis.__hydrated }`,
          })
          expect(page.serverHtml).not.toContain('fallback-marker')
          expect(page.result).toEqual({ prefetched: true, hydrated: true })
          expect(page.recoverableErrors).toEqual([])
          expect(page.consoleErrors).toEqual([])
        })

        test('an interaction strategy with options hydrates on its events only', async () => {
          const page = await app.hydrate('focusGate', {
            script: `const button = () => root.querySelector('button')
  button().click()
  await settled()
  const beforeFocus = button().textContent
  button().focus()
  await clickUntil(() => button(), () => button().textContent === 'child:1')
  return beforeFocus`,
          })
          expect(page.result).toBe('child:0')
          expect(page.html).toContain('child:1')
          expect(page.recoverableErrors).toEqual([])
          expect(page.consoleErrors).toEqual([])
        })

        test('a click handler with a return statement in the children runs', async () => {
          const page = await app.hydrate('returns', {
            script: `await clickUntil(() => root.querySelector('ul'), () => globalThis.__clicked)
  return globalThis.__clicked`,
          })
          expect(page.serverHtml).toContain('<li>A</li><li>B</li>iife')
          expect(page.result).toBe('click')
          expect(page.recoverableErrors).toEqual([])
          expect(page.consoleErrors).toEqual([])
        })
      },
    )

    describe.concurrent('which elements are boundaries', () => {
      // Goal (SPEC J5.1, J7.2): a
      // namespace member `<Start.Hydrate>` is a boundary like a named import,
      // so its children's code loads when it hydrates, not with the page. On
      // main the compiler leaves it unsplit (it still hydrates the server's
      // HTML: "namespace-imported Start.Hydrate boundaries" above), so the
      // click loads nothing.
      // Replaces the in-process goal of known-bugs-hydrate.test.ts.
      test('a namespace-imported Start.Hydrate loads its children when it hydrates', async () => {
        const page = await app.hydrate('namespaceGated', {
          script: loadedOnInteraction,
        })
        expect(page.result).toEqual({ beforeClick: 0, loadedByClick: true })
        expect(page.recoverableErrors).toEqual([])
        expect(page.consoleErrors).toEqual([])
      })

      // `const { Hydrate } = Start` is not analysed (SPEC 2.2): split or not,
      // the boundary keeps the server's HTML until its strategy fires (here:
      // a focus, not a click), then hydrates.
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
        expect(page.serverHtml).toContain('child:0')
        expect(page.result).toBe('child:0')
        expect(page.recoverableErrors).toEqual([])
        expect(page.consoleErrors).toEqual([])
      })
    })

    // The split children get the newest captures, context and callbacks of
    // their parent, before their boundary hydrates, after their code loaded
    // and after a keyed reorder, in the boundary clicked; a new `when` or
    // `prefetch` object does not restart a hydrated boundary (it would show
    // the server's HTML again). The same page with `split={false}` (left in
    // place by the compiler) is the reference: the framework's behaviour
    // (SPEC J5.8, J5.4).
    test('split children follow their parent through updates and a reorder, like unsplit ones', async () => {
      const [split, reference] = await Promise.all([
        app.hydrate('updates', { script: updatesScript }),
        app.hydrate('updatesReference', { script: updatesScript }),
      ])
      expect(reference.result).toEqual(updatesExpected)
      for (const page of [split, reference]) {
        expect({
          result: page.result,
          recoverableErrors: page.recoverableErrors,
          consoleErrors: page.consoleErrors,
        }).toEqual({
          result: updatesExpected,
          recoverableErrors: [],
          consoleErrors: [],
        })
      }
      // The split page loaded the children's code (`prefetch`), the reference
      // has none to load.
      expect(split.requested).not.toEqual([])
    })
  })
}
