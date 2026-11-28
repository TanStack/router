/**
 * `<Hydrate>` splits where main is wrong. Each test asserts the correct behaviour for a
 * bug main had, which today's compiler fixes (a regression test,
 * oracle/KNOWN-BUGS.md).
 *
 * The modules are compiled by the public Start plugin on a dev server and
 * rendered through it (`render.ts`): the server render (React's server
 * renderer in the SSR environment) is compared with the uncompiled source
 * (a plain Vite host), and a real page hydrates it with every gate opened;
 * the hydrated page must show the markup the server rendered, without a
 * hydration error.
 */
import { beforeAll, describe, expect, test } from 'vitest'
import {
  expectMapsTo,
  positionAt,
  tokenOffsets,
} from '@tanstack/compiler-test-utils/source-maps'
import { closeAfterAll } from '../../file-end'
import { compileError, expectCompileError } from '../../regression-helpers'
import {
  caseCode,
  createHydrateHost,
  expectHydratedCleanly,
  expectRenderedThroughChunks,
  expectRendersLikeSource,
  renderClient,
  servedWithMap,
} from '../../render'
import type { ClientRender, HydrateHost } from '../../render'
import type { SourceMapInput } from '@tanstack/compiler-test-utils/source-maps'

let hosts: HydrateHost
const openHosts = closeAfterAll()
beforeAll(async () => {
  hosts = await openHosts(() => createHydrateHost())
}, 60_000)

const head = `import { Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
`

/**
 * Like `head`, with the `idle()` strategy, whose boundaries render their
 * hydration id (`load()` boundaries render none): fixtures about which id a
 * boundary hydrates with use it.
 */
const idleHead = `import { Hydrate } from '@tanstack/react-start'
import { idle } from '@tanstack/react-start/hydration'
`

/**
 * Asserts that `error` is a compile error about `source` at the line of its
 * boundary (`expectCompileError`; the fixtures read the value on that line
 * too, so the boundary and the read are both there).
 */
function expectRejection(error: unknown, source: string) {
  expectCompileError(error, { source, at: '<Hydrate' })
}

/**
 * Every module of the case's own code that the page can load from the
 * client module (Vite's client module graph from it, static and lazy
 * imports: `load()`, up to packages and Vite's client; the case's code by
 * provenance among them, `caseCode`) is
 * requested while the page imports the module and hydrates it with every
 * gate open (every boundary of the fixtures renders): no split code ships
 * that the page never loads. How many modules the split takes, their ids
 * and how the client imports them are free (SPEC §5.3).
 */
async function expectNoUnusedChunks(client: ClientRender) {
  const host = hosts
  // Packages (installed, linked from outside the app: served under
  // `/@fs/`, or named by their bare id in the graph) and Vite's client are
  // not the case's code; the dev server serves them as they are
  const reachable = Object.keys(
    await host.start.host.dev.load(client.case.url(), {
      skip: /^[^/]|(^|\/)node_modules\/|^\/@fs\/|^\/@vite\/|^\/@react-refresh/,
    }),
  )
  const own = await caseCode(host, client.case.dir, 'module.tsx', reachable)
  const normalized = (url: string) => {
    const parsed = new URL(url, 'http://localhost')
    return decodeURIComponent(parsed.pathname + parsed.search)
  }
  const requested = new Set(
    [...client.importedUrls, ...client.lazyUrls].map(normalized),
  )
  const unloaded = own.filter((url) => !requested.has(normalized(url)))
  expect(unloaded, 'split code the page never loaded').toEqual([])
}

/**
 * The markup of the boundary element (the one the runtime renders with a
 * hydration id) whose whole content is `children`, if the (normalized)
 * markup `html` has one: its element and id, whatever else the page has.
 */
function boundaryRendering(html: string, children: string) {
  return html.match(
    new RegExp(
      `<([a-z]+) data-ts-hydrate-id="[^"]*">${children.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}</\\1>`,
    ),
  )?.[0]
}

