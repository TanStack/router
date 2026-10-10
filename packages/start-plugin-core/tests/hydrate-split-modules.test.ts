import { afterEach, describe, expect, test } from 'vitest'
import { createHydrateCompilerPlugin } from '../src/hydrate-when-transform'
import {
  compileCode,
  compileErrorMessage,
  compileFirstChunk,
  compileHydrate,
  directivePrologue,
  evaluateHydrateParent,
  evaluateModule,
  getBoundaryIds,
  getChunkComponent,
  getChunkIds,
  hydrateParentStubs,
  importSources,
  loadChunk,
  parentImportSources,
  renderChunk,
} from './regression-helpers'
import { declarationOf, getModuleErrors } from './validate-module'
import type { ModuleStub } from './regression-helpers'

// On the client `<Hydrate>` children move into a lazily loaded chunk module
// and the parent renders the chunk component in their place; on the server
// the children render inline and the client-only `fallback` is stripped.
// Both modules must stay valid and behave like the original source.

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
 * loaded: each lazy chunk component renders the chunk export it loads, and
 * the modules are linked like a bundler would (`evaluateHydrateParent`).
 * `beforeChunksLoad` runs app code between the two.
 */
async function loadClientModule(
  code: string,
  options: {
    stubs?: Record<string, ModuleStub>
    beforeChunksLoad?: (module: Record<string, any>) => void
  } = {},
) {
  const { parent, chunks, plugin } = await compileHydrate('client', code)
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
  const { module, parentModuleStubs } = await evaluateHydrateParent(
    plugin,
    parent,
    stubs,
    reactRuntime,
  )
  options.beforeChunksLoad?.(module)
  for (const chunk of chunks) {
    expect(await getModuleErrors(chunk)).toEqual([])
    Object.assign(
      chunkExports,
      await evaluateModule(
        chunk,
        { ...stubs, ...(await parentModuleStubs(chunk)) },
        reactRuntime,
      ),
    )
  }
  return { module, lazyChunks }
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
})

