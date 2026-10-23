/**
 * Known `<Hydrate>` split bugs. Each test asserts correct behaviour for a bug
 * on main and is marked .fails; remove .fails when the bug is fixed.
 *
 * The modules are compiled by the public Start plugin on a dev server and
 * rendered through it (`render.ts`): the server render (React's server
 * renderer in the SSR environment) is compared with the uncompiled source
 * (a plain Vite host), and a real page hydrates it with every gate opened;
 * the hydrated page must show the markup the server rendered, without a
 * hydration error.
 */
import { describe, expect, test } from 'vitest'
import {
  expectMapsTo,
  positionAt,
  tokenOffsets,
} from '@tanstack/compiler-test-utils/source-maps'
import { compileError, expectCompileError } from '../../regression-helpers'
import {
  caseCode,
  expectHydratedCleanly,
  expectRenderedThroughChunks,
  expectRendersLikeSource,
  renderClient,
  servedWithMap,
  useHydrateHost,
} from '../../render'
import type { ClientRender } from '../../render'
import type { SourceMapInput } from '@tanstack/compiler-test-utils/source-maps'

const hosts = useHydrateHost()

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
 * and how the client imports them are free (SPEC N13).
 */
async function expectNoUnusedChunks(client: ClientRender) {
  const host = await hosts()
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
  // Bug: the server and the client number boundaries without the Hydrate
  // inside a `fallback`, but the chunk loader counts it.
  // Impact: the boundary after it hydrates with the fallback's children.
  test.fails(
    'a Hydrate inside a fallback does not shift the chunks of later boundaries',
    async () => {
      const { client } = await expectRendersLikeSource(
        await hosts(),
        `${idleHead}export function Page() {
  return <div>
    <Hydrate when={idle()} fallback={<Hydrate when={idle()}><p>inner</p></Hydrate>}><p>outer</p></Hydrate>
    <Hydrate when={idle()}><p>second</p></Hydrate>
  </div>
}`,
      )
      expect(client.html).toContain('<p>outer</p>')
      expect(client.html).toContain('<p>second</p>')
    },
  )

  // Bug: a component that declares a boundary and is rendered inside a
  // boundary (its own, or another one) is copied into the chunk, and
  // compiling the chunk numbers the copy's boundary after the chunk's own
  // index.
  // Impact: nested boundaries of recursive components (trees, threads) and
  // of components with their own boundary render ids the server never
  // emitted and lazy-load boundaries that do not exist.
  // Source: Qwik optimizer root_level_self_referential_qrl,
  // example_self_referential_component_migration
  test.fails.each([
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
        await hosts(),
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

  // Bug: Hydrate elements are matched by name instead of by binding.
  // Impact: a local component named `Hydrate` is split into a lazy chunk.
  test.fails(
    'client: a local component named Hydrate is left alone',
    async () => {
      const code = `${head}export function Page() {
  return <Hydrate when={load()}><p>real</p></Hydrate>
}
export function Local() {
  const Hydrate = (props: { children: unknown }) => props.children
  return <Hydrate><p>local</p></Hydrate>
}`
      const { client: page } = await expectRendersLikeSource(
        await hosts(),
        code,
      )
      expect(page.html).toContain('<p>real</p>')
      // The local component renders its children in place: nothing loads.
      const { client: local } = await expectRendersLikeSource(
        await hosts(),
        code,
        {
          render: 'h(m.Local)',
          split: false,
        },
      )
      expect(local.html).toBe('<p>local</p>')
      expect(local.lazy).toEqual([])
    },
  )

  // The goal that a namespace-imported `<Start.Hydrate>` is split like a
  // named import (DECISIONS 2026-10-18) is pinned on real hydration:
  // integration/hydrate-pages-react.ts and hydrate-pages-solid.test.ts "a
  // namespace-imported Start.Hydrate loads its children when it hydrates".

  // Control of the pins below (the same check): a boundary with JSX
  // children loads every split module it ships once it hydrates.
  test('client: children passed as JSX children render without unused chunks', async () => {
    const { client } = await expectRendersLikeSource(
      await hosts(),
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

  // Bug: the boundary's children are only read from JSX children, never from
  // a `children` prop or spread.
  // Impact: a self-closing boundary whose children come from a spread or a
  // `children` prop ships an unused empty chunk (and the JSX of a `children`
  // prop is not deferred).
  // `split`: JSX passed as the `children` prop is split like JSX children.
  // Children that only exist at run time (a spread) or plain text have no
  // code to load lazily, so leaving them in place is accepted.
  test.fails.each([
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
        await hosts(),
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

  // Bug: same root cause as above, for a `children` prop that holds another
  // boundary: the client does not compile the JSX of the prop, so the nested
  // boundary hydrates without the id the server renders it with.
  // Source: fuzzing (oracle mode, round 2; mutants of the repository's
  // e2e/react-start/deferred-hydration EnhancedNestedWidget.tsx).
  // Impact: the nested boundary hydrates without its id (a hydration
  // mismatch).
  test.fails(
    'client: a boundary nested in a children prop hydrates with the id the server renders',
    async () => {
      const { client } = await expectRendersLikeSource(
        await hosts(),
        `${idleHead}export function Page() {
  return <Hydrate when={idle()} children={<section><Hydrate when={idle()}><p>inner</p></Hydrate></section>} />
}`,
      )
      expect(client.html).toContain('<p>inner</p>')
    },
  )

  // Bug: a multi-line text-only child moves into the chunk as a string
  // literal of the raw text, without the line collapsing of JSX text.
  // Impact: the client renders other text than the server (a hydration
  // mismatch).
  // Plain text has nothing to hydrate: splitting it or leaving it in place
  // are both accepted, so the chunks are not asserted.
  // Source: #8504 hydrate-split-modules.test.ts (exact JSX-text equality, red
  // on main)
  test.fails.each([
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
        await hosts(),
        `${head}export function Page() {
  return <Hydrate when={load()}>${text}</Hydrate>
}`,
        { split: false },
      )
      // The reference renders the text alone in the boundary.
      expect(boundaryRendering(source.html, rendered)).toBeDefined()
    },
  )

  // Bug: whitespace-only text around a single child is dropped when the
  // children move into the chunk, although JSX keeps whitespace on the line
  // of the child as text (the server renders it).
  // Impact: the client renders other text than the server (a hydration
  // mismatch).
  // Source: hydrate-when-transform.ts getMeaningfulChildren (round3
  // mutation analysis, hydrate P1)
  test.fails(
    'client: spaces around a single child on one line render like on the server',
    async () => {
      const { source } = await expectRendersLikeSource(
        await hosts(),
        `${head}export function Page() {
  return <Hydrate when={load()}> <p>x</p> </Hydrate>
}`,
        { split: false },
      )
      expect(boundaryRendering(source.html, ' <p>x</p> ')).toBeDefined()
    },
  )

  // Bug: the Hydrate plugin numbers boundaries after the other Start
  // transforms removed environment-specific code (`<ClientOnly>` children on
  // the server; server fn handlers, `createServerOnlyFn` bodies and
  // isomorphic `.server()` implementations on the client), while the client
  // chunk loader counts the boundaries of the original module.
  // Impact: a boundary after such code hydrates with an id the server did
  // not render it with, or loads the chunk of the removed boundary and
  // renders its children instead of its own.
  // Source: gap H9 (gaps/hydrate-rsc.md); start-compiler/compiler.ts
  // (built-in handlers, `<ClientOnly>` removal and dead-code elimination run
  // before the AST plugins) vs hydrate-when-transform.ts
  // `loadHydrateVirtualModule`.
  test.fails.each([
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
      name: 'a boundary in an isomorphic .server() (removed on the client)',
      code: `import { Hydrate, createIsomorphicFn } from '@tanstack/react-start'
import { idle } from '@tanstack/react-start/hydration'
const panel = createIsomorphicFn()
  .server(() => <Hydrate when={idle()}><p>a</p></Hydrate>)
  .client(() => <i>client</i>)
export function Page() {
  return <div>{panel()}<Hydrate when={idle()}><p>b</p></Hydrate></div>
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
      name: 'a boundary in an isomorphic .client() (removed on the server)',
      code: `import { Hydrate, createIsomorphicFn } from '@tanstack/react-start'
import { idle } from '@tanstack/react-start/hydration'
const panel = createIsomorphicFn()
  .server(() => <i>server</i>)
  .client(() => <Hydrate when={idle()}><p>a</p></Hydrate>)
export function Page() {
  return <div>{panel()}<Hydrate when={idle()}><p>b</p></Hydrate></div>
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
  ])(
    'a later boundary keeps its id and its children next to $name',
    async ({ code }) => {
      // The rest of the page may differ between the environments (that is
      // the code they remove): the later boundary renders the same markup,
      // id included, through split code on the client.
      const client = await renderClient(await hosts(), code)
      expectHydratedCleanly(client)
      const later = boundaryRendering(client.server.html, '<p>b</p>')
      expect(later).toBeDefined()
      expect(boundaryRendering(client.html, '<p>b</p>')).toBe(later)
      expectRenderedThroughChunks(client)
    },
  )
})

describe('values captured by the children', () => {
  // Bug: captured locals are passed to the lazy chunk component as props of
  // the same name, so locals named `key` or `ref` become React's `key`/`ref`.
  // Impact: the split children render without those values.
  test.fails(
    'client: captured locals named key and ref reach the split children',
    async () => {
      const { client } = await expectRendersLikeSource(
        await hosts(),
        `${head}export function Page() {
  const key = 'k'
  const ref = 'r'
  return <Hydrate when={load()}><p>{key}{ref}</p></Hydrate>
}`,
      )
      expect(client.html).toContain('<p>kr</p>')
    },
  )

  // Bug: a JSX tag is only taken for a read of a local when its name starts
  // with an ASCII capital letter, so a local component named `_Local`,
  // `$Local` or with a non-ASCII first letter is not passed to the chunk.
  // Impact: the boundary throws "_Local is not defined" when it hydrates.
  // Source: Qwik optimizer jsx_underscore_component_tag; React Compiler
  // fixture jsx-underscore-prefix-component.js (#8504
  // hydrate-captures.test.ts, red on main)
  test.fails.each(['_Local', '$Local', 'ÉLocal', '组件'])(
    'client: the split children render a local component named %s',
    async (name) => {
      const { client } = await expectRendersLikeSource(
        await hosts(),
        `${head}export function Page({ label }) {
  const ${name} = () => <b>{label}</b>
  return <Hydrate when={load()}><${name} /><i>{label}</i></Hydrate>
}`,
        { props: { label: 'l' } },
      )
      expect(client.html).toContain('<b>l</b><i>l</i>')
    },
  )

  // Bug: the object of a member-expression tag (`<ui.Home />`,
  // `<Model.Item />`) is not taken for a read of a local.
  // Impact: the boundary throws "ui is not defined" when it hydrates.
  // Source: Qwik optimizer jsx_member_tag_object_is_captured,
  // destructured_prop_used_as_member_tag (#8504 hydrate-captures.test.ts, red
  // on main); hydrate-when-transform.ts captureVisitors.JSXIdentifier
  test.fails.each([
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
        await hosts(),
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
      await hosts(),
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

  // Bug: a JSX tag naming a binding declared inside the children (`const Icon
  // = icons[id]` in a `.map()` callback) is taken for a capture of the
  // component: the client parent passes `Icon={Icon}` to the chunk, where no
  // `Icon` exists. The identifier visitor checks where a binding is declared,
  // the JSX tag visitor does not.
  // Source: hydrate-when-transform.ts:439-447 (JSXIdentifier, without the
  // declared-inside check of :426-434); fuzzing (oracle mode, N5).
  // Impact: the parent throws "Icon is not defined" when it renders, so the
  // page fails on the client.
  test.fails(
    'client: the split children render a component bound inside them',
    async () => {
      const { client } = await expectRendersLikeSource(
        await hosts(),
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
      expect(client.html).toContain(
        '<ul><li><i>a</i></li><li><i>b</i></li></ul>',
      )
    },
  )

  // Bug: property names, method keys and optional member names in the
  // children are taken for reads of the local of the same name, which the
  // parent then reads where the boundary renders.
  // Impact: a boundary rendered before such a local is declared throws
  // "Cannot access 'later' before initialization".
  // Source: Qwik optimizer jsx_tag_names_are_not_segment_uses (non-reference
  // identifiers) (#8504 hydrate-captures.test.ts, red on main)
  test.fails(
    'client: property names, method keys and optional members are no reads of a local',
    async () => {
      const { client } = await expectRendersLikeSource(
        await hosts(),
        `${head}export function Page({ obj }) {
  const el = <Hydrate when={load()}><p>{obj?.later + ({ later() { return '!' } }).later()}</p></Hydrate>
  const later = 1
  console.log(later)
  return el
}`,
        { props: { obj: { later: 'L' } } },
      )
      expect(client.html).toContain('<p>L!</p>')
    },
  )

  // Bug: a TypeScript enum declared in the component is not passed to the
  // chunk.
  // Impact: the boundary throws "Color is not defined" when it hydrates.
  // Source: Qwik optimizer example_ts_enums (component-local enum) (#8504
  // hydrate-captures.test.ts, red on main)
  test.fails('client: the split children read a local enum', async () => {
    const { client } = await expectRendersLikeSource(
      await hosts(),
      `${head}export function Page() {
  enum Color {
    Red = 'red',
  }
  return <Hydrate when={load()}><p>{Color.Red}</p></Hydrate>
}`,
    )
    expect(client.html).toContain('<p>red</p>')
  })

  // Bug: split children reading the component's `arguments` are moved into
  // the chunk component unchanged, where `arguments` are the chunk's own
  // props (`this` and `super` are rejected instead).
  // Impact: the boundary silently hydrates with other values than the server
  // rendered. Rejecting it at compile time is a valid fix.
  // Source: SolidStart compile.spec.ts "rejects `arguments` in an arrow
  // inside a function"
  test.fails(
    "client: split children reading the component's arguments render its props",
    async () => {
      const code = `${head}export function Page() {
  return <Hydrate when={load()}><p>{arguments[0].title}</p></Hydrate>
}`
      const startCase = await (
        await hosts()
      ).start.case({
        'module.tsx': code,
      })
      const failure = await compileError(startCase, 'client')
      if (failure !== undefined) {
        expectRejection(failure, code)
        return
      }
      const { client } = await expectRendersLikeSource(await hosts(), code, {
        props: { title: 'Hello' },
      })
      expect(client.html).toContain('<p>Hello</p>')
    },
  )

  // Bug: a `this` owned by a function, class or method in the children is
  // rejected, on the client and the server.
  // Impact: valid code fails to build.
  // Source: SolidStart compile.spec.ts "allows `this` and `arguments` in a
  // function expression"
  test.fails.each([
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
      name: 'an object method',
      children: `<p>{({ label: 'inner', read() { return this.label } }).read()}</p>`,
      rendered: '<p>inner</p>',
    },
  ])(
    'client: split children may use the own `this` of $name',
    async ({ children, rendered }) => {
      // Both environments compile, and the client renders like the server.
      const { client } = await expectRendersLikeSource(
        await hosts(),
        `${head}export function Page({ items }) {
  return <Hydrate when={load()}>${children}</Hydrate>
}`,
        { props: { items: ['a', 'b'] } },
      )
      expect(client.html).toContain(rendered)
    },
  )

  // Bug: split children containing `await` (async server components) are
  // moved as is into the synchronous chunk component the client compile
  // emits, while the server renders them inline.
  // Impact: the chunk does not parse (`await` outside an async function) and
  // the client build fails without saying why. A clear compile-time error is
  // a valid fix (React client components cannot be async), and so is valid
  // output that renders the awaited value.
  test.fails(
    'client: await in split children is rejected at the boundary or renders',
    async () => {
      const code = `${head}import { loadData } from './data'
export async function Page() {
  return <Hydrate when={load()}><p>{await loadData()}</p></Hydrate>
}`
      const startCase = await (
        await hosts()
      ).start.case({
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
      const { client } = await expectRendersLikeSource(await hosts(), code, {
        files: { './data': `export const loadData = async () => 'data'` },
      })
      expect(client.html).toContain('<p>data</p>')
    },
  )
})

describe('source maps of the split code', () => {
  /**
   * Asserts that the case's split code holds `marker` (a string token) and
   * that every occurrence maps, through the map the dev server serves with
   * it, to the marker's line and column in `source` (SPEC G6: Hydrate
   * chunks map to the user's original line and column).
   */
  async function expectSplitTextMapped(source: string, marker: string) {
    const started = await hosts()
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

  // Control for the pin below: the text of an element child maps to where
  // the user wrote it.
  test('client: the split text of an element child maps to its line and column', async () => {
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

  // Bug: a boundary whose only child is text is split into code whose text
  // is a new string the compiler creates without the text's position, and
  // nothing else in that code comes from the user's file: the dev server
  // serves it with an empty source map (no mappings, no sources). Found by
  // F-C (final pass, finding 2).
  // Impact: the split code of such a boundary maps to nothing (SPEC G6):
  // devtools show it as generated code, not as the user's file, and its
  // component's frames in stacks resolve nowhere.
  test.fails(
    'client: the split text of a text-only boundary maps to its line and column',
    async () => {
      await expectSplitTextMapped(
        `${head}export function Page() {
  return (
    <main>
      <Hydrate when={load()}>MARK_SPLIT_TEXT</Hydrate>
    </main>
  )
}`,
        'MARK_SPLIT_TEXT',
      )
    },
  )
})
