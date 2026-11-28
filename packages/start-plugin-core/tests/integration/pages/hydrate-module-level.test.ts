/**
 * `<Hydrate>` splits of module-level code the split children use, where main is wrong
 * (the other pins are in hydrate-ids-and-captures.test.ts; two files, to keep
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
import { beforeAll, describe, expect, test } from 'vitest'
import { closeAfterAll } from '../../file-end'
import {
  createHydrateHost,
  expectRendersLikeSource,
  renderServer,
  renderSource,
} from '../../render'
import { generatedNames } from '../../hydrate-helpers'
import type { HydrateHost } from '../../render'

let hosts: HydrateHost
const openHosts = closeAfterAll()
beforeAll(async () => {
  hosts = await openHosts(() => createHydrateHost())
}, 60_000)

const head = `import { Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
`

describe('module-level code used by the children', () => {
  // (First: its failure takes the page run bound, and the other tests run
  // meanwhile.)
  // On main, compiling the chunk fails ("Duplicate declaration"), so the build
  // fails.
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
      const names = await generatedNames(hosts, page([], true))
      const { client } = await expectRendersLikeSource(hosts, page(names))
      expect(client.html).toContain(`<p>${names.map(value).join('|')}</p>`)
      expect(client.html).toContain('<b>nested</b>')
    },
    // A failed split module makes the dev server reload the page (runs again)
    20_000,
  )

  // On main, the boundary throws "Route is not defined" when it hydrates.
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
        hosts,
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

  // On main, the boundary throws "Route is not defined" when it hydrates.
  test('client: an unexported component named Route that the children render reaches the chunk', async () => {
    const { client } = await expectRendersLikeSource(
      hosts,
      `${head}function Route() {
  return <p>local</p>
}
export function Page() {
  return <Hydrate when={load()}><Route /></Hydrate>
}`,
    )
    expect(client.html).toContain('<p>local</p>')
  })

  // On main, the boundary throws "label is not defined" when it hydrates.
  test('client: a var declared in a nested block that the children read reaches the chunk', async () => {
    const { client } = await expectRendersLikeSource(
      hosts,
      `${head}try {
  var label = JSON.parse('"nested"')
} catch {}
export function Page() {
  return <Hydrate when={load()}><p>{label}</p></Hydrate>
}`,
    )
    expect(client.html).toContain('<p>nested</p>')
  })

  // On main, the chunk throws "Card is not defined" when the boundary hydrates.
  // Source: React Compiler fixture ts-import-equals-declaration.ts
  test('client: a TypeScript import alias used by the split children is declared in the chunk', async () => {
    const { client } = await expectRendersLikeSource(
      hosts,
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

  // On main, the boundary throws "DefaultFn is not defined" (or `Tone`,
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
        hosts,
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
    const source = await renderSource(hosts, pragmaModule, {
      files: pragmaFiles,
    })
    expect(source.html).toContain('<div data-h="">')
    expect(source.html).toContain('<p data-h=""><i data-h=""></i></p>')
    expect(
      (await renderServer(hosts, pragmaModule, { files: pragmaFiles })).html,
    ).toBe(source.html)
  })
})
