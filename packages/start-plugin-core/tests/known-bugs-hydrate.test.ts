/**
 * Known `<Hydrate>` split bugs. Each test asserts correct behaviour for a bug
 * on main and is marked .fails; remove .fails when the bug is fixed.
 */
import { describe, expect, test } from 'vitest'
import {
  compileErrorMessage,
  compileHydrate,
  evaluateModule,
  expectRenderedThroughChunks,
  hydrateParentStubs,
  loadClientModule as loadHydrateClient,
  renderBoundaries,
  settle,
} from './regression-helpers'
import { generatedNames } from './hydrate-helpers'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'

const head = `import { Hydrate } from '@tanstack/react-start'\n`

/**
 * JSX runtime of the evaluated modules: intrinsic elements render as tags and,
 * like React, components never receive `key` (nor `ref` before React 19).
 */
const reactRuntime = `const __Fragment = Symbol('Fragment')
const __jsx = (type, props, ...children) => {
  const text = children.flat(Infinity).filter((c) => c != null && c !== false && c !== true).join('')
  if (type === __Fragment) return text
  if (typeof type === 'function') {
    const { key, ref, ...rest } = props ?? {}
    return type(children.length ? { ...rest, children: text } : rest)
  }
  if (typeof type !== 'string') throw new Error('cannot render ' + String(type))
  return '<' + type + '>' + text + '</' + type + '>'
}
`

/**
 * Evaluates `code` compiled for the client once its `<Hydrate>` chunks have
 * loaded, rendering through the React-like runtime (`loadClientModule`).
 */
function loadClientModule(
  code: string,
  options: Omit<
    NonNullable<Parameters<typeof loadHydrateClient>[1]>,
    'runtime'
  > = {},
) {
  return loadHydrateClient(code, { ...options, runtime: reactRuntime })
}

/**
 * Clear compile errors that a fix may reject split children with, matched
 * against the message without its code frame (`compileErrorMessage`).
 */
const rejections = {
  arguments: /\bHydrate\b[^]*\barguments\b/,
  await: /\bHydrate\b[^]*\b(await|async)\b/,
  Route: /\bHydrate\b[^]*\bRoute\b/,
}

describe('harness controls', () => {
  test('client: loadClientModule renders every boundary through its lazy chunk', async () => {
    const { module, lazyChunks } =
      await loadClientModule(`${head}const helper = () => '!'
export function Page() {
  const label = 'hi'
  return <><Hydrate><p>{label}{helper()}</p></Hydrate><Hydrate><b>two</b></Hydrate></>
}`)
    expect(module.Page()).toBe('[<p>hi!</p>][<b>two</b>]')
    expect(lazyChunks.map((chunk) => chunk.rendered)).toEqual([true, true])
  })

  test('client: loadClientModule links stubs and runs app code before the chunks load', async () => {
    const events: Array<string> = []
    const { module } = await loadClientModule(
      `${head}import { Link } from '@tanstack/react-router'
import { label } from './label'
export function Page() {
  return <Hydrate><p><Link />{label()}</p></Hydrate>
}`,
      {
        stubs: {
          // Merged with the lazy chunk loader the harness provides.
          '@tanstack/react-router': { Link: () => 'link ' },
          './label': {
            get label() {
              events.push('label linked')
              return () => 'stubbed'
            },
          },
        },
        beforeChunksLoad: (parent) =>
          events.push(`app code with ${Object.keys(parent).join()}`),
      },
    )
    expect(module.Page()).toBe('[<p>link stubbed</p>]')
    expect(events).toEqual(['app code with Page', 'label linked'])
  })

  test('client: the rejection matchers ignore the code frame of an unrelated error', async () => {
    const error = await compileHydrate(
      'client',
      `${head}import { createFileRoute } from '@tanstack/react-router'
import { load } from './data'
export const Route = createFileRoute('/')({ component: Page })
export async function Page() {
  return <Hydrate>{async () => <p>{arguments[0]}{Route.id}{await load()}</p>}</Hydrate>
}`,
    ).catch((caught: unknown) => caught)
    const message = compileErrorMessage(error)
    expect(message).toMatch(/function/)
    for (const rejection of Object.values(rejections)) {
      expect(message).not.toMatch(rejection)
    }
  })
})

