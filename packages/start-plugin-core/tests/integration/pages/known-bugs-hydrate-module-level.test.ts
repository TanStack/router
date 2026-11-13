/**
 * Known `<Hydrate>` split bugs of module-level code the split children use
 * (the other pins are in known-bugs-hydrate.test.ts; two files, to keep
 * each within the per-file time budget). Each test asserts the correct
 * behaviour for a bug of main's Babel transform; the Yuku Hydrate planner
 * fixes every one of them (former `.fails` pins, kept as regression tests).
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
  expectRendersLikeSource,
  renderServer,
  renderSource,
  useHydrateHost,
} from '../../render'
import { generatedNames } from '../../hydrate-helpers'

const hosts = useHydrateHost()

const head = `import { Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
`

describe('module-level code used by the children', () => {
  // (First: its failure takes the page run bound, and the other tests run
  // meanwhile.)
  // Bug: the chunk keeps the module-level bindings the children name (by
  // name, even when a local shadows them) under their own names, so a
  // binding named like one the compiler generates in the chunk (its export)
  // collides with it.
  // Impact: compiling the chunk fails ("Duplicate declaration"), so the
  // build fails.
  test.each([
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
      /** The page; the `probe` page's children also read a local. */
      const page = (
        names: Array<string>,
        probe = false,
      ) => `${head}import { idle } from '@tanstack/react-start/hydration'
${names.map(declare).join('\n')}
export function Page() {
  ${probe ? `const captured = 'c'\n  ` : ''}${names.map(local).join('\n  ')}
  return <><Hydrate when={load()} prefetch={idle()}><p>{[${[...(probe ? ['captured'] : []), ...names.map(read)].join(', ')}].join('|')}</p></Hydrate><Hydrate when={load()}><section><Hydrate when={load()}><b>nested</b></Hydrate></section></Hydrate></>
}`
      // Whichever names the compiler picks for this page, including the
      // names it passes captured values under (none is a valid choice: then
      // nothing can collide).
      const names = await generatedNames(await hosts(), page([], true))
      const { client } = await expectRendersLikeSource(
        await hosts(),
        page(names),
      )
      expect(client.html).toContain(`<p>${names.map(value).join('|')}</p>`)
      expect(client.html).toContain('<b>nested</b>')
    },
    // A failed split module makes the dev server reload the page (runs again)
    20_000,
  )

  // Bug: the chunk re-declares the module-level bindings the children use
  // instead of using the parent module's instance.
  // Impact: children read another context than the parent provides, or the
  // initial value of a `let` the parent reassigns.
  // Source: Qwik optimizer should_keep_module_level_var_used_in_both_main_and_qrl,
  // should_auto_export_shared_let_kept_in_parent
  test.each([
    {
      name: 'context',
      code: `import { createContext, useContext } from 'react'
const Theme = createContext('light')
function Label() { return <span>{useContext(Theme)}</span> }
export function Page() {
  return <Theme.Provider value="dark"><Hydrate when={load()}><Label /></Hydrate></Theme.Provider>
}`,
      // The value the parent provides.
      rendered: '<span>dark</span>',
    },
    {
      name: 'let reassigned by the parent',
      code: `let clicks = 0
export function bump() { clicks++ }
export function Page() {
  return <Hydrate when={load()}><p>{clicks}</p></Hydrate>
}`,
      rendered: '<p>1</p>',
    },
  ])(
    'client: the children use the module-level $name of the parent module',
    async ({ code, rendered }) => {
      const { client } = await expectRendersLikeSource(
        await hosts(),
        `${head}${code}`,
        {
          // App code runs before the boundary hydrates.
          beforeRender: 'm.bump?.()',
        },
      )
      expect(client.html).toContain(rendered)
    },
  )

  // Bug (same root cause): an exported declaration the children use is
  // copied into the chunk, so its initializer runs again there.
  // Impact: the children use another instance than the module exports
  // (e.g. another store), and the initializer's side effects run twice.
  // Goal of hydrate-when-transform.test.ts "unwraps exported declarations
  // needed by extracted virtual modules" (the copy is not required).
  test('client: an exported declaration the children use has one instance, initialized once', async () => {
    const { client } = await expectRendersLikeSource(
      await hosts(),
      `${head}import { makeStore } from './store'
export const store = makeStore()
export function Page() {
  return <Hydrate when={load()}><p>{store.id}</p></Hydrate>
}`,
      {
        // Each store gets the next id: a second instance renders 2.
        files: {
          './store': `let stores = 0
export const makeStore = () => ({ id: ++stores })`,
        },
        script: 'return m.store.id',
      },
    )
    expect(client.result).toBe(1)
    expect(client.html).toContain('<p>1</p>')
  })

  // Bug: the client chunk removes the module's `Route`
  // (`removeModuleLevelBindings(ast, new Set(['Route']))`) without importing
  // it from the parent module, so split children reading it reference an
  // undeclared binding.
  // Impact: the boundary throws "Route is not defined" when it hydrates.
  // Source: #8504 hydrate-split-modules.test.ts (rows directly, through a
  // module helper and exported under a specifier; red on main)
  test.each([
    {
      name: 'directly',
      code: `export const Route = createFileRoute('/posts')({ component: Page })
export function Page() {
  return <Hydrate when={load()}><p>{Route.options.id}</p></Hydrate>
}`,
      rendered: '<p>/posts</p>',
    },
    {
      name: 'through a module helper',
      code: `export const Route = createFileRoute('/posts')({
  loader: () => 'data',
  component: Page,
})
function Comments() {
  return <p>{Route.options.loader() + ':' + Route.options.id}</p>
}
export function Page() {
  return <Hydrate when={load()}><Comments /></Hydrate>
}`,
      rendered: '<p>data:/posts</p>',
    },
    {
      name: 'exported under a specifier',
      code: `const Route = createFileRoute('/posts')({ component: Page })
export { Route }
export function Page() {
  return <Hydrate when={load()}><p>{Route.options.id}</p></Hydrate>
}`,
      rendered: '<p>/posts</p>',
    },
  ])(
    'client: split children reading Route $name use the one route',
    async ({ code, rendered }) => {
      const { client } = await expectRendersLikeSource(
        await hosts(),
        `${head}import { createFileRoute } from '@tanstack/react-router'
${code}`,
        {
          // The route tree updates the module's route (routeTree.gen.ts):
          // the children read the route the module exports.
          beforeRender: `m.Route.update({ id: '/posts' })`,
        },
      )
      expect(client.html).toContain(rendered)
    },
  )

  // Bug: the client chunk takes any module-level binding named `Route` for
  // the route and removes it (the removal of the pins above), even when the
  // module does not export it and it is a plain component.
  // Impact: the boundary throws "Route is not defined" when it hydrates.
  test('client: an unexported component named Route that the children render reaches the chunk', async () => {
    const { client } = await expectRendersLikeSource(
      await hosts(),
      `${head}function Route() {
  return <p>local</p>
}
export function Page() {
  return <Hydrate when={load()}><Route /></Hydrate>
}`,
    )
    expect(client.html).toContain('<p>local</p>')
  })

  // Bug: only declarations move into the chunk; the top-level statements that
  // complete them (member assignments, registrations) are dropped.
  // Impact: compound components such as `<Card.Title />` are undefined in
  // the chunk ("Element type is invalid") and registries are empty.
  // Source: Qwik optimizer should_not_move_over_side_effects,
  // example_drop_side_effects
  test.each([
    {
      name: 'a compound component member assignment',
      setup: `function Card({ children }) { return <div>{children}</div> }
Card.Title = function Title() { return <h1>t</h1> }`,
      children: '<Card><Card.Title /></Card>',
      rendered: '<div><h1>t</h1></div>',
    },
    {
      name: 'Object.assign on a component',
      setup: `function Tabs({ children }) { return <ul>{children}</ul> }
Object.assign(Tabs, { Tab: () => <li>tab</li> })`,
      children: '<Tabs><Tabs.Tab /></Tabs>',
      rendered: '<ul><li>tab</li></ul>',
    },
    {
      name: 'a registry filled by a top-level call',
      setup: `const registry = new Map()
registry.set('a', 'A')`,
      children: `<p>{registry.get('a')}</p>`,
      rendered: '<p>A</p>',
    },
  ])(
    'client: $name that the children rely on reaches the chunk',
    async ({ setup, children, rendered }) => {
      const { client } = await expectRendersLikeSource(
        await hosts(),
        `${head}${setup}
export function Page() {
  return <Hydrate when={load()}>${children}</Hydrate>
}`,
      )
      expect(client.html).toContain(rendered)
    },
  )

  // Bug: module bindings are collected from top-level declarations only
  // (`collectLocalBindingsFromStatement`), so a module-level `var` declared
  // in a nested block is dropped from the chunk. Same root cause as the
  // nested `var` pins in router-plugin/tests/known-bugs-code-splitter.test.ts.
  // Impact: the boundary throws "label is not defined" when it hydrates.
  test('client: a var declared in a nested block that the children read reaches the chunk', async () => {
    const { client } = await expectRendersLikeSource(
      await hosts(),
      `${head}try {
  var label = JSON.parse('"nested"')
} catch {}
export function Page() {
  return <Hydrate when={load()}><p>{label}</p></Hydrate>
}`,
    )
    expect(client.html).toContain('<p>nested</p>')
  })

  // Bug: a TypeScript import alias (`import Card = ui.Card`) used only by the
  // split children is not declared in the client chunk.
  // Impact: the chunk throws "Card is not defined" when the boundary
  // hydrates.
  // Source: React Compiler fixture ts-import-equals-declaration.ts
  test('client: a TypeScript import alias used by the split children is declared in the chunk', async () => {
    const { client } = await expectRendersLikeSource(
      await hosts(),
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
        files: {
          './ui': `export const Card = (props: { title: string }) => <b>{props.title}</b>`,
        },
      },
    )
    expect(client.html).toContain('<b>hi</b>')
  })

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
  test.each([
    {
      name: 'a default-exported function',
      code: `export default function DefaultFn() { return 'default' }
export function Page() {
  return <Hydrate when={load()}><p>{DefaultFn()}</p></Hydrate>
}`,
      rendered: '<p>default</p>',
    },
    {
      name: 'TypeScript enums and namespaces',
      code: `export enum Tone { Loud = 'LOUD' }
namespace Labels { export const quiet = 'quiet' }
export function Page() {
  return <Hydrate when={load()}><p>{Tone.Loud + ':' + Labels.quiet}</p></Hydrate>
}`,
      rendered: '<p>LOUD:quiet</p>',
    },
    {
      name: 'a let the children only assign',
      code: `let renders = 0
export function Page() {
  return <Hydrate when={load()}><p>{(() => { renders = 1 })()}</p></Hydrate>
}`,
      rendered: '<p></p>',
    },
  ])(
    'client: $name used by the children reaches the chunk',
    async ({ code, rendered }) => {
      // Rendered twice.
      const { client } = await expectRendersLikeSource(
        await hosts(),
        `${head}${code}`,
        {
          render: '[h(m.Page, { key: 1 }), h(m.Page, { key: 2 })]',
        },
      )
      expect(client.html).toContain(rendered)
    },
  )

  /**
   * A module rendering through a classic JSX pragma naming a factory of the
   * app (`./h`, which marks every element it creates with `data-h`), like
   * Emotion's `jsx`; the children also call the factory directly.
   */
  const pragmaModule = `/** @jsxRuntime classic */
/** @jsx h */
import { h } from './h'
${head}export function Page() {
  return <div><Hydrate when={load()}><p>{h('i', null)}</p></Hydrate></div>
}`
  const pragmaFiles = {
    './h': `import { createElement } from 'react'
export function h(type, props, ...children) {
  return createElement(type, { ...props, 'data-h': '' }, ...children)
}`,
  }

  // Control for the JSX pragma pin below (same rendering).
  test('server: a module with a classic JSX pragma renders through its factory', async () => {
    const source = await renderSource(await hosts(), pragmaModule, {
      files: pragmaFiles,
    })
    expect(source.html).toContain('<div data-h="">')
    expect(source.html).toContain('<p data-h=""><i data-h=""></i></p>')
    expect(
      (await renderServer(await hosts(), pragmaModule, { files: pragmaFiles }))
        .html,
    ).toBe(source.html)
  })

  // Bug: dead-code elimination does not count a classic JSX pragma
  // (`/** @jsx jsx */`) as a use of the factory it names, so the client parent
  // drops the factory import once the children that call it are split (the
  // generated code also lands above the pragma comment, where Oxc no longer
  // reads it). Same root cause as the JSX pragma pins in
  // known-bugs-start-compiler.test.ts and
  // router-plugin/tests/known-bugs-code-splitter.test.ts.
  // Impact: the client renders the parent's JSX through another factory than
  // the server (a hydration mismatch), or throws "h is not defined". In a
  // project whose default JSX runtime is classic, Oxc then compiles the
  // parent's JSX to `React.createElement` without `React` in scope.
  test('client: a module with a classic JSX pragma renders through its factory', async () => {
    const { client } = await expectRendersLikeSource(
      await hosts(),
      pragmaModule,
      {
        files: pragmaFiles,
      },
    )
    expect(client.html).toContain('<div data-h="">')
  }, 20_000)
})