describe('boundaries and ids', () => {
  // On main, the boundary after it hydrates with the fallback's children.
  test('a Hydrate inside a fallback does not shift the chunks of later boundaries', async () => {
    const { client } = await expectRendersLikeSource(
      hosts,
      `${idleHead}export function Page() {
  return <div>
    <Hydrate when={idle()} fallback={<Hydrate when={idle()}><p>inner</p></Hydrate>}><p>outer</p></Hydrate>
    <Hydrate when={idle()}><p>second</p></Hydrate>
  </div>
}`,
    )
    expect(client.html).toContain('<p>outer</p>')
    expect(client.html).toContain('<p>second</p>')
  })

  // On main, nested boundaries of recursive components (trees, threads) and of
  // components with their own boundary render ids the server never emitted and
  // lazy-load boundaries that do not exist.
  // Source: Qwik optimizer root_level_self_referential_qrl,
  // example_self_referential_component_migration
  test.each([
    {
      name: 'a self-recursive component',
      code: `export function Tree({ node }) {
  return <li>{node.label}<Hydrate when={idle()}><ul>{node.children.map((child) => <Tree node={child} />)}</ul></Hydrate></li>
}`,
      component: 'Tree',
      props: { node: { label: 'a', children: [{ label: 'b', children: [] }] } },
      rendered: 'b',
    },
    {
      name: 'mutually recursive components',
      code: `function Branch({ depth }) { return depth ? <Leaf depth={depth - 1} /> : null }
export function Leaf({ depth }) {
  return <Hydrate when={idle()}><Branch depth={depth} /></Hydrate>
}`,
      component: 'Leaf',
      props: { depth: 2 },
      rendered: 'data-ts-hydrate-id',
    },
    {
      name: 'a component with its own boundary inside another boundary',
      code: `function Widget() { return <Hydrate when={idle()}><b>widget</b></Hydrate> }
export function Page() {
  return <Hydrate when={idle()}><section><Widget /></section></Hydrate>
}`,
      component: 'Page',
      props: {},
      rendered: '<b>widget</b>',
    },
  ])(
    'client: $name hydrates like the server renders it',
    async ({ code, component, props, rendered }) => {
      const { client } = await expectRendersLikeSource(
        hosts,
        `${idleHead}${code}`,
        {
          render: `h(m.${component}, props)`,
          props,
        },
      )
      expect(client.html).toContain(rendered)
    },
    // The page may keep loading boundaries that do not exist (the impact)
    20_000,
  )

  // On main, a local component named `Hydrate` is split into a lazy chunk.
  test('client: a local component named Hydrate is left alone', async () => {
    const code = `${head}export function Page() {
  return <Hydrate when={load()}><p>real</p></Hydrate>
}
export function Local() {
  const Hydrate = (props: { children: unknown }) => props.children
  return <Hydrate><p>local</p></Hydrate>
}`
    const { client: page } = await expectRendersLikeSource(hosts, code)
    expect(page.html).toContain('<p>real</p>')
    // The local component renders its children in place: nothing loads.
    const { client: local } = await expectRendersLikeSource(hosts, code, {
      render: 'h(m.Local)',
      split: false,
    })
    expect(local.html).toBe('<p>local</p>')
    expect(local.lazy).toEqual([])
  })

  // The goal that a namespace-imported `<Start.Hydrate>` is split like a
  // named import (SPEC J5.1) is pinned on real hydration:
  // integration/hydrate-pages-react.ts and hydrate-pages-solid.test.ts "a
  // namespace-imported Start.Hydrate loads its children when it hydrates".

  // Control of the pins below (the same check): a boundary with JSX
  // children loads every split module it ships once it hydrates.
  test('client: children passed as JSX children render without unused chunks', async () => {
    const { client } = await expectRendersLikeSource(
      hosts,
      `${head}import { Chart } from './chart'
export function Page() {
  return <Hydrate when={load()}><Chart /></Hydrate>
}`,
      { files: { './chart': `export const Chart = () => 'chart'` } },
    )
    expect(client.html).toContain('chart')
    expect(client.chunks.length).toBeGreaterThan(0)
    await expectNoUnusedChunks(client)
  })

  // On main, a self-closing boundary whose children come from a spread or a
  // `children` prop ships an unused empty chunk (and the JSX of a `children`
  // prop is not deferred). `split`: JSX passed as the `children` prop is split
  // like JSX children.
  // Children that only exist at run time (a spread) or plain text have no code
  // to load lazily, so leaving them in place is accepted.
  test.each([
    {
      name: 'a spread on a self-closing element',
      code: `export function Page(props) {
  return <Hydrate {...props} />
}`,
      spread: true,
      rendered: 'spread',
      split: false,
    },
    {
      name: 'a children prop of a self-closing element',
      code: `import { idle } from '@tanstack/react-start/hydration'
import { Chart } from './chart'
export function Page() {
  return <Hydrate when={idle()} children={<Chart />} />
}`,
      spread: false,
      rendered: 'chart',
      split: true,
    },
    {
      // Plain text has nothing to hydrate: splitting it or leaving it in
      // place both render it once.
      // Source: #8504 hydrate-split-modules.test.ts (red on main)
      name: 'a string children prop',
      code: `export function Page() {
  return <Hydrate when={load()} children="text" />
}`,
      spread: false,
      rendered: 'text',
      split: false,
    },
  ])(
    'client: children passed through $name render without unused chunks',
    async ({ code, spread, rendered, split }) => {
      const { client } = await expectRendersLikeSource(
        hosts,
        `${head}${code}`,
        {
          // A strategy of the app's own hydration package, in each realm.
          setup: `import { load } from '@tanstack/react-start/hydration'
globalThis.__spreadWhen = load()
export const cleanup = ['__spreadWhen']`,
          render: spread
            ? `h(m.Page, { when: globalThis.__spreadWhen, children: 'spread' })`
            : 'h(m.Page, {})',
          files: { './chart': `export const Chart = () => 'chart'` },
          split,
        },
      )
      expect(client.html).toContain(rendered)
      await expectNoUnusedChunks(client)
    },
  )

  // Source: fuzzing (mutants of the repository's
  // e2e/react-start/deferred-hydration EnhancedNestedWidget.tsx).
  // On main, the nested boundary hydrates without its id (a hydration
  // mismatch).
  test('client: a boundary nested in a children prop hydrates with the id the server renders', async () => {
    const { client } = await expectRendersLikeSource(
      hosts,
      `${idleHead}export function Page() {
  return <Hydrate when={idle()} children={<section><Hydrate when={idle()}><p>inner</p></Hydrate></section>} />
}`,
    )
    expect(client.html).toContain('<p>inner</p>')
  })

  // On main, the client renders other text than the server (a hydration
  // mismatch).
  // Plain text has nothing to hydrate: it is not split (decision 12). (`idleHead`:
  // `boundaryRendering` finds the boundary by the hydration id it renders; a
  // `load()` boundary renders none.)
  // Source: #8504 hydrate-split-modules.test.ts (exact JSX-text equality, red
  // on main)
  test.each([
    {
      name: 'multi-line text with entities',
      text: '\n      Fish &amp;\n      Chips &copy;\n    ',
      rendered: 'Fish &amp; Chips ©',
    },
    {
      name: 'lines with trailing whitespace',
      text: '\n      first line  \n      second line\n    ',
      rendered: 'first line second line',
    },
  ])(
    'client: a text-only child renders like JSX text: $name',
    async ({ text, rendered }) => {
      const { source } = await expectRendersLikeSource(
        hosts,
        `${idleHead}export function Page() {
  return <Hydrate when={idle()}>${text}</Hydrate>
}`,
        { split: false },
      )
      // The reference renders the text alone in the boundary.
      expect(boundaryRendering(source.html, rendered)).toBeDefined()
    },
  )

  // On main, the client renders other text than the server (a hydration
  // mismatch).
  // Source: hydrate-when-transform.ts getMeaningfulChildren (mutation testing).
  // (`idleHead`: see the text-only rows above.)
  test('client: spaces around a single child on one line render like on the server', async () => {
    const { source } = await expectRendersLikeSource(
      hosts,
      `${idleHead}export function Page() {
  return <Hydrate when={idle()}> <p>x</p> </Hydrate>
}`,
      { split: false },
    )
    expect(boundaryRendering(source.html, ' <p>x</p> ')).toBeDefined()
  })

  // On main, a boundary after such code hydrates with an id the server did not
  // render it with, or loads the chunk of the removed boundary and renders its
  // children instead of its own.
  // Source: main's start-compiler/compiler.ts (built-in handlers, `<ClientOnly>`
  // removal and dead-code elimination run before the AST plugins) vs
  // hydrate-when-transform.ts `loadHydrateVirtualModule`.
  const laterBoundaryRows = [
    {
      // `<ClientOnly>` renders its fallback on the server and, before
      // hydration, on the client.
      name: 'a boundary in <ClientOnly> children (removed on the server)',
      code: `import { Hydrate } from '@tanstack/react-start'
import { idle } from '@tanstack/react-start/hydration'
import { ClientOnly } from '@tanstack/react-router'
export function Page() {
  return <div>
    <ClientOnly fallback={<i>fallback</i>}><Hydrate when={idle()}><p>a</p></Hydrate></ClientOnly>
    <Hydrate when={idle()}><p>b</p></Hydrate>
  </div>
}`,
    },
    {
      // (`panel` is exported, not rendered: its two implementations render
      // different trees, a hydration mismatch React reports whatever the
      // compiler does)
      name: 'a boundary in an isomorphic .server() (removed on the client)',
      code: `import { Hydrate, createIsomorphicFn } from '@tanstack/react-start'
import { idle } from '@tanstack/react-start/hydration'
export const panel = createIsomorphicFn()
  .server(() => <Hydrate when={idle()}><p>a</p></Hydrate>)
  .client(() => <i>client</i>)
export function Page() {
  return <div><Hydrate when={idle()}><p>b</p></Hydrate></div>
}`,
    },
    {
      name: 'a boundary in a createServerOnlyFn (removed on the client)',
      code: `import { Hydrate, createServerOnlyFn } from '@tanstack/react-start'
import { idle } from '@tanstack/react-start/hydration'
export const panel = createServerOnlyFn(() => <Hydrate when={idle()}><p>a</p></Hydrate>)
export function Page() {
  return <div><Hydrate when={idle()}><p>b</p></Hydrate></div>
}`,
    },
    {
      name: 'a boundary in a server fn handler (removed on the client)',
      code: `import { Hydrate, createServerFn } from '@tanstack/react-start'
import { idle } from '@tanstack/react-start/hydration'
export const panel = createServerFn().handler(async () => <Hydrate when={idle()}><p>a</p></Hydrate>)
export function Page() {
  return <div><Hydrate when={idle()}><p>b</p></Hydrate></div>
}`,
    },
    {
      // (`panel` exported, not rendered: see the `.server()` row)
      name: 'a boundary in an isomorphic .client() (removed on the server)',
      code: `import { Hydrate, createIsomorphicFn } from '@tanstack/react-start'
import { idle } from '@tanstack/react-start/hydration'
export const panel = createIsomorphicFn()
  .server(() => <i>server</i>)
  .client(() => <Hydrate when={idle()}><p>a</p></Hydrate>)
export function Page() {
  return <div><Hydrate when={idle()}><p>b</p></Hydrate></div>
}`,
    },
    {
      // The component is only referenced from the removed handler, so the
      // client drops it too.
      name: 'a component with a boundary that only a server fn handler renders (removed on the client)',
      code: `import { Hydrate, createServerFn } from '@tanstack/react-start'
import { idle } from '@tanstack/react-start/hydration'
function ServerPanel() {
  return <Hydrate when={idle()}><p>a</p></Hydrate>
}
export const panel = createServerFn().handler(async () => <ServerPanel />)
export function Page() {
  return <div><Hydrate when={idle()}><p>b</p></Hydrate></div>
}`,
    },
    {
      name: 'a boundary in a createClientOnlyFn (a stub on the server)',
      code: `import { Hydrate, createClientOnlyFn } from '@tanstack/react-start'
import { idle } from '@tanstack/react-start/hydration'
export const panel = createClientOnlyFn(() => <Hydrate when={idle()}><p>a</p></Hydrate>)
export function Page() {
  return <div><Hydrate when={idle()}><p>b</p></Hydrate></div>
}`,
    },
  ]
  const laterBoundaryKeepsItsId = async ({ code }: { code: string }) => {
    // The rest of the page may differ between the environments (that is
    // the code they remove): the later boundary renders the same markup,
    // id included, through split code on the client.
    const client = await renderClient(hosts, code)
    expectHydratedCleanly(client)
    const later = boundaryRendering(client.server.html, '<p>b</p>')
    expect(later).toBeDefined()
    expect(boundaryRendering(client.html, '<p>b</p>')).toBe(later)
    expectRenderedThroughChunks(client)
  }
  test.each(laterBoundaryRows)(
    'a later boundary keeps its id and its children next to $name',
    laterBoundaryKeepsItsId,
  )
})

