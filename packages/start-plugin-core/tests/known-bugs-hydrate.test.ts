/**
 * Known `<Hydrate>` split bugs. Each test asserts correct behaviour for a bug
 * on main and is marked .fails; remove .fails when the bug is fixed.
 */
import { describe, expect, test } from 'vitest'
import {
  compileFirstChunk,
  compileHydrate,
  evaluateModule,
  getBoundaryIds,
  getChunkIds,
  hydrateParentStubs,
  importSources,
  loadChunk,
  renderChunk,
} from './regression-helpers'
import { getModuleErrors } from './validate-module'
import type { ModuleStub } from './regression-helpers'

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
 * loaded: each lazy chunk component renders the chunk export it loads.
 * Chunk imports of project modules without a stub are linked to the parent
 * module, so the chunk may share the parent's bindings however it imports
 * them. `beforeChunksLoad` runs app code between the two.
 */
async function loadClientModule(
  code: string,
  options: {
    stubs?: Record<string, ModuleStub>
    beforeChunksLoad?: (module: Record<string, any>) => void
  } = {},
) {
  const { parent, chunks } = await compileHydrate('client', code)
  const lazyChunks: Array<{ name: string; rendered: boolean }> = []
  const chunkExports: Record<string, (props: unknown) => unknown> = {}
  const userStubs = options.stubs ?? {}
  const stubs: Record<string, ModuleStub> = {
    ...hydrateParentStubs,
    ...userStubs,
    '@tanstack/react-router': {
      ...(userStubs['@tanstack/react-router'] as Record<string, unknown>),
      lazyRouteComponent: (_load: unknown, name = 'default') => {
        const lazyChunk = { name, rendered: false }
        lazyChunks.push(lazyChunk)
        return (props: unknown) => {
          lazyChunk.rendered = true
          return chunkExports[name]!(props)
        }
      },
    },
  }
  expect(await getModuleErrors(parent)).toEqual([])
  const module = await evaluateModule(parent, stubs, reactRuntime)
  options.beforeChunksLoad?.(module)
  for (const chunk of chunks) {
    expect(await getModuleErrors(chunk)).toEqual([])
    const parentLinks = importSources(chunk)
      .filter((source) => !(source in stubs))
      .map((source) => [source, module])
    Object.assign(
      chunkExports,
      await evaluateModule(
        chunk,
        { ...stubs, ...Object.fromEntries(parentLinks) },
        reactRuntime,
      ),
    )
  }
  return { module, lazyChunks }
}

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
      const server = await compileHydrate('server', code)
      const { parent, plugin } = await compileHydrate('client', code)
      const serverIds = getBoundaryIds(server.parent)
      expect(serverIds).toHaveLength(2)
      expect(getBoundaryIds(parent)).toEqual(expect.arrayContaining(serverIds))
      const rendered: Array<unknown> = []
      for (const id of serverIds) {
        const chunkId = getChunkIds(parent).find((chunk) =>
          chunk.endsWith(`=${id}`),
        )
        expect(chunkId, id).toBeDefined()
        rendered.push(await renderChunk(loadChunk(plugin, 'client', chunkId!)!))
      }
      expect(rendered).toEqual(['<p>outer</p>', '<p>second</p>'])
    },
  )

  // Bug: a component rendered inside its own boundary is copied into the
  // chunk, and compiling the chunk numbers the copy's boundary after the
  // chunk's own index.
  // Impact: nested boundaries of recursive components (trees, threads) render
  // ids the server never emitted and lazy-load boundaries that do not exist.
  // Source: Qwik optimizer root_level_self_referential_qrl,
  // example_self_referential_component_migration
  test.fails.each([
    {
      name: 'a self-recursive component',
      code: `export function Tree({ node }) {
  return <li>{node.label}<Hydrate><ul>{node.children.map((child) => <Tree node={child} />)}</ul></Hydrate></li>
}`,
    },
    {
      name: 'mutually recursive components',
      code: `function Branch({ depth }) { return depth ? <Leaf depth={depth - 1} /> : null }
export function Leaf({ depth }) {
  return <Hydrate><Branch depth={depth} /></Hydrate>
}`,
    },
  ])(
    'client: $name keeps boundary ids aligned with the server',
    async ({ code }) => {
      const server = await compileHydrate('server', `${head}${code}`)
      const serverIds = new Set(getBoundaryIds(server.parent))
      const { parent, chunks, plugin } = await compileHydrate(
        'client',
        `${head}${code}`,
      )
      expect(chunks).toHaveLength(1)
      // The bundler compiles the loaded chunk like any other module.
      const chunk = (await compileFirstChunk(plugin, parent)).code ?? chunks[0]!
      expect(await getModuleErrors(chunk)).toEqual([])
      for (const id of [...getBoundaryIds(parent), ...getBoundaryIds(chunk)]) {
        expect(serverIds).toContain(id)
      }
      for (const id of getChunkIds(chunk)) {
        expect(loadChunk(plugin, 'client', id), id).not.toBeNull()
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
})

describe('values captured by the children', () => {
  // Bug: captured locals are passed to the lazy chunk component as props of
  // the same name, so locals named `key` or `ref` become React's `key`/`ref`.
  // Impact: the split children render without those values.
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
  // Source: SolidStart validate.ts "rejects `arguments` in an arrow inside a
  // function"
  test.fails(
    "client: split children reading the component's arguments render its props",
    async () => {
      const loaded = await loadClientModule(`${head}export function Page() {
  return <Hydrate><p>{arguments[0].title}</p></Hydrate>
}`).catch((error: Error) => error)
      if (loaded instanceof Error) {
        expect(loaded.message).toMatch(/Hydrate.*arguments/)
        return
      }
      expect(loaded.module.Page({ title: 'Hello' })).toBe('[<p>Hello</p>]')
    },
  )

  // Bug: any `this` in split children rejects the boundary ("Hydrate cannot
  // code-split JSX that captures this"), including the own `this` of a
  // function, class or method written inside the children.
  // Impact: valid code fails to build.
  // Source: Qwik optimizer issue_5008; SolidStart compile.spec.ts "allows
  // `this` and `arguments` in a function expression"
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
      const { module } =
        await loadClientModule(`${head}export function Page({ items }) {
  return <Hydrate>${children}</Hydrate>
}`)
      expect(module.Page({ items: ['a', 'b'] })).toBe(rendered)
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
  // moved into a synchronous chunk component.
  // Impact: the chunk is not a valid module and the build fails. A clear
  // compile-time error is a valid fix.
  test.fails(
    'client: await in split children never produces a broken chunk',
    async () => {
      const compiled = await compileHydrate(
        'client',
        `${head}import { load } from './data'
export async function Page() {
  return <Hydrate><p>{await load()}</p></Hydrate>
}`,
      ).catch((error: Error) => error)
      if (compiled instanceof Error) {
        expect(compiled.message).toMatch(/Hydrate.*(await|async)/)
        return
      }
      for (const chunk of compiled.chunks) {
        expect(await getModuleErrors(chunk)).toEqual([])
      }
    },
  )
})

describe('module-level code used by the children', () => {
  // Bug: the chunk cannot use the parent module's instance of module-level
  // bindings: it re-declares them, or drops `Route`.
  // Impact: children read another context than the parent provides, the
  // initial value of a `let` the parent reassigns, or throw on `Route`.
  // Source: Qwik optimizer should_keep_module_level_var_used_in_both_main_and_qrl,
  // should_auto_export_shared_let_kept_in_parent
  test.fails.each<{
    name: string
    code: string
    html: string
    rejection?: RegExp
  }>([
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
    {
      name: 'Route',
      code: `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: Page })
export function Page() {
  return <Hydrate><p>{Route.id}</p></Hydrate>
}`,
      html: '[<p>/</p>]',
      rejection: /Hydrate.*Route/,
    },
  ])(
    'client: the children use the module-level $name of the parent module',
    async ({ code, html, rejection }) => {
      let contexts = 0
      const loaded = await loadClientModule(`${head}${code}`, {
        stubs: {
          react: {
            createContext: () => ({
              Provider: (props: { children: unknown }) => props.children,
              instance: ++contexts,
            }),
            useContext: (context: { instance: number }) =>
              `context ${context.instance}`,
          },
          '@tanstack/react-router': {
            createFileRoute: (id: string) => (options: unknown) => ({
              id,
              options,
            }),
          },
        },
        // App code runs before the boundary hydrates.
        beforeChunksLoad: (module) => module.bump?.(),
      }).catch((error: Error) => error)
      if (loaded instanceof Error && rejection) {
        expect(loaded.message).toMatch(rejection)
        return
      }
      if (loaded instanceof Error) {
        throw loaded
      }
      expect(loaded.module.Page()).toBe(html)
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
})