describe('boundaries and ids', () => {
  // Bug: the server and the client number boundaries without the Hydrate
  // inside a `fallback`, but the chunk loader counts it.
  // Impact: the boundary after it hydrates with the fallback's children.
  test.fails(
    'a Hydrate inside a fallback does not shift the chunks of later boundaries',
    async () => {
      const code = `${head}export function Page() {
  return <div>
    <Hydrate fallback={<Hydrate><p>inner</p></Hydrate>}><p>outer</p></Hydrate>
    <Hydrate><p>second</p></Hydrate>
  </div>
}`
      const render = (m: Record<string, any>) => m.Page()
      const serverIds = (await renderBoundaries('server', code, render)).ids
      expect(serverIds).toHaveLength(2)
      expect((await renderBoundaries('client', code, render)).ids).toEqual(
        expect.arrayContaining(serverIds),
      )
      const { module } = await loadClientModule(code)
      expect(module.Page()).toBe('<div>[<p>outer</p>][<p>second</p>]</div>')
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
  return <li>{node.label}<Hydrate><ul>{node.children.map((child) => <Tree node={child} />)}</ul></Hydrate></li>
}`,
      render: (module: Record<string, any>) =>
        module.Tree({
          node: { label: 'a', children: [{ label: 'b', children: [] }] },
        }),
    },
    {
      name: 'mutually recursive components',
      code: `function Branch({ depth }) { return depth ? <Leaf depth={depth - 1} /> : null }
export function Leaf({ depth }) {
  return <Hydrate><Branch depth={depth} /></Hydrate>
}`,
      render: (module: Record<string, any>) => module.Leaf({ depth: 2 }),
    },
    {
      name: 'a component with its own boundary inside another boundary',
      code: `function Widget() { return <Hydrate><b>widget</b></Hydrate> }
export function Page() {
  return <Hydrate><section><Widget /></section></Hydrate>
}`,
      render: (module: Record<string, any>) => module.Page(),
    },
  ])(
    'client: $name hydrates like the server renders it',
    async ({ code, render }) => {
      const server = await renderBoundaries('server', `${head}${code}`, render)
      expect(server.ids.length).toBeGreaterThan(1)
      expect(
        await renderBoundaries('client', `${head}${code}`, render),
      ).toEqual(server)
    },
  )

  // Bug: Hydrate elements are matched by name instead of by binding.
  // Impact: a local component named `Hydrate` is split into a lazy chunk.
  test.fails(
    'client: a local component named Hydrate is left alone',
    async () => {
      const { module, lazyChunks } =
        await loadClientModule(`${head}export function Page() {
  return <Hydrate><p>real</p></Hydrate>
}
export function Local() {
  const Hydrate = (props: { children: unknown }) => props.children
  return <Hydrate><p>local</p></Hydrate>
}`)
      expect({
        page: module.Page(),
        local: module.Local(),
        chunks: lazyChunks.length,
      }).toEqual({ page: '[<p>real</p>]', local: '<p>local</p>', chunks: 1 })
    },
  )

  // Goal (enhancement): the `Hydrate` member of a namespace import splits its
  // children like a named import. Today it is left unsplit in both
  // environments, which is safe (hydrate-split-modules.test.ts).
  test.fails(
    'client: a namespace-imported <Start.Hydrate> is split',
    async () => {
      const { module, lazyChunks } =
        await loadClientModule(`import * as Start from '@tanstack/react-start'
export function Page() {
  return <Start.Hydrate><p>child</p></Start.Hydrate>
}`)
      expect({ page: module.Page(), chunks: lazyChunks.length }).toEqual({
        page: '[<p>child</p>]',
        chunks: 1,
      })
    },
  )

  // Bug: the boundary's children are only read from JSX children, never from
  // a `children` prop or spread.
  // Impact: the injected lazy child overrides `children` passed through a
  // spread, so they never render; a self-closing `children={...}` boundary
  // ships an unused empty chunk.
  test.fails.each([
    {
      name: 'a spread on an element without children',
      code: `export function Page(props) {
  return <Hydrate {...props}></Hydrate>
}`,
      props: { children: 'spread' },
      html: '[spread]',
    },
    {
      name: 'a children prop of a self-closing element',
      code: `import { idle } from '@tanstack/react-start/hydration'
import { Chart } from './chart'
export function Page() {
  return <Hydrate when={idle()} children={<Chart />} />
}`,
      props: {},
      html: '[chart]',
    },
    {
      // A comment-only `{/* */}` child is no child for React either.
      name: 'a children prop next to a comment-only body',
      code: `export function Page() {
  return <Hydrate children={<p>prop</p>}>{/* note */}</Hydrate>
}`,
      props: {},
      html: '[<p>prop</p>]',
    },
    {
      // Plain text has nothing to hydrate: splitting it or leaving it in
      // place both render it once.
      // Source: #8504 hydrate-split-modules.test.ts (red on main)
      name: 'a string children prop',
      code: `export function Page() {
  return <Hydrate children="text" />
}`,
      props: {},
      html: '[text]',
    },
  ])(
    'client: children passed through $name render without unused chunks',
    async ({ code, props, html }) => {
      const { module, lazyChunks } = await loadClientModule(`${head}${code}`, {
        stubs: { './chart': { Chart: () => 'chart' } },
      })
      expect({
        html: module.Page(props),
        unusedChunks: lazyChunks.filter((chunk) => !chunk.rendered).length,
      }).toEqual({ html, unusedChunks: 0 })
    },
  )

  // Bug: a multi-line text-only child moves into the chunk as a string
  // literal of the raw text, without the line collapsing of JSX text.
  // Impact: the client renders other text than the server (a hydration
  // mismatch).
  // Source: #8504 hydrate-split-modules.test.ts (exact JSX-text equality, red
  // on main)
  test.fails.each([
    {
      name: 'multi-line text with entities',
      text: '\n      Fish &amp;\n      Chips &copy;\n    ',
      rendered: 'Fish & Chips ©',
    },
    {
      name: 'lines with trailing whitespace',
      text: '\n      first line  \n      second line\n    ',
      rendered: 'first line second line',
    },
  ])(
    'client: a text-only child renders like JSX text: $name',
    async ({ text, rendered }) => {
      const jsx = await evaluateModule(`export const text = <>${text}</>`)
      expect(jsx.text).toBe(rendered)
      const { module } = await loadClientModule(`${head}export function Page() {
  return <Hydrate>${text}</Hydrate>
}`)
      expect(module.Page()).toBe(`[${rendered}]`)
    },
  )

  /**
   * Renders `Page` of `code` compiled for `env` (on the client once its
   * chunks have loaded) and records each `<Hydrate>` it renders: its id and
   * its children. `<ClientOnly>` renders its fallback on the server and its
   * children on the client.
   */
  async function renderPage(env: 'client' | 'server', code: string) {
    const boundaries: Array<{ h: unknown; children: unknown }> = []
    const stubs = {
      ...hydrateParentStubs,
      '@tanstack/react-start': {
        Hydrate: (props: { h?: unknown; children?: unknown }) => {
          boundaries.push({ h: props.h, children: props.children })
          return `[${props.children ?? ''}]`
        },
        createServerFn: () => ({ handler: (rpc: unknown) => rpc }),
      },
      '@tanstack/react-router': {
        ...hydrateParentStubs['@tanstack/react-router'],
        ClientOnly: (props: { children?: unknown; fallback?: unknown }) =>
          env === 'server' ? props.fallback : props.children,
      },
    }
    const module =
      env === 'server'
        ? await evaluateModule(
            (await compileHydrate('server', code)).parent,
            stubs,
            { runtime: reactRuntime },
          )
        : (await loadClientModule(code, { stubs })).module
    const html = module.Page()
    return { html, boundaries }
  }

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
      name: 'a boundary in <ClientOnly> children (removed on the server)',
      code: `import { Hydrate } from '@tanstack/react-start'
import { ClientOnly } from '@tanstack/react-router'
export function Page() {
  return <div>
    <ClientOnly fallback={<i>fallback</i>}><Hydrate><p>a</p></Hydrate></ClientOnly>
    <Hydrate><p>b</p></Hydrate>
  </div>
}`,
      client: '<div>[<p>a</p>][<p>b</p>]</div>',
    },
    {
      name: 'a boundary in an isomorphic .server() (removed on the client)',
      code: `import { Hydrate, createIsomorphicFn } from '@tanstack/react-start'
const panel = createIsomorphicFn()
  .server(() => <Hydrate><p>a</p></Hydrate>)
  .client(() => <i>client</i>)
export function Page() {
  return <div>{panel()}<Hydrate><p>b</p></Hydrate></div>
}`,
      client: '<div><i>client</i>[<p>b</p>]</div>',
    },
    {
      name: 'a boundary in a createServerOnlyFn (removed on the client)',
      code: `import { Hydrate, createServerOnlyFn } from '@tanstack/react-start'
export const panel = createServerOnlyFn(() => <Hydrate><p>a</p></Hydrate>)
export function Page() {
  return <div><Hydrate><p>b</p></Hydrate></div>
}`,
      client: '<div>[<p>b</p>]</div>',
    },
    {
      name: 'a boundary in a server fn handler (removed on the client)',
      code: `import { Hydrate, createServerFn } from '@tanstack/react-start'
export const panel = createServerFn().handler(async () => <Hydrate><p>a</p></Hydrate>)
export function Page() {
  return <div><Hydrate><p>b</p></Hydrate></div>
}`,
      client: '<div>[<p>b</p>]</div>',
    },
    {
      name: 'a boundary in an isomorphic .client() (removed on the server)',
      code: `import { Hydrate, createIsomorphicFn } from '@tanstack/react-start'
const panel = createIsomorphicFn()
  .server(() => <i>server</i>)
  .client(() => <Hydrate><p>a</p></Hydrate>)
export function Page() {
  return <div>{panel()}<Hydrate><p>b</p></Hydrate></div>
}`,
      client: '<div>[<p>a</p>][<p>b</p>]</div>',
    },
    {
      // The component is only referenced from the removed handler, so the
      // client drops it too.
      name: 'a component with a boundary that only a server fn handler renders (removed on the client)',
      code: `import { Hydrate, createServerFn } from '@tanstack/react-start'
function ServerPanel() {
  return <Hydrate><p>a</p></Hydrate>
}
export const panel = createServerFn().handler(async () => <ServerPanel />)
export function Page() {
  return <div><Hydrate><p>b</p></Hydrate></div>
}`,
      client: '<div>[<p>b</p>]</div>',
    },
    {
      name: 'a boundary in a createClientOnlyFn (a stub on the server)',
      code: `import { Hydrate, createClientOnlyFn } from '@tanstack/react-start'
export const panel = createClientOnlyFn(() => <Hydrate><p>a</p></Hydrate>)
export function Page() {
  return <div><Hydrate><p>b</p></Hydrate></div>
}`,
      client: '<div>[<p>b</p>]</div>',
    },
  ])(
    'a later boundary keeps its id and its children next to $name',
    async ({ code, client }) => {
      const idOfB = (boundaries: Array<{ h: unknown; children: unknown }>) =>
        boundaries.find((boundary) => boundary.children === '<p>b</p>')?.h
      const server = await renderPage('server', code)
      const rendered = await renderPage('client', code)
      expect(idOfB(server.boundaries)).toBeDefined()
      expect({
        html: rendered.html,
        id: idOfB(rendered.boundaries),
      }).toEqual({ html: client, id: idOfB(server.boundaries) })
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
      const { module, lazyChunks } =
        await loadClientModule(`${head}export function Page() {
  const key = 'k'
  const ref = 'r'
  return <Hydrate><p>{key}{ref}</p></Hydrate>
}`)
      expect(module.Page()).toBe('[<p>kr</p>]')
      expectRenderedThroughChunks(lazyChunks)
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
      const { module, lazyChunks } =
        await loadClientModule(`${head}export function Page({ label }) {
  const ${name} = () => <b>{label}</b>
  return <Hydrate><${name} /><i>{label}</i></Hydrate>
}`)
      expect(module.Page({ label: 'l' })).toBe('[<b>l</b><i>l</i>]')
      expectRenderedThroughChunks(lazyChunks)
    },
  )

  // Bug: the object of a member-expression tag (`<ui.Home />`) is not taken
  // for a read of a local.
  // Impact: the boundary throws "ui is not defined" when it hydrates.
  // Source: Qwik optimizer jsx_member_tag_object_is_captured,
  // destructured_prop_used_as_member_tag (#8504 hydrate-captures.test.ts, red
  // on main)
  test.fails(
    'client: the split children render member-expression tags of local objects',
    async () => {
      const { module, lazyChunks } =
        await loadClientModule(`${head}function Home() { return <i>home</i> }
export function Page({ Model }) {
  const ui = { Home }
  return <Hydrate><ui.Home /><Model.Item /></Hydrate>
}`)
      expect(module.Page({ Model: { Item: () => '<b>item</b>' } })).toBe(
        '[<i>home</i><b>item</b>]',
      )
      expectRenderedThroughChunks(lazyChunks)
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
      const { module, lazyChunks } =
        await loadClientModule(`${head}export function Page({ obj }) {
  const el = <Hydrate><p>{obj?.later + ({ later() { return '!' } }).later()}</p></Hydrate>
  const later = 1
  console.log(later)
  return el
}`)
      expect(module.Page({ obj: { later: 'L' } })).toBe('[<p>L!</p>]')
      expectRenderedThroughChunks(lazyChunks)
    },
  )

  // Bug: a TypeScript enum declared in the component is not passed to the
  // chunk.
  // Impact: the boundary throws "Color is not defined" when it hydrates.
  // Source: Qwik optimizer example_ts_enums (component-local enum) (#8504
  // hydrate-captures.test.ts, red on main)
  test.fails('client: the split children read a local enum', async () => {
    const { module, lazyChunks } =
      await loadClientModule(`${head}export function Page() {
  enum Color {
    Red = 'red',
  }
  return <Hydrate><p>{Color.Red}</p></Hydrate>
}`)
    expect(module.Page()).toBe('[<p>red</p>]')
    expectRenderedThroughChunks(lazyChunks)
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
      const loaded = await loadClientModule(`${head}export function Page() {
  return <Hydrate><p>{arguments[0].title}</p></Hydrate>
}`).catch((error: Error) => error)
      if (loaded instanceof Error) {
        expect(compileErrorMessage(loaded)).toMatch(rejections.arguments)
        return
      }
      expect(loaded.module.Page({ title: 'Hello' })).toBe('[<p>Hello</p>]')
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
      children: `<ul>{items.map(function (item) { return <li>{this.prefix + item}</li> }, { prefix: '>' })}</ul>`,
      rendered: '[<ul><li>>a</li><li>>b</li></ul>]',
    },
    {
      name: 'a class',
      children: `<p>{new (class { label = 'inner'; read() { return this.label } })().read()}</p>`,
      rendered: '[<p>inner</p>]',
    },
    {
      name: 'an object method',
      children: `<p>{({ label: 'inner', read() { return this.label } }).read()}</p>`,
      rendered: '[<p>inner</p>]',
    },
  ])(
    'client: split children may use the own `this` of $name',
    async ({ children, rendered }) => {
      const code = `${head}export function Page({ items }) {
  return <Hydrate>${children}</Hydrate>
}`
      const { module, lazyChunks } = await loadClientModule(code)
      expect(module.Page({ items: ['a', 'b'] })).toBe(rendered)
      const server = await compileHydrate('server', code)
      expect(await getModuleErrors(server.parent)).toEqual([])
      expectRenderedThroughChunks(lazyChunks)
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
    'client: await in split children is rejected clearly or renders',
    async () => {
      const code = `${head}import { load } from './data'
export async function Page() {
  return <Hydrate><p>{await load()}</p></Hydrate>
}`
      const compiled = await compileHydrate('client', code).catch(
        (error: Error) => error,
      )
      if (compiled instanceof Error) {
        expect(compileErrorMessage(compiled)).toMatch(rejections.await)
        return
      }
      // Every emitted module is valid (`loadClientModule`).
      const { module } = await loadClientModule(code, {
        stubs: { './data': { load: async () => 'data' } },
      })
      expect(await module.Page()).toBe('[<p>data</p>]')
    },
  )
})

describe('module-level code used by the children', () => {
  // Bug: the chunk re-declares the module-level bindings the children use
  // instead of using the parent module's instance.
  // Impact: children read another context than the parent provides, or the
  // initial value of a `let` the parent reassigns.
  // Source: Qwik optimizer should_keep_module_level_var_used_in_both_main_and_qrl,
  // should_auto_export_shared_let_kept_in_parent
  test.fails.each([
    {
      name: 'context',
      code: `import { createContext, useContext } from 'react'
const Theme = createContext('light')
function Label() { return <span>{useContext(Theme)}</span> }
export function Page() {
  return <Theme.Provider value="dark"><Hydrate><Label /></Hydrate></Theme.Provider>
}`,
      // The context the parent created first.
      html: '[<span>context 1</span>]',
    },
    {
      name: 'let reassigned by the parent',
      code: `let clicks = 0
export function bump() { clicks++ }
export function Page() {
  return <Hydrate><p>{clicks}</p></Hydrate>
}`,
      html: '[<p>1</p>]',
    },
  ])(
    'client: the children use the module-level $name of the parent module',
    async ({ code, html }) => {
      let contexts = 0
      const { module, lazyChunks } = await loadClientModule(`${head}${code}`, {
        stubs: {
          react: {
            createContext: () => ({
              Provider: (props: { children: unknown }) => props.children,
              instance: ++contexts,
            }),
            useContext: (context: { instance: number }) =>
              `context ${context.instance}`,
          },
        },
        // App code runs before the boundary hydrates.
        beforeChunksLoad: (parent) => parent.bump?.(),
      })
      expect(module.Page()).toBe(html)
      expectRenderedThroughChunks(lazyChunks)
    },
  )

  // Bug (same root cause): an exported declaration the children use is
  // copied into the chunk, so its initializer runs again there.
  // Impact: the children use another instance than the module exports
  // (e.g. another store), and the initializer's side effects run twice.
  // Goal of hydrate-when-transform.test.ts "unwraps exported declarations
  // needed by extracted virtual modules" (the copy is not required).
  test.fails(
    'client: an exported declaration the children use has one instance, initialized once',
    async () => {
      let stores = 0
      const { module, lazyChunks } = await loadClientModule(
        `${head}import { makeStore } from './store'
export const store = makeStore()
export function Page() {
  return <Hydrate><p>{store.id}</p></Hydrate>
}`,
        {
          stubs: {
            './store': { makeStore: () => ({ id: ++stores }) },
          },
        },
      )
      expect({
        html: module.Page(),
        exported: module.store.id,
        stores,
      }).toEqual({ html: '[<p>1</p>]', exported: 1, stores: 1 })
      expectRenderedThroughChunks(lazyChunks)
    },
  )

  /** Router stub recording the routes it creates. */
  const routerStub = (created: Array<string>) => ({
    '@tanstack/react-router': {
      createFileRoute:
        (id: string) => (options: { loader?: () => unknown }) => {
          created.push(id)
          return { id, useLoaderData: () => options.loader?.() }
        },
    },
  })

  // Bug: the client chunk removes the module's `Route`
  // (`removeModuleLevelBindings(ast, new Set(['Route']))`) without importing
  // it from the parent module, so split children reading it reference an
  // undeclared binding.
  // Impact: the boundary throws "Route is not defined" when it hydrates.
  // Source: #8504 hydrate-split-modules.test.ts (rows directly, through a
  // module helper, exported under a specifier, as default, and under a
  // string name; red on main)
  test.fails.each([
    {
      name: 'directly',
      code: `export const Route = createFileRoute('/posts')({ component: Page })
export function Page() {
  return <Hydrate><p>{Route.id}</p></Hydrate>
}`,
      rendered: '[<p>/posts</p>]',
    },
    {
      name: 'through a module helper',
      code: `export const Route = createFileRoute('/posts')({
  loader: () => 'data',
  component: Page,
})
function Comments() {
  return <p>{Route.useLoaderData()}</p>
}
export function Page() {
  return <Hydrate><Comments /></Hydrate>
}`,
      rendered: '[<p>data</p>]',
    },
    {
      name: 'exported under a specifier',
      code: `const Route = createFileRoute('/posts')({ component: Page })
export { Route }
export function Page() {
  return <Hydrate><p>{Route.id}</p></Hydrate>
}`,
      rendered: '[<p>/posts</p>]',
    },
    {
      name: 'exported as default',
      code: `const Route = createFileRoute('/posts')({ component: Page })
export default Route
export function Page() {
  return <Hydrate><p>{Route.id}</p></Hydrate>
}`,
      rendered: '[<p>/posts</p>]',
    },
    {
      name: 'exported under a string name',
      code: `const Route = createFileRoute('/posts')({ component: Page })
export { Route as 'the-route' }
export function Page() {
  return <Hydrate><p>{Route.id}</p></Hydrate>
}`,
      rendered: '[<p>/posts</p>]',
    },
  ])(
    'client: split children reading Route $name use the one route',
    async ({ code, rendered }) => {
      const created: Array<string> = []
      const { module, lazyChunks } = await loadClientModule(
        `${head}import { createFileRoute } from '@tanstack/react-router'
${code}`,
        { stubs: routerStub(created) },
      )
      expect(module.Page()).toBe(rendered)
      expect(created).toEqual(['/posts'])
      expectRenderedThroughChunks(lazyChunks)
    },
  )

  // Bug (same removal): split children reading a `Route` the module does
  // not export reference an undeclared binding. A chunk cannot import it, so
  // a clear compile error is a valid fix, like rendering with the one route.
  // Impact: the boundary throws "Route is not defined" when it hydrates.
  // Source: #8504 hydrate-split-modules.test.ts "children reading a Route
  // the module does not export are rejected"
  test.fails(
    'client: split children reading an unexported Route are rejected clearly or use the one route',
    async () => {
      const code = `${head}import { createFileRoute } from '@tanstack/react-router'
const Route = createFileRoute('/posts')({ component: Page })
export function Page() {
  return <Hydrate><p>{Route.id}</p></Hydrate>
}`
      const compiled = await compileHydrate('client', code).catch(
        (error: Error) => error,
      )
      if (compiled instanceof Error) {
        expect(compileErrorMessage(compiled)).toMatch(rejections.Route)
        return
      }
      const created: Array<string> = []
      const { module } = await loadClientModule(code, {
        stubs: routerStub(created),
      })
      expect(module.Page()).toBe('[<p>/posts</p>]')
      expect(created).toEqual(['/posts'])
    },
  )

  // Bug: the client chunk takes any module-level binding named `Route` for
  // the route and removes it (the removal of the pin above), even when the
  // module does not export it and it is a plain component.
  // Impact: the boundary throws "Route is not defined" when it hydrates.
  test.fails(
    'client: an unexported component named Route that the children render reaches the chunk',
    async () => {
      const { module, lazyChunks } =
        await loadClientModule(`${head}function Route() {
  return <p>local</p>
}
export function Page() {
  return <Hydrate><Route /></Hydrate>
}`)
      expect(module.Page()).toBe('[<p>local</p>]')
      expectRenderedThroughChunks(lazyChunks)
    },
  )

  // Bug: only declarations move into the chunk; the top-level statements that
  // complete them (member assignments, registrations) are dropped.
  // Impact: compound components such as `<Card.Title />` are undefined in
  // the chunk ("Element type is invalid") and registries are empty.
  // Source: Qwik optimizer should_not_move_over_side_effects,
  // example_drop_side_effects
  test.fails.each([
    {
      name: 'a compound component member assignment',
      setup: `function Card({ children }) { return <div>{children}</div> }
Card.Title = function Title() { return <h1>t</h1> }`,
      children: '<Card><Card.Title /></Card>',
      rendered: '[<div><h1>t</h1></div>]',
    },
    {
      name: 'Object.assign on a component',
      setup: `function Tabs({ children }) { return <ul>{children}</ul> }
Object.assign(Tabs, { Tab: () => <li>tab</li> })`,
      children: '<Tabs><Tabs.Tab /></Tabs>',
      rendered: '[<ul><li>tab</li></ul>]',
    },
    {
      name: 'a registry filled by a top-level call',
      setup: `const registry = new Map()
registry.set('a', 'A')`,
      children: `<p>{registry.get('a')}</p>`,
      rendered: '[<p>A</p>]',
    },
  ])(
    'client: $name that the children rely on reaches the chunk',
    async ({ setup, children, rendered }) => {
      const { module, lazyChunks } = await loadClientModule(`${head}${setup}
export function Page() {
  return <Hydrate>${children}</Hydrate>
}`)
      expect(module.Page()).toBe(rendered)
      expectRenderedThroughChunks(lazyChunks)
    },
  )

  // Bug: module bindings are collected from top-level declarations only
  // (`collectLocalBindingsFromStatement`), so a module-level `var` declared
  // in a nested block is dropped from the chunk. Same root cause as the
  // nested `var` pins in router-plugin/tests/known-bugs-code-splitter.test.ts.
  // Impact: the boundary throws "label is not defined" when it hydrates.
  test.fails(
    'client: a var declared in a nested block that the children read reaches the chunk',
    async () => {
      const { module, lazyChunks } = await loadClientModule(`${head}{
  var label = 'nested'
}
export function Page() {
  return <Hydrate><p>{label}</p></Hydrate>
}`)
      expect(module.Page()).toBe('[<p>nested</p>]')
      expectRenderedThroughChunks(lazyChunks)
    },
  )

  // Bug: a TypeScript import alias (`import Card = ui.Card`) used only by the
  // split children is not declared in the client chunk.
  // Impact: the chunk throws "Card is not defined" when the boundary
  // hydrates.
  // Source: React Compiler fixture ts-import-equals-declaration.ts
  test.fails(
    'client: a TypeScript import alias used by the split children is declared in the chunk',
    async () => {
      const { module, lazyChunks } = await loadClientModule(
        `${head}import { visible } from '@tanstack/react-start/hydration'
import * as ui from './ui'
import Card = ui.Card
function Panel() {
  return <Card title="hi" />
}
export function Page() {
  return <Hydrate when={visible()}><Panel /></Hydrate>
}`,
        {
          stubs: {
            './ui': {
              Card: (props: { title: string }) => `<b>${props.title}</b>`,
            },
          },
        },
      )
      expect(module.Page()).toBe('[<b>hi</b>]')
      expectRenderedThroughChunks(lazyChunks)
    },
  )

  // Bug: module-level declarations the children use are only moved into the
  // chunk for some declaration forms and uses: a default-exported function,
  // TypeScript enums and namespaces, and a `let` the children only assign
  // are neither declared in the chunk nor imported from the parent.
  // Impact: the boundary throws "DefaultFn is not defined" (or `Tone`,
  // `Labels`, `renders`) when it hydrates.
  // Source: Qwik optimizer example_exports, example_ts_enums,
  // should_preserve_let_when_migrated_into_segment; React Compiler fixture
  // should-bailout-without-compilation-annotation-mode.js (#8504
  // hydrate-split-modules.test.ts, red on main)
  test.fails.each([
    {
      name: 'a default-exported function',
      code: `export default function DefaultFn() { return 'default' }
export function Page() {
  return <Hydrate><p>{DefaultFn()}</p></Hydrate>
}`,
      rendered: ['[<p>default</p>]', '[<p>default</p>]'],
    },
    {
      name: 'TypeScript enums and namespaces',
      code: `export enum Tone { Loud = 'LOUD' }
namespace Labels { export const quiet = 'quiet' }
export function Page() {
  return <Hydrate><p>{Tone.Loud + ':' + Labels.quiet}</p></Hydrate>
}`,
      rendered: ['[<p>LOUD:quiet</p>]', '[<p>LOUD:quiet</p>]'],
    },
    {
      name: 'a let the children only assign',
      code: `let renders = 0
export function Page() {
  return <Hydrate><p>{(() => { renders = 'set' })()}</p></Hydrate>
}`,
      rendered: ['[<p></p>]', '[<p></p>]'],
    },
  ])(
    'client: $name used by the children reaches the chunk',
    async ({ code, rendered }) => {
      const { module, lazyChunks } = await loadClientModule(`${head}${code}`)
      expect([module.Page(), module.Page()]).toEqual(rendered)
      expectRenderedThroughChunks(lazyChunks)
    },
  )

  // Bug: the chunk keeps the module-level bindings the children name (by
  // name, even when a local shadows them) under their own names, so a
  // binding named like one the compiler generates in the chunk (its export)
  // collides with it.
  // Impact: compiling the chunk fails ("Duplicate declaration"), so the
  // build fails.
  test.fails.each([
    {
      name: 'helpers the children call',
      module: (name: string) =>
        `function ${name}() { return 'module:${name}' }`,
      local: () => '',
      read: (name: string) => `${name}()`,
      value: (name: string) => `module:${name}`,
    },
    {
      name: 'bindings the children shadow with locals',
      module: (name: string) => `const ${name} = 'module:${name}'`,
      local: (name: string) => `const ${name} = 'local:${name}'`,
      read: (name: string) => name,
      value: (name: string) => `local:${name}`,
    },
  ])(
    'client: module-level $name, named like the generated bindings, do not collide',
    async ({ module: declare, local, read, value }) => {
      const page = (
        names: Array<string>,
      ) => `${head}${names.map(declare).join('\n')}
export function Page() {
  ${names.map(local).join('\n  ')}
  return <><Hydrate prefetch><p>{[${names.map(read).join(', ')}].join('|')}</p></Hydrate><Hydrate><section><Hydrate><b>nested</b></Hydrate></section></Hydrate></>
}`
      // Whichever names the compiler picks for this page.
      const names = await generatedNames(page([]))
      const { module, lazyChunks } = await loadClientModule(page(names))
      expect(module.Page()).toBe(
        `[<p>${names.map(value).join('|')}</p>][<section>[<b>nested</b>]</section>]`,
      )
      expectRenderedThroughChunks(lazyChunks)
    },
  )

  /** Preact's `h`, rendering intrinsic elements as `<h:tag>`. */
  const preact = {
    h: (type: unknown, props: object | null, ...children: Array<unknown>) => {
      const text = children.flat(Infinity).join('')
      if (typeof type === 'function') {
        return type(children.length ? { ...props, children: text } : props)
      }
      return `<h:${String(type)}>${text}</h:${String(type)}>`
    },
  }
  const pragmaModule = `/** @jsx h */
import { h } from 'preact'
${head}export function Page() {
  return <div><Hydrate><p>{h('i', null)}</p></Hydrate></div>
}`
  const pragmaHtml = '<h:div>[<h:p><h:i></h:i></h:p>]</h:div>'

  // Control for the JSX pragma pin below (same rendering).
  test('server: a module with a classic JSX pragma renders through its factory', async () => {
    const { parent } = await compileHydrate('server', pragmaModule)
    const { Page } = await evaluateModule(
      parent,
      { ...hydrateParentStubs, preact },
      { runtime: reactRuntime },
    )
    expect(Page()).toBe(pragmaHtml)
  })

  // Bug: dead-code elimination does not count a classic JSX pragma
  // (`/** @jsx h */`) as a use of the factory it names, so the client parent
  // drops the factory import once the children that call it are split (the
  // generated code also lands above the pragma comment, where Oxc no longer
  // reads it). Same root cause as the JSX pragma pins in
  // known-bugs-start-compiler.test.ts and
  // router-plugin/tests/known-bugs-code-splitter.test.ts.
  // Impact: the client renders the parent's JSX through another factory than
  // the server (a hydration mismatch), or throws "h is not defined".
  test.fails(
    'client: a module with a classic JSX pragma renders through its factory',
    async () => {
      const { module, lazyChunks } = await loadClientModule(pragmaModule, {
        stubs: { preact },
      })
      expect(settle(() => module.Page())).toBe(pragmaHtml)
      expectRenderedThroughChunks(lazyChunks)
    },
  )
})