describe('values captured by the children', () => {
  // On main, the split children render without those values.
  test('client: captured locals named key and ref reach the split children', async () => {
    const { client } = await expectRendersLikeSource(
      hosts,
      `${head}export function Page() {
  const key = 'k'
  const ref = 'r'
  return <Hydrate when={load()}><p>{key}{ref}</p></Hydrate>
}`,
    )
    expect(client.html).toContain('<p>kr</p>')
  })

  // On main, the boundary throws "_Local is not defined" when it hydrates.
  // Source: Qwik optimizer jsx_underscore_component_tag; React Compiler fixture
  // jsx-underscore-prefix-component.js (#8504 hydrate-captures.test.ts, red on
  // main)
  test.each(['_Local', '$Local', 'ÉLocal', '组件'])(
    'client: the split children render a local component named %s',
    async (name) => {
      const { client } = await expectRendersLikeSource(
        hosts,
        `${head}export function Page({ label }) {
  const ${name} = () => <b>{label}</b>
  return <Hydrate when={load()}><${name} /><i>{label}</i></Hydrate>
}`,
        { props: { label: 'l' } },
      )
      expect(client.html).toContain('<b>l</b><i>l</i>')
    },
  )

  // On main, the boundary throws "ui is not defined" when it hydrates.
  // Source: Qwik optimizer jsx_member_tag_object_is_captured,
  // destructured_prop_used_as_member_tag (#8504 hydrate-captures.test.ts, red
  // on main); hydrate-when-transform.ts captureVisitors.JSXIdentifier
  test.each([
    {
      name: 'a lowercase local object',
      code: `function Home() { return <i>home</i> }
export function Page() {
  const ui = { Home }
  return <Hydrate when={load()}><ui.Home /></Hydrate>
}`,
      rendered: '<i>home</i>',
    },
    {
      name: 'a capitalized destructured prop',
      code: `export function Page({ Model }) {
  return <Hydrate when={load()}><Model.Item /></Hydrate>
}`,
      rendered: '<b>item</b>',
    },
  ])(
    'client: the split children render member-expression tags of $name',
    async ({ code, rendered }) => {
      const { client } = await expectRendersLikeSource(
        hosts,
        `${head}${code}`,
        {
          render: `h(m.Page, { Model: { Item: () => h('b', null, 'item') } })`,
        },
      )
      expect(client.html).toContain(rendered)
    },
  )

  /** `icons` maps ids to components. */
  const iconFiles = {
    './icons': `export const icons = { a: () => <i>a</i>, b: () => <i>b</i> }`,
  }
  const renderIcons = {
    files: iconFiles,
    render: `h(m.Icons, { ids: ['a', 'b'] })`,
  }

  // Control for the pin below (same rendering): a component the component
  // body binds outside the boundary is a capture, passed to the chunk.
  test('client: the split children render a component bound outside the boundary', async () => {
    const { client } = await expectRendersLikeSource(
      hosts,
      `${head}import { icons } from './icons'
export function Icons({ ids }) {
  const Icon = icons[ids[0]]
  return (
    <Hydrate when={load()}>
      <ul>{ids.map((id) => <li key={id}><Icon /></li>)}</ul>
    </Hydrate>
  )
}`,
      renderIcons,
    )
    expect(client.html).toContain('<ul><li><i>a</i></li><li><i>a</i></li></ul>')
  })

  // Source: hydrate-when-transform.ts:439-447 (JSXIdentifier, without the
  // declared-inside check of :426-434); fuzzing.
  // On main, the parent throws "Icon is not defined" when it renders, so the
  // page fails on the client.
  test('client: the split children render a component bound inside them', async () => {
    const { client } = await expectRendersLikeSource(
      hosts,
      `${head}import { icons } from './icons'
export function Icons({ ids }) {
  return (
    <Hydrate when={load()}>
      <ul>
        {ids.map((id) => {
          const Icon = icons[id]
          return <li key={id}><Icon /></li>
        })}
      </ul>
    </Hydrate>
  )
}`,
      renderIcons,
    )
    expect(client.html).toContain('<ul><li><i>a</i></li><li><i>b</i></li></ul>')
  })

  // On main, a boundary rendered before such a local is declared throws "Cannot
  // access 'later' before initialization".
  // Source: Qwik optimizer jsx_tag_names_are_not_segment_uses (non-reference
  // identifiers) (#8504 hydrate-captures.test.ts, red on main)
  test('client: property names, method keys and optional members are no reads of a local', async () => {
    const { client } = await expectRendersLikeSource(
      hosts,
      `${head}export function Page({ obj }) {
  const el = <Hydrate when={load()}><p>{obj?.later + ({ later() { return '!' } }).later()}</p></Hydrate>
  const later = 1
  console.log(later)
  return el
}`,
      { props: { obj: { later: 'L' } } },
    )
    expect(client.html).toContain('<p>L!</p>')
  })

  // On main, the boundary throws "Color is not defined" when it hydrates.
  // Source: Qwik optimizer example_ts_enums (component-local enum) (#8504
  // hydrate-captures.test.ts, red on main)
  test('client: the split children read a local enum', async () => {
    const { client } = await expectRendersLikeSource(
      hosts,
      `${head}export function Page() {
  enum Color {
    Red = 'red',
  }
  return <Hydrate when={load()}><p>{Color.Red}</p></Hydrate>
}`,
    )
    expect(client.html).toContain('<p>red</p>')
  })

  // On main, valid code fails to build.
  // Source: SolidStart compile.spec.ts "allows `this` and `arguments` in a
  // function expression"
  test.each([
    {
      name: 'a function expression',
      children: `<ul>{items.map(function (this: { prefix: string }, item: string) { return <li>{this.prefix + item}</li> }, { prefix: '>' })}</ul>`,
      rendered: '<ul><li>&gt;a</li><li>&gt;b</li></ul>',
    },
    {
      name: 'a class',
      children: `<p>{new (class { label = 'inner'; read() { return this.label } })().read()}</p>`,
      rendered: '<p>inner</p>',
    },
    {
      // (its own private name: Astra review of #8817, hydrate #2, control)
      name: 'a class with a private field',
      children: `<p>{new (class { #label = 'inner'; read() { return this.#label } })().read()}</p>`,
      rendered: '<p>inner</p>',
    },
    {
      name: 'an object method',
      children: `<p>{({ label: 'inner', read() { return this.label } }).read()}</p>`,
      rendered: '<p>inner</p>',
    },
  ])(
    'client: split children may use the own `this` of $name',
    async ({ children, rendered }) => {
      // Both environments compile, and the client renders like the server.
      const { client } = await expectRendersLikeSource(
        hosts,
        `${head}export function Page({ items }) {
  return <Hydrate when={load()}>${children}</Hydrate>
}`,
        { props: { items: ['a', 'b'] } },
      )
      expect(client.html).toContain(rendered)
    },
  )

  // On main, the chunk does not parse (`await` outside an async function) and
  // the client build fails without saying why.
  test('client: await in split children is rejected at the boundary or renders', async () => {
    const code = `${head}import { loadData } from './data'
export async function Page() {
  return <Hydrate when={load()}><p>{await loadData()}</p></Hydrate>
}`
    const startCase = await hosts.start.case({
      'module.tsx': code,
      'data.ts': `export const loadData = async () => 'data'`,
    })
    const failure = await compileError(startCase, 'client')
    if (failure !== undefined) {
      expectRejection(failure, code)
      return
    }
    // Every emitted module is valid, and the client renders like the
    // server.
    const { client } = await expectRendersLikeSource(hosts, code, {
      files: { './data': `export const loadData = async () => 'data'` },
    })
    expect(client.html).toContain('<p>data</p>')
  })
})