describe('the parent module', () => {
  const widgetPage = `${head}import { visible } from '@tanstack/react-start/hydration'
import { Chart, FallbackPane } from './widgets'
import { formatValue } from './format'
const chartTitle = formatValue('Revenue')
export function Page() {
  return <Hydrate when={visible()} fallback={<FallbackPane />}><Chart title={chartTitle} /></Hydrate>
}`

  test('client: bindings only the split children use leave the parent', async () => {
    const { parent, chunks } = await compileHydrate('client', widgetPage)
    expect(chunks[0]).toMatch(declarationOf('chartTitle'))
    expect(parent).not.toMatch(declarationOf('chartTitle'))
    expect(parent).not.toMatch(/\bChart\b/)
    expect(importSources(parent)).toEqual(['./widgets'])
  })

  test('server: bindings only the stripped fallback uses are removed', async () => {
    const { parent } = await compileHydrate('server', widgetPage)
    expect(parent).not.toContain('FallbackPane')
  })

  test("client: the directive prologue stays first in the parent module and 'use client' in the split chunk", async () => {
    const { parent, chunks } = await compileHydrate(
      'client',
      `'use client'
'use strict'
${head}import { Chart } from './chart'
export function Page() {
  return <Hydrate><Chart /></Hydrate>
}`,
    )
    expect(directivePrologue(parent)).toEqual(['use client', 'use strict'])
    expect(directivePrologue(chunks[0]!)[0]).toBe('use client')
  })

  // Children passed as props split like JSX children, or stay in place when
  // props only provide them at runtime; either way they render once, without
  // a chunk that never renders.
  test.each([
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
      // A string children prop is left in place, while the same text as JSX
      // children (`<Hydrate>text</Hydrate>`) is split like any JSX children
      // (see the text-only child tests): the compiler only moves a children
      // prop holding an expression into the JSX children. Plain text has
      // nothing to hydrate, so both render the same.
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

  test('client: a stale h attribute is replaced by the generated boundary id', async () => {
    const { parent } = await compileHydrate(
      'client',
      `${head}export function Page() {
  return <Hydrate h="stale"><p>child</p></Hydrate>
}`,
    )
    expect(parent).not.toContain('stale')
    expect(getBoundaryIds(parent)).toHaveLength(1)
  })

  // String values of `split` are accepted too, for untyped or JS callers.
  test('client: split="false" keeps function-as-children in place', async () => {
    const parent = await compileCode(
      'client',
      `${head}export function Page() {
  return <Hydrate split="false">{() => <p>child</p>}</Hydrate>
}`,
      { compilerPlugins: [createHydrateCompilerPlugin()] },
    )
    expect(parent).toBeNull()
  })

  test.each(['split', 'split="true"'])(
    'client: %s splits the children',
    async (split) => {
      const { chunks } = await compileHydrate(
        'client',
        `${head}export function Page() {
  return <Hydrate ${split}><p>child</p></Hydrate>
}`,
      )
      expect(chunks).toHaveLength(1)
      expect(await renderChunk(chunks[0]!)).toBe('<p>child</p>')
    },
  )

  // An object spread into one boundary only is stripped of its fallback; a
  // shared or computed object may be observed elsewhere and is kept.
  test.each([
    {
      name: 'used once',
      code: `const opts = { fallback: <p>server-fallback</p>, when: true }
export function Page() { return <Hydrate {...opts}><p>child</p></Hydrate> }`,
      kept: false,
    },
    {
      name: 'shared by two boundaries',
      code: `const opts = { fallback: <p>server-fallback</p> }
export function Page() { return <><Hydrate {...opts}><p>a</p></Hydrate><Hydrate {...opts}><p>b</p></Hydrate></> }`,
      kept: true,
    },
    {
      name: 'returned by a call',
      code: `const makeOpts = () => ({ fallback: <p>server-fallback</p> })
const opts = makeOpts()
export function Page() { return <Hydrate {...opts}><p>child</p></Hydrate> }`,
      kept: true,
    },
  ])(
    'server: a fallback in a spread object $name is kept: $kept',
    async ({ code, kept }) => {
      const { parent } = await compileHydrate('server', `${head}${code}`)
      expect(await getModuleErrors(parent)).toEqual([])
      expect(parent.includes('server-fallback')).toBe(kept)
    },
  )

  // Source: Qwik optimizer example_functional_component_capture_props
  test('server: params used only by the fallback keep later params in place', async () => {
    const { parent } = await compileHydrate(
      'server',
      `${head}export function List({ items }) {
  return <ul>{items.map((item, i) => <Hydrate key={i} fallback={<p>{item}</p>}><li>{i}</li></Hydrate>)}</ul>
}
export function Card(label, body) {
  return <Hydrate fallback={<p>{label}</p>}><p>{body}</p></Hydrate>
}`,
    )
    const module = await evaluateModule(parent, hydrateParentStubs)
    expect(module.List({ items: ['a', 'b'] })).toBe(
      '<ul>[<li>0</li>][<li>1</li>]</ul>',
    )
    expect(module.Card('L', 'B')).toBe('[<p>B</p>]')
  })

  // Source: Qwik optimizer should_transform_handler_in_for_of_loop
  test('server: a loop variable used only by the fallback keeps the module valid', async () => {
    const { parent } = await compileHydrate(
      'server',
      `${head}export function List({ xs }) {
  const out = []
  for (const x of xs) out.push(<Hydrate fallback={<p>{x}</p>}><p>child</p></Hydrate>)
  return out
}`,
    )
    expect(await getModuleErrors(parent)).toEqual([])
  })

  // Source: Qwik optimizer should_keep_non_migrated_binding_from_shared_destructuring_declarator
  test('server: a destructuring shared by the fallback and the children keeps the children binding', async () => {
    const { parent } = await compileHydrate(
      'server',
      `${head}export function Page(props) {
  const { a, b } = props
  return <Hydrate fallback={<p>{a}</p>}><p>{b}</p></Hydrate>
}`,
    )
    const module = await evaluateModule(parent, hydrateParentStubs)
    expect(module.Page({ a: 'A', b: 'B' })).toBe('[<p>B</p>]')
  })

  // Source: Qwik optimizer example_mutable_children, issue_5008
  test('client: boundaries in conditionals and callbacks load the chunk the server id names', async () => {
    const code = `${head}export function Page({ flag, items }) {
  return <div>
    {flag ? <Hydrate><p>yes</p></Hydrate> : <Hydrate><p>no</p></Hydrate>}
    {flag && <Hydrate><p>and</p></Hydrate>}
    {items.map(function (item, idx) { return <Hydrate key={idx}><p>{'fn' + item}</p></Hydrate> })}
    {items.map((item) => <Hydrate key={item}><p>{'arrow' + item}</p></Hydrate>)}
  </div>
}
export function Other({ early }) {
  if (early) { return <Hydrate><p>early</p></Hydrate> }
  return <Hydrate><p>late</p></Hydrate>
}`
    const server = await compileHydrate('server', code)
    const { parent, plugin } = await compileHydrate('client', code)
    const serverIds = getBoundaryIds(server.parent)
    expect(getBoundaryIds(parent)).toEqual(serverIds)
    const rendered: Array<unknown> = []
    for (const id of serverIds) {
      const chunkId = getChunkIds(parent).find((chunk) =>
        chunk.endsWith(`=${id}`),
      )
      rendered.push(
        await renderChunk(loadChunk(plugin, 'client', chunkId!)!, {
          item: 'x',
        }),
      )
    }
    expect(rendered).toEqual([
      '<p>yes</p>',
      '<p>no</p>',
      '<p>and</p>',
      '<p>fnx</p>',
      '<p>arrowx</p>',
      '<p>early</p>',
      '<p>late</p>',
    ])
  })

  // Source: Qwik optimizer example_strip_exports_used
  test.each([
    {
      name: 'an exported server fn also called by the parent',
      code: `import { Hydrate, createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(async () => 'greet-handler-marker')
export function Page() {
  return <><button onClick={() => greet()}>a</button><Hydrate><button onClick={() => greet()}>b</button></Hydrate></>
}`,
    },
    {
      name: 'a private server fn only called by the children',
      code: `import { Hydrate, createServerFn } from '@tanstack/react-start'
const greet = createServerFn().handler(async () => 'greet-handler-marker')
export function Page() {
  return <Hydrate><button onClick={() => greet()}>b</button></Hydrate>
}`,
    },
  ])(
    'client: $name calls the provider id from the split chunk',
    async ({ code }) => {
      const { parent, plugin } = await compileHydrate('client', code)
      const compiled = await compileFirstChunk(plugin, parent)
      const chunk =
        compiled.code ?? loadChunk(plugin, 'client', getChunkIds(parent)[0]!)!
      expect(await getModuleErrors(chunk)).toEqual([])
      expect(chunk).not.toContain('greet-handler-marker')
      const provider = await evaluateModule(
        (await compileCode('provider', code))!,
      )
      // The chunk compiles its own caller of the provider, or imports the
      // parent's caller.
      const ids = Object.keys(compiled.serverFns)
      if (ids.length > 0) {
        expect(ids).toEqual([provider.greet_createServerFn_handler.meta.id])
      } else {
        expect(parentImportSources(chunk)).not.toEqual([])
      }
    },
  )
})

describe('the split chunk', () => {
  // The server renders the children as JSX text.
  test.each([
    { name: 'entities', text: '&amp; &#38; &#x26;', rendered: '& & &' },
    {
      name: 'numeric entities',
      text: '&copy; &#169; &#xA9;',
      rendered: '© © ©',
    },
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
      const { chunks } = await compileHydrate(
        'client',
        `${head}export function Page() {
  return <Hydrate>${text}</Hydrate>
}`,
      )
      expect(await renderChunk(chunks[0]!)).toBe(rendered)
    },
  )

  describe('the route of the parent module', () => {
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

    test.each([
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
    ])(
      'client: children reading Route $name use the one route',
      async ({ code, rendered }) => {
        const created: Array<string> = []
        const { module } = await loadClientModule(
          `${head}import { createFileRoute } from '@tanstack/react-router'
${code}`,
          { stubs: routerStub(created) },
        )
        expect(module.Page()).toBe(rendered)
        expect(created).toEqual(['/posts'])
      },
    )

    test('client: children reading a Route the module does not export are rejected', async () => {
      const error = await compileHydrate(
        'client',
        `${head}import { createFileRoute } from '@tanstack/react-router'
const Route = createFileRoute('/posts')({ component: Page })
export function Page() {
  return <Hydrate><p>{Route.id}</p></Hydrate>
}`,
      )
        .then(({ parent, plugin }) =>
          loadChunk(plugin, 'client', getChunkIds(parent)[0]!),
        )
        .catch((error: unknown) => error)
      expect(compileErrorMessage(error)).toMatch(/\bHydrate\b[^]*\bRoute\b/)
    })
  })

  test('client: children may contain return statements', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `${head}const letters = ['a', 'b']
export function Page() {
  return <Hydrate><ul onClick={() => { return 'click' }}>{letters.map((letter) => { const upper = letter.toUpperCase(); return <li>{upper}</li> })}{(function () { return 'iife' })()}</ul></Hydrate>
}`,
    )
    expect(await getModuleErrors(chunks[0]!)).toEqual([])
    // Render the click handler's result next to the element.
    const runtime = `const __Fragment = Symbol('Fragment')
const __jsx = (type, props, ...children) => {
  const text = children.flat(Infinity).filter((c) => c != null && c !== false && c !== true).join('')
  const click = props?.onClick ? '(' + props.onClick() + ')' : ''
  return '<' + type + '>' + click + text + '</' + type + '>'
}
`
    const module = await evaluateModule(chunks[0]!, {}, runtime)
    expect(getChunkComponent(module)({})).toBe(
      '<ul>(click)<li>A</li><li>B</li>iife</ul>',
    )
  })

  // Leaving such a boundary unsplit is valid too.
  test('client: empty, self-closing and comment-only boundaries load chunks that render nothing', async () => {
    const { parent, chunks } = await compileHydrate(
      'client',
      `${head}export function Page() {
  return <div><Hydrate></Hydrate><Hydrate /><Hydrate>{/* nothing */}</Hydrate></div>
}`,
    )
    expect(await getModuleErrors(parent)).toEqual([])
    expect(chunks.length).toBeLessThanOrEqual(3)
    for (const chunk of chunks) {
      expect(await getModuleErrors(chunk)).toEqual([])
      expect(await renderChunk(chunk)).toBeNull()
    }
  })

  test('client: chunk ids stay loadable when the same source is compiled again', async () => {
    const source = `${head}export function Page() {
  return <Hydrate><p>chunk-marker</p></Hydrate>
}`
    const { parent, plugin } = await compileHydrate('client', source)
    const [id] = getChunkIds(parent)
    expect(loadChunk(plugin, 'client', id!)).toContain('chunk-marker')
    await compileCode('client', source, { compilerPlugins: [plugin] })
    expect(loadChunk(plugin, 'client', id!)).toContain('chunk-marker')
    // Unknown boundaries and ids without a split id are not Hydrate chunks.
    expect(loadChunk(plugin, 'client', id!.replace(/=0_/, '=5_'))).toBeNull()
    expect(
      loadChunk(plugin, 'client', '/test/src/module.tsx?other=1'),
    ).toBeNull()
  })

  // Source: Qwik optimizer example_capture_imports,
  // jsx_member_tag_object_is_captured, example_jsx
  test('client: default, namespace and aliased imports and namespaced names in the children', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `${head}import Chart from './chart'
import * as UI from './ui'
import { format as fmt, default as theme } from './format'
export function Page() {
  return <Hydrate><Chart /><UI.Button label={fmt(theme)} /><svg><use xlink:href="#icon" /></svg></Hydrate>
}`,
    )
    expect(await getModuleErrors(chunks[0]!)).toEqual([])
    expect(
      await renderChunk(
        chunks[0]!,
        {},
        {
          './chart': { default: () => '<chart></chart>' },
          './ui': {
            Button: ({ label }: { label: string }) =>
              `<button>${label}</button>`,
          },
          './format': {
            format: (value: string) => `[${value}]`,
            default: 'dark',
          },
        },
      ),
    ).toBe('<chart></chart><button>[dark]</button><svg><use></use></svg>')
  })

  // Source: Qwik optimizer should_handle_dangerously_set_inner_html
  test('client: string attributes keep their value', async () => {
    const element = `<span title="Fish &amp; Chips &copy;" data-q='say "hi"' data-n="a
b" dangerouslySetInnerHTML={{ __html: "<h1>I'm an h1!</h1>" }} />`
    const { chunks } = await compileHydrate(
      'client',
      `${head}export function Page() {
  return <Hydrate>${element}</Hydrate>
}`,
    )
    // Render the props instead of the element.
    const propsRuntime = `const __Fragment = null
const __jsx = (type, props) => JSON.stringify(props)
`
    const expected = await evaluateModule(
      `export const H0 = () => ${element}`,
      {},
      propsRuntime,
    )
    const module = await evaluateModule(chunks[0]!, {}, propsRuntime)
    expect(getChunkComponent(module)({})).toBe(expected.H0())
  })

  // Source: Qwik optimizer example_exports, example_ts_enums
  test.each([
    {
      name: 'exported declarations of every form',
      code: `export const [a, { b }] = ['a', { b: 'b' }]
const exp1 = 'e1'
const internal = 'i'
export { exp1, internal as expr2 }
export function foo() { return 'foo' }
export class Bar { static id = 'bar' }
export default function DefaultFn() { return 'default' }
export function Page() {
  return <Hydrate><p>{[a, b, exp1, internal, foo(), Bar.id, DefaultFn()].join('|')}</p></Hydrate>
}`,
      rendered: '<p>a|b|e1|i|foo|bar|default</p>',
    },
    {
      name: 'TypeScript enums and namespaces',
      code: `export enum Tone { Loud = 'LOUD' }
namespace Labels { export const quiet = 'quiet' }
export function Page() {
  return <Hydrate><p>{Tone.Loud + ':' + Labels.quiet}</p></Hydrate>
}`,
      rendered: '<p>LOUD:quiet</p>',
    },
  ])(
    'client: $name used by the children reach the chunk',
    async ({ code, rendered }) => {
      // Known limitation: the chunk declares its own copy of these module
      // declarations, so the parent and the chunk do not share class
      // identity or module state, and initializers run twice. Only the
      // rendered output is asserted here.
      const { chunks } = await compileHydrate('client', `${head}${code}`)
      expect(await getModuleErrors(chunks[0]!)).toEqual([])
      expect(await renderChunk(chunks[0]!)).toBe(rendered)
    },
  )

  // Source: Qwik optimizer example_use_optimization (use* calls inside the
  // extracted scope)
  test('client: an optional hook call in the children is rejected', async () => {
    const error = await compileHydrate(
      'client',
      `import { useId } from 'react'
${head}export function Page() {
  return <Hydrate><p id={useId?.()}>x</p></Hydrate>
}`,
    ).catch((caught: unknown) => caught)
    expect(compileErrorMessage(error)).toMatch(/hook/i)
  })

  // Source: Qwik optimizer example_default_export
  test('client: an anonymous default-exported component splits its boundary', async () => {
    const { parent, chunks } = await compileHydrate(
      'client',
      `${head}const label = 'default'
export default () => <Hydrate><p>{label}</p></Hydrate>`,
    )
    expect(await getModuleErrors(parent)).toEqual([])
    expect(await renderChunk(chunks[0]!)).toBe('<p>default</p>')
  })

  // Source: Qwik optimizer example_invalid_references,
  // should_migrate_destructured_binding_with_imported_dependency
  test('client: a module-level destructuring of an import moves into the chunk with the import', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `${head}import { source } from './lib'
const fallback = 'd'
const [a, { b = fallback, ...rest }] = source
export function Page() {
  return <Hydrate><p>{[a, b, JSON.stringify(rest)].join('|')}</p></Hydrate>
}`,
    )
    expect(await getModuleErrors(chunks[0]!)).toEqual([])
    expect(
      await renderChunk(
        chunks[0]!,
        {},
        { './lib': { source: ['A', { extra: 'x' }] } },
      ),
    ).toBe('<p>A|d|{"extra":"x"}</p>')
  })

  // Source: Qwik optimizer should_preserve_let_when_migrated_into_segment;
  // React Compiler fixture should-bailout-without-compilation-annotation-mode.js
  test.each([
    { name: 'read and written', update: '{++renders}', rendered: ['1', '2'] },
    {
      name: 'only written',
      update: `{(() => { renders = 'set' })()}`,
      rendered: ['', ''],
    },
  ])(
    'client: a module-level let only the children use stays mutable when $name',
    async ({ update, rendered }) => {
      const { chunks } = await compileHydrate(
        'client',
        `${head}let renders = 0
export function Page() {
  return <Hydrate><p>${update}</p></Hydrate>
}`,
      )
      expect(await getModuleErrors(chunks[0]!)).toEqual([])
      const component = getChunkComponent(await evaluateModule(chunks[0]!))
      expect([component({}), component({})]).toEqual(
        rendered.map((text) => `<p>${text}</p>`),
      )
    },
  )

  // Source: Qwik optimizer should_keep_non_migrated_binding_from_shared_destructuring_declarator
  // (+ _array_destructuring_declarator, _with_rest)
  test.each([
    { name: 'object', declaration: `const { a, b } = { a: 'A', b: 'B' }` },
    { name: 'array', declaration: `const [a, b] = ['A', 'B']` },
    { name: 'rest', declaration: `const { a, ...b } = { a: 'A', c: 'B' }` },
  ])(
    'client: an $name destructuring shared by the parent and the children keeps both bindings',
    async ({ declaration }) => {
      const { parent, chunks, plugin } = await compileHydrate(
        'client',
        `${head}${declaration}
export const fromRoot = () => JSON.stringify(b)
export function Page() {
  return <Hydrate><p>{a}</p></Hydrate>
}`,
      )
      const { module, parentModuleStubs } = await evaluateHydrateParent(
        plugin,
        parent,
      )
      expect(module.fromRoot()).toContain('B')
      expect(
        await renderChunk(chunks[0]!, {}, await parentModuleStubs(chunks[0]!)),
      ).toBe('<p>A</p>')
    },
  )

  // Source: Qwik optimizer should_keep_root_var_used_by_export_decl_and_qrl,
  // example_segment_variable_migration,
  // variable_migration_transitive_dep_used_by_other_segment
  test('client: helpers shared by two boundaries and an export stay available to each', async () => {
    const { parent, chunks, plugin } = await compileHydrate(
      'client',
      `${head}const scrollState = (el) => ({ x: el.x, y: el.y })
const saveScroll = (s) => s.x + s.y
const bigHelper = (el) => saveScroll(scrollState(el))
export const direct = saveScroll(scrollState({ x: 1, y: 1 }))
export function App() {
  return <><Hydrate><p>{bigHelper({ x: 1, y: 2 })}</p></Hydrate><Hydrate><p>{scrollState({ x: 3, y: 4 }).y}</p></Hydrate></>
}`,
    )
    expect(chunks).toHaveLength(2)
    const { module, parentModuleStubs } = await evaluateHydrateParent(
      plugin,
      parent,
    )
    expect(module.direct).toBe(2)
    const render = async (chunk: string) =>
      renderChunk(chunk, {}, await parentModuleStubs(chunk))
    expect(await render(chunks[0]!)).toBe('<p>3</p>')
    expect(await render(chunks[1]!)).toBe('<p>4</p>')
  })

  // Source: Qwik optimizer example_ts_enums (TypeScript-only declaration forms)
  test('client: an overloaded function used by the children keeps its implementation', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `${head}function label(value: string): string
function label(value: number): string
function label(value: unknown) { return 'label:' + String(value) }
export function Page() {
  return <Hydrate><p>{label(1)}</p></Hydrate>
}`,
    )
    expect(await getModuleErrors(chunks[0]!)).toEqual([])
    expect(await renderChunk(chunks[0]!)).toBe('<p>label:1</p>')
  })

  /** A page whose split child renders `Widget`, declared by `body`. */
  const widgetPage = (body: string) => `${head}${body}
export function Page(props) {
  return <Hydrate><Widget {...props} /></Hydrate>
}`

  // A component the children render moves into the chunk with the module
  // bindings it reads.
  // Source: React Compiler fixtures (per row)
  test.each([
    {
      // try-catch-* fixtures
      name: 'a catch parameter shadowing a module binding',
      body: `const error = 'module'
function Widget() {
  let caught
  try {
    throw 'thrown'
  } catch (error) {
    caught = error
  }
  return <p>{caught}-{error}</p>
}`,
      expected: '<p>thrown-module</p>',
    },
    {
      // fn-name-no-leak-to-nested-arrow.js
      name: 'a named function expression shadowing a module binding',
      body: `const helper = () => 'module'
function Widget() {
  const local = function helper(n) {
    return n > 0 ? helper(n - 1) : 'local'
  }
  return <p>{local(2)}/{helper()}</p>
}`,
      expected: '<p>local/module</p>',
    },
    {
      // destructure-*-default fixtures
      name: 'parameter defaults reading module bindings',
      body: `const fallback = 'fb'
function Widget({ title = fallback, items: [first = fallback.toUpperCase()] = [] }) {
  return <p>{title}{first}</p>
}`,
      expected: '<p>fbFB</p>',
    },
    {
      // hoisting-simple-function-declaration.js
      name: 'a hoisted local function reading a module binding declared later',
      body: `function Widget() {
  const x = format()
  function format() {
    return prefix + 'x'
  }
  return <p>{x}</p>
}
const prefix = 'p-'`,
      expected: '<p>p-x</p>',
    },
    {
      // class fixtures (static blocks, private fields)
      name: 'a local class with a static block and a private field',
      body: `const base = 2
function Widget() {
  class Counter {
    static start
    static {
      Counter.start = base * 2
    }
    #n = Counter.start
    get n() {
      return this.#n
    }
  }
  return <p>{new Counter().n}</p>
}`,
      expected: '<p>4</p>',
    },
  ])(
    'client: the chunk renders like the original with $name',
    async ({ body, expected }) => {
      const { chunks } = await compileHydrate('client', widgetPage(body))
      expect(await getModuleErrors(chunks[0]!)).toEqual([])
      expect(await renderChunk(chunks[0]!, { props: {} })).toBe(expected)
    },
  )

  describe('side effects of the component bodies it moves', () => {
    afterEach(() => {
      delete (globalThis as { __hydrateCalls?: unknown }).__hydrateCalls
    })

    // An unused local initialized by a hook call or another side effect must
    // still run when the chunk renders.
    // Source: React Compiler fixtures react-namespace.js,
    // unused-optional-method-assigned-to-variable.js, error.todo-reassign-const.js
    test.each([
      { name: 'a call', initializer: `useTracked('call')` },
      { name: 'an optional call', initializer: `useTracked?.('optional')` },
      {
        name: 'a member read of a call',
        initializer: `useTracked('member').length`,
      },
    ])(
      'client: an unused local initialized by $name still runs',
      async ({ initializer }) => {
        const { chunks } = await compileHydrate(
          'client',
          widgetPage(`function useTracked(label) {
  globalThis.__hydrateCalls.push(label)
  return label
}
function Widget() {
  const unused = ${initializer}
  return <p>widget</p>
}`),
        )
        const calls: Array<string> = []
        ;(globalThis as { __hydrateCalls?: Array<string> }).__hydrateCalls =
          calls
        expect(await renderChunk(chunks[0]!, { props: {} })).toBe(
          '<p>widget</p>',
        )
        expect(calls).toHaveLength(1)
      },
    )
  })
})
