/**
 * Known `<Hydrate>` split bugs. Each test asserts correct behaviour for a bug
 * on main and is marked .fails; remove .fails when the bug is fixed.
 */
import { describe, expect, test } from 'vitest'
import {
  compileErrorMessage,
  compileHydrate,
  createStartCompiler,
  evaluateModule,
  getBoundaryIds,
  getChunkIds,
  hydrateParentStubs,
  loadChunk,
  loadClientModule as loadHydrateClient,
  renderBoundaries,
  settle,
} from './regression-helpers'
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
      `${head}import { useId } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { load } from './data'
export const Route = createFileRoute('/')({ component: Page })
export async function Page() {
  return <Hydrate><p id={useId()}>{arguments[0]}{Route.id}{await load()}</p></Hydrate>
}`,
    ).catch((caught: unknown) => caught)
    const message = compileErrorMessage(error)
    expect(message).toMatch(/calls hooks/)
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
      boundaries: 1,
    },
    {
      name: 'mutually recursive components',
      code: `function Branch({ depth }) { return depth ? <Leaf depth={depth - 1} /> : null }
export function Leaf({ depth }) {
  return <Hydrate><Branch depth={depth} /></Hydrate>
}`,
      boundaries: 1,
    },
    {
      name: 'a component with its own boundary inside another boundary',
      code: `function Widget() { return <Hydrate><b>widget</b></Hydrate> }
export function Page() {
  return <Hydrate><section><Widget /></section></Hydrate>
}`,
      boundaries: 2,
    },
  ])(
    'client: $name keeps boundary ids aligned with the server',
    async ({ code, boundaries }) => {
      // Each boundary is rendered with a static id.
      const server = await compileHydrate('server', `${head}${code}`)
      const serverIds = getBoundaryIds(server.parent)
      expect(serverIds).toHaveLength(boundaries)
      const { parent, plugin } = await compileHydrate(
        'client',
        `${head}${code}`,
      )
      expect(getBoundaryIds(parent)).not.toEqual([])
      for (const id of getBoundaryIds(parent)) {
        expect(serverIds).toContain(id)
      }
      // The bundler compiles each chunk it loads like any other module.
      for (const chunkId of getChunkIds(parent)) {
        const { compile } = createStartCompiler({
          env: 'client',
          compilerPlugins: [plugin],
        })
        const loaded = loadChunk(plugin, 'client', chunkId)!
        const chunk = (await compile(loaded, chunkId)) ?? loaded
        expect(await getModuleErrors(chunk)).toEqual([])
        // Every boundary the chunk renders (if it declares a component with
        // a boundary again) has a static id the server emitted.
        const chunkIds = getBoundaryIds(chunk)
        expect(chunkIds).toHaveLength(chunk.match(/\sh=/g)?.length ?? 0)
        for (const id of chunkIds) {
          expect(serverIds).toContain(id)
        }
        for (const id of getChunkIds(chunk)) {
          expect(loadChunk(plugin, 'client', id), id).not.toBeNull()
        }
      }
    },
  )

  // Bug: Hydrate elements are matched by name instead of by binding.
  // Impact: `<Start.Hydrate>` of a namespace import is not split (no boundary
  // id), and a local component named `Hydrate` is split into a lazy chunk.
  test.fails.each([
    {
      name: 'a namespace-imported <Start.Hydrate> is split',
      code: `import * as Start from '@tanstack/react-start'
export function Page() {
  return <Start.Hydrate><p>child</p></Start.Hydrate>
}`,
      render: (module: Record<string, any>) => ({ page: module.Page() }),
      expected: { page: '[<p>child</p>]', chunks: 1 },
    },
    {
      name: 'a local component named Hydrate is left alone',
      code: `${head}export function Page() {
  return <Hydrate><p>real</p></Hydrate>
}
export function Local() {
  const Hydrate = (props: { children: unknown }) => props.children
  return <Hydrate><p>local</p></Hydrate>
}`,
      render: (module: Record<string, any>) => ({
        page: module.Page(),
        local: module.Local(),
      }),
      expected: { page: '[<p>real</p>]', local: '<p>local</p>', chunks: 1 },
    },
  ])('client: $name', async ({ code, render, expected }) => {
    const { module, lazyChunks } = await loadClientModule(code)
    expect({ ...render(module), chunks: lazyChunks.length }).toEqual(expected)
  })

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
            reactRuntime,
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
  // Expected fix: rename only the reserved `key`/`ref` props; other captures
  // keep their names as chunk props, which hydrate-captures.test.ts relies on.
  test.fails(
    'client: captured locals named key and ref reach the split children',
    async () => {
      const { module } = await loadClientModule(`${head}export function Page() {
  const key = 'k'
  const ref = 'r'
  return <Hydrate><p>{key}{ref}</p></Hydrate>
}`)
      expect(module.Page()).toBe('[<p>kr</p>]')
    },
  )

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
      const { module } = await loadClientModule(code)
      expect(module.Page({ items: ['a', 'b'] })).toBe(rendered)
      const server = await compileHydrate('server', code)
      expect(await getModuleErrors(server.parent)).toEqual([])
    },
  )

  // Bug: hook calls are only detected when the callee is a bare identifier,
  // so `React.useId()` in the children moves into the chunk component.
  // Impact: the hook runs in another component on the client than on the
  // server (`useId` mismatches, hydration errors).
  // Source: Qwik optimizer example_use_optimization
  test.fails(
    'client: a hook called through a namespace in the children is rejected',
    async () => {
      await expect(
        compileHydrate(
          'client',
          `import * as React from 'react'
${head}export function Page() {
  return <Hydrate><p id={React.useId()}>x</p></Hydrate>
}`,
        ),
      ).rejects.toThrow(/hook/i)
    },
  )

  // Bug: split children containing `await` (async server components) are
  // moved as is into the synchronous chunk component the client compile
  // emits, while the server renders them inline.
  // Impact: the chunk does not parse (`await` outside an async function) and
  // the client build fails without saying why. React client components cannot
  // be async, so the fix is a clear compile-time error.
  test.fails(
    'client: await in split children is rejected clearly',
    async () => {
      const compiled = await compileHydrate(
        'client',
        `${head}import { load } from './data'
export async function Page() {
  return <Hydrate><p>{await load()}</p></Hydrate>
}`,
      ).catch((error: Error) => error)
      if (!(compiled instanceof Error)) {
        // What happens on main: the emitted chunk is not a valid module.
        for (const chunk of compiled.chunks) {
          expect(await getModuleErrors(chunk)).toEqual([])
        }
      }
      expect(compiled).toBeInstanceOf(Error)
      expect(compileErrorMessage(compiled)).toMatch(rejections.await)
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
      const { module } = await loadClientModule(`${head}${code}`, {
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
    },
  )

  // Bug: the client chunk removes the module's `Route`
  // (`removeModuleLevelBindings(ast, new Set(['Route']))`) without importing
  // it from the parent module, so split children reading it reference an
  // undeclared binding.
  // Impact: the boundary throws "Route is not defined" when it hydrates.
  // Rejecting it at compile time with a clear error is a valid fix.
  test.fails(
    'client: split children reading Route use the route of the parent module',
    async () => {
      const loaded = await loadClientModule(
        `${head}import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: Page })
export function Page() {
  return <Hydrate><p>{Route.id}</p></Hydrate>
}`,
        {
          stubs: {
            '@tanstack/react-router': {
              createFileRoute: (id: string) => (options: unknown) => ({
                id,
                options,
              }),
            },
          },
        },
      ).catch((error: Error) => error)
      if (loaded instanceof Error) {
        expect(compileErrorMessage(loaded)).toMatch(rejections.Route)
        return
      }
      expect(loaded.module.Page()).toBe('[<p>/</p>]')
    },
  )

  // Bug: the client chunk takes any module-level binding named `Route` for
  // the route and removes it (the removal of the pin above), even when the
  // module does not export it and it is a plain component.
  // Impact: the boundary throws "Route is not defined" when it hydrates.
  test.fails(
    'client: an unexported component named Route that the children render reaches the chunk',
    async () => {
      const { module } = await loadClientModule(`${head}function Route() {
  return <p>local</p>
}
export function Page() {
  return <Hydrate><Route /></Hydrate>
}`)
      expect(module.Page()).toBe('[<p>local</p>]')
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
      const { module } = await loadClientModule(`${head}${setup}
export function Page() {
  return <Hydrate>${children}</Hydrate>
}`)
      expect(module.Page()).toBe(rendered)
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
      const { module } = await loadClientModule(`${head}{
  var label = 'nested'
}
export function Page() {
  return <Hydrate><p>{label}</p></Hydrate>
}`)
      expect(module.Page()).toBe('[<p>nested</p>]')
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
      const { module } = await loadClientModule(
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
    },
  )

  // Bug: a module-level helper moved into the chunk keeps its name, so a
  // helper named like the generated chunk export (`H0`) collides with it.
  // Impact: the chunk is not a valid module and the build fails.
  test.fails(
    'client: a helper named like the generated chunk export does not collide',
    async () => {
      const { module } =
        await loadClientModule(`${head}function H0() { return <b>helper</b> }
export function Page() {
  return <Hydrate><H0 /></Hydrate>
}`)
      expect(module.Page()).toBe('[<b>helper</b>]')
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
      reactRuntime,
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
      const { module } = await loadClientModule(pragmaModule, {
        stubs: { preact },
      })
      expect(settle(() => module.Page())).toBe(pragmaHtml)
    },
  )
})