describe('source maps of the split code', () => {
  /**
   * Asserts that the case's split code holds `marker` (a string token) and
   * that every occurrence maps, through the map the dev server serves with
   * it, to the marker's line and column in `source` (SPEC G6: Hydrate
   * chunks map to the user's original line and column).
   */
  async function expectSplitTextMapped(source: string, marker: string) {
    const started = hosts
    const client = await renderClient(started, source)
    expectRenderedThroughChunks(client)
    const original = positionAt(source, source.indexOf(marker))
    let held = 0
    for (const url of client.chunks) {
      const served = await servedWithMap(started, url)
      for (const offset of tokenOffsets(served.code, { string: marker })) {
        held++
        expectMapsTo(
          served.map as SourceMapInput,
          positionAt(served.code, offset),
          {
            file: client.case.file(),
            line: original.line,
            column: original.column,
          },
        )
      }
    }
    expect(held, `the split code holds ${marker}`).toBeGreaterThan(0)
  }

  // On main, the split code of such a boundary maps to nothing (SPEC G6):
  // devtools show it as generated code, not as the user's file, and its
  // component's frames in stacks resolve nowhere.
  test('client: the split text of a boundary maps to its line and column', async () => {
    await expectSplitTextMapped(
      `${head}export function Page() {
  return (
    <main>
      <Hydrate when={load()}><p>MARK_SPLIT_TEXT</p></Hydrate>
    </main>
  )
}`,
      'MARK_SPLIT_TEXT',
    )
  })
})
