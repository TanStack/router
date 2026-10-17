import { afterEach, describe, expect, test } from 'vitest'
import { createHydrateCompilerPlugin } from '../src/hydrate-when-transform'
import {
  callReportedServerFns,
  compileCode,
  compileFirstChunk,
  compileHydrate,
  compileServer,
  createStartCompiler,
  directivePrologue,
  expectRenderedThroughChunks,
  evaluateModule,
  getChunkComponent,
  getChunkIds,
  hydrateParentStubs,
  importSources,
  loadChunk,
  loadClientModule,
  renderBoundaries,
  renderChunk,
} from './regression-helpers'
import { originalPositionOf, positionOf } from './hydrate-helpers'
import type { ModuleStub } from './regression-helpers'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'

// On the client `<Hydrate>` children move into a lazily loaded chunk module
// and the parent renders the chunk component in their place; on the server
// the children render inline and the client-only `fallback` is stripped.
// Both modules must stay valid and behave like the original source.

const head = `import { Hydrate } from '@tanstack/react-start'\n`

describe('the parent module', () => {
  const widgetPage = `${head}import { visible } from '@tanstack/react-start/hydration'
import { FallbackPane } from './widgets'
import { Chart } from './chart'
import { formatValue } from './format'
const chartTitle = formatValue('Revenue')
export function Page() {
  return <Hydrate when={visible()} fallback={<FallbackPane />}><Chart title={chartTitle} /></Hydrate>
}`

  // Where the children's code ends up in the final bundle is the bundler's
  // call (hydrate-build.test.ts); the parent must not need it before the
  // chunk loads.
  test('client: modules and bindings only the split children use are not needed before the chunk loads', async () => {
    const events: Array<string> = []
    const { module } = await loadClientModule(widgetPage, {
      stubs: {
        './widgets': { FallbackPane: () => 'fallback' },
        './chart': {
          get Chart() {
            events.push('chart linked')
            return ({ title }: { title: string }) => `<chart>${title}</chart>`
          },
        },
        './format': {
          get formatValue() {
            events.push('format linked')
            return (value: string) => {
              events.push('formatValue called')
              return `${value}!`
            }
          },
        },
      },
      beforeChunksLoad: () => events.push('chunks load'),
    })
    // When the parent's own module-level code (`formatValue('Revenue')`) runs
    // is left open; it runs once.
    expect(events).toContain('chunks load')
    expect(events.slice(0, events.indexOf('chunks load'))).not.toContain(
      'chart linked',
    )
    expect(module.Page()).toBe('[<chart>Revenue!</chart>]')
    expect(events.filter((event) => event === 'formatValue called')).toEqual([
      'formatValue called',
    ])
  })

  // Source: #8504 hydrate-split-modules.test.ts
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

  // A user-written `h` (e.g. copied from rendered markup) cannot make two
  // boundaries share an id, and the client hydrates with the ids the server
  // renders.
  test('client: boundaries with a stale h attribute hydrate with the distinct ids the server renders', async () => {
    const code = `${head}export function Page() {
  return <><Hydrate h="stale"><p>one</p></Hydrate><Hydrate h="stale"><p>two</p></Hydrate></>
}`
    const render = (m: Record<string, any>) => m.Page()
    const server = await renderBoundaries('server', code, render)
    expect(server.html).toBe('[<p>one</p>][<p>two</p>]')
    expect(new Set(server.ids).size).toBe(2)
    expect(await renderBoundaries('client', code, render)).toEqual(server)
  })

  test.each(['split', 'split="true"'])(
    'client: %s splits the children',
    async (split) => {
      const { module, lazyChunks } =
        await loadClientModule(`${head}export function Page() {
  return <Hydrate ${split}><p>child</p></Hydrate>
}`)
      expect(module.Page()).toBe('[<p>child</p>]')
      expectRenderedThroughChunks(lazyChunks)
    },
  )

  // An object that may be observed elsewhere (shared, or returned by a call)
  // may keep its fallback on the server; the boundaries still render their
  // children. Stripping the fallback of an object only Hydrate spreads read
  // is the goal (pinned below); seeing through calls is best effort.
  test.each([
    {
      name: 'shared by two boundaries',
      code: `const opts = { fallback: <p>server-fallback</p> }
export function Page() { return <><Hydrate {...opts}><p>a</p></Hydrate><Hydrate {...opts}><p>b</p></Hydrate></> }`,
      html: '[<p>a</p>][<p>b</p>]',
    },
    {
      name: 'returned by a call',
      code: `const makeOpts = () => ({ fallback: <p>server-fallback</p> })
const opts = makeOpts()
export function Page() { return <Hydrate {...opts}><p>child</p></Hydrate> }`,
      html: '[<p>child</p>]',
    },
  ])(
    'server: boundaries spreading an object $name render their children',
    async ({ code, html }) => {
      const { parent } = await compileHydrate('server', `${head}${code}`)
      expect(await getModuleErrors(parent)).toEqual([])
      const module = await evaluateModule(parent, hydrateParentStubs)
      expect(module.Page()).toBe(html)
    },
  )

  // Goal (N14): an object only `<Hydrate>` spreads read is used for its
  // props only, so its client-only fallback is removed from the server
  // module, like the fallback of an object spread once.
  test.fails(
    'server: a fallback in a spread object shared by two boundaries is removed',
    async () => {
      const { parent } = await compileHydrate(
        'server',
        `${head}const opts = { fallback: <p>server-fallback</p> }
export function Page() { return <><Hydrate {...opts}><p>a</p></Hydrate><Hydrate {...opts}><p>b</p></Hydrate></> }`,
      )
      expect(await getModuleErrors(parent)).toEqual([])
      expect(parent).not.toContain('server-fallback')
    },
  )

  test('server: a split={false} boundary loses a fallback passed through a spread too', async () => {
    const { parent } = await compileHydrate(
      'server',
      `${head}export function Page() {
  return <Hydrate split={false} {...{ fallback: <p>server-fallback</p> }}><p>child</p></Hydrate>
}`,
    )
    expect(await getModuleErrors(parent)).toEqual([])
    expect(parent).not.toContain('server-fallback')
    const module = await evaluateModule(parent, hydrateParentStubs)
    expect(module.Page()).toBe('[<p>child</p>]')
  })

  test('server: a computed spread key read from a binding named fallback is kept', async () => {
    const { parent } = await compileHydrate(
      'server',
      `${head}const fallback = 'title'
export function Page() {
  return <Hydrate {...{ [fallback]: 'kept-title', fallback: <p>server-fallback</p> }}><p>child</p></Hydrate>
}`,
    )
    expect(parent).not.toContain('server-fallback')
    const boundaries: Array<Record<string, unknown>> = []
    const module = await evaluateModule(parent, {
      ...hydrateParentStubs,
      '@tanstack/react-start': {
        Hydrate: (props: Record<string, unknown>) => {
          boundaries.push(props)
          return `[${props.children ?? ''}]`
        },
      },
    })
    expect(module.Page()).toBe('[<p>child</p>]')
    expect(boundaries.map((props) => props.title)).toEqual(['kept-title'])
  })

  /**
   * Loads `code` for the client with a `<Hydrate>` stub recording the props
   * of each boundary it renders.
   */
  async function loadRecordingBoundaries(
    code: string,
    stubs: Record<string, ModuleStub> = {},
  ) {
    const boundaries: Array<Record<string, any>> = []
    const loaded = await loadClientModule(code, {
      stubs: {
        ...stubs,
        '@tanstack/react-start': {
          Hydrate: (props: Record<string, any>) => {
            boundaries.push(props)
            return `[${props.children ?? ''}]`
          },
        },
      },
    })
    return { ...loaded, boundaries }
  }

  // A boundary that may receive a `prefetch` prop (directly or through a
  // spread) gets the preload function of its own chunk (`p`).
  // Source: hydrateWhen Basic fixture (direct prefetch), hydrateWhen
  // PrefetchState fixture.
  test.each([
    {
      name: 'a direct prefetch prop',
      setup: '',
      attributes: 'when={idle()} prefetch={idle({ timeout: 100 })}',
      props: {},
    },
    {
      name: 'a spread object literal with prefetch',
      setup: '',
      attributes: '{...{ when: idle(), prefetch: idle() }}',
      props: {},
    },
    {
      name: 'a spread single-use object with prefetch',
      setup: 'const opts = { prefetch: idle() }\n',
      attributes: '{...opts}',
      props: {},
    },
    {
      name: 'a spread with a computed key',
      setup: '',
      attributes: '{...{ [props.key]: idle() }}',
      props: { key: 'prefetch' },
    },
    {
      name: 'a nested spread',
      setup: '',
      attributes: '{...{ ...props.rest }}',
      props: { rest: { prefetch: 'idle' } },
    },
    {
      name: 'a spread of the props param',
      setup: '',
      attributes: '{...props}',
      props: { prefetch: 'idle' },
    },
    {
      name: 'a spread of a member of the props',
      setup: '',
      attributes: '{...props.options}',
      props: { options: { prefetch: 'idle' } },
    },
    {
      name: 'a spread of a reassigned object',
      setup: 'let opts = { when: idle() }\n  opts = { prefetch: idle() }\n  ',
      attributes: '{...opts}',
      props: {},
    },
  ])(
    'client: a boundary with $name preloads its own chunk',
    async ({ setup, attributes, props }) => {
      const { module, boundaries, chunkIds, preloaded } =
        await loadRecordingBoundaries(
          `${head}import { idle } from '@tanstack/react-start/hydration'
export function Page(props) {
  ${setup}return <><Hydrate><p>other</p></Hydrate><Hydrate ${attributes}><p>child</p></Hydrate></>
}`,
        )
      expect(module.Page(props)).toBe('[<p>other</p>][<p>child</p>]')
      const boundary = boundaries[1]!
      expect(boundary.p).toBeTypeOf('function')
      await boundary.p()
      expect(preloaded).toHaveLength(1)
      expect(chunkIds).toContain(preloaded[0]!.id)
      expect(getChunkComponent(preloaded[0]!.module)({})).toBe('<p>child</p>')
    },
  )

  // Source: hydrateWhen PrefetchState fixture
  test('client: a prefetch callback updates the state of the parent component', async () => {
    const updates: Array<string> = []
    const { module, boundaries, preloaded } = await loadRecordingBoundaries(
      `import { useState } from 'react'
${head}import { interaction } from '@tanstack/react-start/hydration'
function Widget() {
  return <button>Widget</button>
}
export function Page() {
  const [status, setStatus] = useState('idle')
  const [, setUnusedStatus] = useState('idle')
  return (
    <section>
      <p>{status}</p>
      <Hydrate
        when={interaction()}
        prefetch={async () => {
          setStatus('prefetched')
          setUnusedStatus('prefetched-unused')
        }}
      >
        <Widget />
      </Hydrate>
    </section>
  )
}`,
      {
        react: {
          useState: (initial: string) => [
            initial,
            (next: string) => updates.push(next),
          ],
        },
      },
    )
    expect(module.Page()).toBe(
      '<section><p>idle</p>[<button>Widget</button>]</section>',
    )
    const [boundary] = boundaries
    await boundary!.prefetch()
    expect(updates).toEqual(['prefetched', 'prefetched-unused'])
    expect(boundary!.p).toBeTypeOf('function')
    await boundary!.p()
    expect(getChunkComponent(preloaded[0]!.module)({})).toBe(
      '<button>Widget</button>',
    )
  })

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
  test.each([
    { name: 'Page', props: { flag: true, items: ['x'] } },
    { name: 'Page', props: { flag: false, items: ['x'] } },
    { name: 'Other', props: { early: true } },
    { name: 'Other', props: { early: false } },
  ])(
    'client: boundaries in conditionals and callbacks hydrate like the server renders them: $name $props',
    async ({ name, props }) => {
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
      const render = (module: Record<string, any>) => module[name](props)
      const server = await renderBoundaries('server', code, render)
      expect(server.ids).not.toEqual([])
      expect(await renderBoundaries('client', code, render)).toEqual(server)
    },
  )

  // The route code splitter compiles a route's split component under the
  // route file's id with its own query (`?tsr-split=component`): the
  // boundaries keep the ids the server renders, and their chunks load.
  test('client: a module compiled under an id with another query keeps the server boundary ids', async () => {
    const code = `${head}export function Page() {
  return <div><Hydrate><p>one</p></Hydrate><Hydrate><p>two</p></Hydrate></div>
}`
    const plugin = createHydrateCompilerPlugin()
    const { compile } = createStartCompiler({
      env: 'client',
      compilerPlugins: [plugin],
    })
    const id = '/test/src/module.tsx?tsr-split=component'
    const parent = (await compile(code, id))!
    const render = (m: Record<string, any>) => m.Page()
    expect(
      (await renderBoundaries('client', code, render, { id })).ids,
    ).toEqual((await renderBoundaries('server', code, render)).ids)
    const rendered: Array<unknown> = []
    for (const chunkId of getChunkIds(parent)) {
      rendered.push(await renderChunk(loadChunk(plugin, 'client', chunkId)!))
    }
    expect(rendered.sort()).toEqual(['<p>one</p>', '<p>two</p>'])
  })

  test('client: a split={false} boundary nested in another does not shift the ids of later boundaries', async () => {
    const code = `${head}export function Page() {
  return <div><Hydrate><section><Hydrate split={false}><b>inline</b></Hydrate></section></Hydrate><Hydrate><p>second</p></Hydrate></div>
}`
    const render = (m: Record<string, any>) => m.Page()
    const server = await renderBoundaries('server', code, render)
    expect(server.html).toBe(
      '<div>[<section>[<b>inline</b>]</section>][<p>second</p>]</div>',
    )
    expect(await renderBoundaries('client', code, render)).toEqual(server)
    const { module, lazyChunks } = await loadClientModule(code)
    expect(render(module)).toBe(server.html)
    expectRenderedThroughChunks(lazyChunks)
  })

  test('client: a call whose name only contains "use" is split', async () => {
    const { module, lazyChunks } = await loadClientModule(
      `${head}import { houseNumber } from './format'
export function Page() {
  return <Hydrate><p>{houseNumber()}</p></Hydrate>
}`,
      { stubs: { './format': { houseNumber: () => '12' } } },
    )
    expect(module.Page()).toBe('[<p>12</p>]')
    expectRenderedThroughChunks(lazyChunks)
  })

  /**
   * JSX runtime rendering the result of an element's click handler (as
   * JSON) before its children.
   */
  const clickRuntime = `const __Fragment = Symbol('Fragment')
const __jsx = (type, props, ...children) => {
  const text = children.flat(Infinity).filter((c) => c != null && c !== false && c !== true).join('')
  if (type === __Fragment) return text
  if (typeof type === 'function') return type(children.length ? { ...props, children: text } : { ...props })
  const click = props?.onClick ? '(' + JSON.stringify(props.onClick()) + ')' : ''
  return '<' + type + '>' + click + text + '</' + type + '>'
}
`

  // The client calls the server fn by the id the server runs it under,
  // however the chunk reaches it (its own caller, or the parent's).
  // Source: Qwik optimizer example_strip_exports_used
  test.each([
    {
      name: 'an exported server fn also called by the parent',
      code: `import { Hydrate, createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(async () => 'greet-handler-marker')
export function Page() {
  return <><button onClick={() => greet()}>a</button><Hydrate><button onClick={() => greet()}>b</button></Hydrate></>
}`,
      clicks: 2,
    },
    {
      name: 'a private server fn only called by the children',
      code: `import { Hydrate, createServerFn } from '@tanstack/react-start'
const greet = createServerFn().handler(async () => 'greet-handler-marker')
export function Page() {
  return <Hydrate><button onClick={() => greet()}>b</button></Hydrate>
}`,
      clicks: 1,
    },
  ])(
    'client: $name is called from the split chunk by the id the server runs',
    async ({ code, clicks }) => {
      const { parent, plugin } = await compileHydrate('client', code)
      const compiled = await compileFirstChunk(plugin, parent)
      const chunk =
        compiled.code ?? loadChunk(plugin, 'client', getChunkIds(parent)[0]!)!
      expect(parent).not.toContain('greet-handler-marker')
      expect(chunk).not.toContain('greet-handler-marker')

      // A client server fn calls its RPC, which carries the id.
      const { module, lazyChunks } = await loadClientModule(code, {
        runtime: clickRuntime,
        stubs: {
          '@tanstack/react-start': {
            Hydrate: hydrateParentStubs['@tanstack/react-start']!.Hydrate,
            createServerFn: () => ({
              handler: (rpc: unknown) => () => rpc,
            }),
          },
        },
      })
      const html: string = module.Page()
      expectRenderedThroughChunks(lazyChunks)
      const ids = [...html.matchAll(/\(\{"client":("[^"]*")\}\)/g)].map(
        (match) => JSON.parse(match[1]!) as string,
      )
      expect(ids).toHaveLength(clicks)

      const server = await compileServer(code)
      for (const id of new Set(ids)) {
        expect(Object.keys(server.serverFns)).toContain(id)
        expect(
          await callReportedServerFns(server, { [id]: server.serverFns[id]! }),
        ).toEqual(['greet-handler-marker'])
      }
    },
  )
})

describe('the split chunk', () => {
  // The server renders the children as JSX text. Multi-line text is pinned
  // in known-bugs-hydrate.test.ts.
  // Source: #8504 hydrate-split-modules.test.ts (exact equality, numeric
  // entities)
  test.each([
    { name: 'entities', text: '&amp; &#38; &#x26;', rendered: '& & &' },
    {
      name: 'numeric entities',
      text: '&copy; &#169; &#xA9;',
      rendered: '© © ©',
    },
  ])(
    'client: a text-only child renders like JSX text: $name',
    async ({ text, rendered }) => {
      const jsx = await evaluateModule(`export const text = <>${text}</>`)
      expect(jsx.text).toBe(rendered)
      const { module, lazyChunks } =
        await loadClientModule(`${head}export function Page() {
  return <Hydrate>${text}</Hydrate>
}`)
      expect(module.Page()).toBe(`[${rendered}]`)
      expectRenderedThroughChunks(lazyChunks)
    },
  )

  // A wrapper component forwarding its children through a boundary keeps
  // them after hydration.
  test.each([
    {
      name: 'a captured prop',
      code: `export function Page({ label }) {
  return <Hydrate>{label}</Hydrate>
}`,
      props: { label: 'l' },
    },
    {
      name: 'the children of a wrapper',
      code: `export function Page(props) {
  return <Hydrate>{props.children}</Hydrate>
}`,
      props: { children: 'l' },
    },
  ])(
    'client: a single expression child ($name) renders through the chunk',
    async ({ code, props }) => {
      const { module, lazyChunks } = await loadClientModule(`${head}${code}`)
      expect(module.Page(props)).toBe('[l]')
      expectRenderedThroughChunks(lazyChunks)
    },
  )

  // Server code never reaches the client, the chunk included.
  test('client: the chunk does not import what only a server fn handler uses', async () => {
    const { parent, chunks } = await compileHydrate(
      'client',
      `import { Hydrate, createServerFn } from '@tanstack/react-start'
import { db } from './db'
export const getUser = createServerFn().handler(async () => db.read())
export function Page() {
  return <Hydrate><p>child</p></Hydrate>
}`,
    )
    expect(chunks).toHaveLength(1)
    for (const output of [parent, chunks[0]!]) {
      expect(importSources(output)).not.toContain('./db')
    }
  })

  // Source: #8504 hydrate-split-modules.test.ts (click handler and IIFE)
  test('client: children may contain return statements', async () => {
    // Render the click handler's result next to the element.
    const runtime = `const __Fragment = Symbol('Fragment')
const __jsx = (type, props, ...children) => {
  const text = children.flat(Infinity).filter((c) => c != null && c !== false && c !== true).join('')
  if (type === __Fragment) return text
  if (typeof type === 'function') return type(children.length ? { ...props, children: text } : { ...props })
  const click = props?.onClick ? '(' + props.onClick() + ')' : ''
  return '<' + type + '>' + click + text + '</' + type + '>'
}
`
    const { module, lazyChunks } = await loadClientModule(
      `${head}const letters = ['a', 'b']
export function Page() {
  return <Hydrate><ul onClick={() => { return 'click' }}>{letters.map((letter) => { const upper = letter.toUpperCase(); return <li>{upper}</li> })}{(function () { return 'iife' })()}</ul></Hydrate>
}`,
      { runtime },
    )
    expect(module.Page()).toBe('[<ul>(click)<li>A</li><li>B</li>iife</ul>]')
    expectRenderedThroughChunks(lazyChunks)
  })

  // Leaving such a boundary unsplit is valid too.
  // Source: #8504 hydrate-split-modules.test.ts (self-closing row)
  test('client: empty, self-closing and comment-only boundaries render nothing', async () => {
    const { module, lazyChunks } =
      await loadClientModule(`${head}export function Page() {
  return <div><Hydrate></Hydrate><Hydrate /><Hydrate>{/* nothing */}</Hydrate></div>
}`)
    expect(module.Page()).toBe('<div>[][][]</div>')
    expect(lazyChunks.length).toBeLessThanOrEqual(3)
  })

  // Source: #8504 hydrate-split-modules.test.ts
  test('client: a self-closing boundary without a children prop keeps its props', async () => {
    const boundaries: Array<Record<string, unknown>> = []
    const { module } = await loadClientModule(
      `${head}import { idle } from '@tanstack/react-start/hydration'
export function Page() {
  return <Hydrate when={idle()} />
}`,
      {
        stubs: {
          '@tanstack/react-start': {
            Hydrate: (props: Record<string, unknown>) => {
              boundaries.push(props)
              return `[${props.children ?? ''}]`
            },
          },
        },
      },
    )
    expect(module.Page()).toBe('[]')
    expect(boundaries.map((props) => props.when)).toEqual(['idle'])
  })

  // Goal: `<Hydrate children={…} />` defers its children like JSX children:
  // the parent does not need their modules before the chunk loads.
  // Source: #8504 hydrate-split-modules.test.ts "a children prop moves into
  // the chunk"
  test.fails.each([
    { name: 'last', attributes: 'when={idle()} children={<Chart />}' },
    { name: 'first', attributes: 'children={<Chart />} when={idle()}' },
  ])(
    'client: the children prop ($name) of a self-closing boundary is deferred',
    async ({ attributes }) => {
      const events: Array<string> = []
      const { module, lazyChunks } = await loadClientModule(
        `${head}import { idle } from '@tanstack/react-start/hydration'
import { Chart } from './chart'
export function Page() {
  return <Hydrate ${attributes} />
}`,
        {
          stubs: {
            './chart': {
              get Chart() {
                events.push('chart linked')
                return () => 'chart'
              },
            },
          },
          beforeChunksLoad: () => events.push('chunks load'),
        },
      )
      expect(events).toEqual(['chunks load', 'chart linked'])
      expect(module.Page()).toBe('[chart]')
      expect(lazyChunks.map((chunk) => chunk.rendered)).toEqual([true])
    },
  )

  // Deferring them is the goal above; either way they render, like on the
  // server.
  test('client: the children prop of a self-closing boundary renders like on the server', async () => {
    const code = `${head}import { idle } from '@tanstack/react-start/hydration'
import { Chart } from './chart'
export function Page() {
  return <section><Hydrate when={idle()} children={<Chart />} /></section>
}`
    const stubs = { './chart': { Chart: () => 'chart' } }
    const render = (module: Record<string, any>) => module.Page()
    const server = await renderBoundaries('server', code, render, { stubs })
    expect(server.html).toBe('<section>[chart]</section>')
    expect(await renderBoundaries('client', code, render, { stubs })).toEqual(
      server,
    )
  })

  test('client: a chunk id renders the same children when the same source is compiled again', async () => {
    const source = `${head}export function Page() {
  return <Hydrate><p>chunk-marker</p></Hydrate>
}`
    const { parent, plugin } = await compileHydrate('client', source)
    const [id] = getChunkIds(parent)
    const render = () => renderChunk(loadChunk(plugin, 'client', id!)!)
    expect(await render()).toBe('<p>chunk-marker</p>')
    await compileCode('client', source, { compilerPlugins: [plugin] })
    expect(await render()).toBe('<p>chunk-marker</p>')
  })

  // Code in the chunk and in the parent maps back to where the user wrote
  // it.
  // Source: #8504 hydrate-split-modules.test.ts (gap H26); gap M1
  test('client: the source maps of the chunk and the parent point at the original code', async () => {
    const source = `${head}import { visible } from '@tanstack/react-start/hydration'
export function Page() {
  return (
    <main>
      <aside>parent-marker</aside>
      <Hydrate when={visible()}>
        <p>chunk-marker</p>
      </Hydrate>
    </main>
  )
}`
    const plugin = createHydrateCompilerPlugin()
    const { transform } = createStartCompiler({
      env: 'client',
      compilerPlugins: [plugin],
    })
    const parent = (await transform(source))!
    const chunk = plugin.loadVirtualModule!({
      id: getChunkIds(parent.code)[0]!,
      root: '/test',
      env: 'client',
      envName: 'client',
    })!
    const original = (needle: string) => ({
      source: '/test/src/module.tsx',
      ...positionOf(source, needle),
    })
    expect(await originalPositionOf(chunk, '<p>chunk-marker')).toEqual(
      original('<p>chunk-marker'),
    )
    expect(await originalPositionOf(parent, '<aside>parent-marker')).toEqual(
      original('<aside>parent-marker'),
    )
  })

  test('client: the chunks of a module stay loadable after another module is compiled', async () => {
    const plugin = createHydrateCompilerPlugin()
    const { compile } = createStartCompiler({
      env: 'client',
      compilerPlugins: [plugin],
    })
    const first = (await compile(
      `${head}export function A() { return <Hydrate><p>first</p></Hydrate> }`,
      '/test/src/first.tsx',
    ))!
    const second = (await compile(
      `${head}export function B() { return <Hydrate><p>second</p></Hydrate> }`,
      '/test/src/second.tsx',
    ))!
    const render = (parent: string) =>
      renderChunk(loadChunk(plugin, 'client', getChunkIds(parent)[0]!)!)
    expect(await render(first)).toBe('<p>first</p>')
    expect(await render(second)).toBe('<p>second</p>')
  })

  // The bundler may load a chunk with the source module's code before the
  // plugin compiled that module (e.g. in a fresh build worker); the chunk,
  // and the nested boundary it splits again, use the packages of the
  // module's framework only (a Solid module graph has no React packages, and
  // the other way around).
  test.each(['react', 'solid'] as const)(
    'client: %s chunks loaded from the source code alone render with their own packages',
    async (framework) => {
      const { module, lazyChunks } = await loadClientModule(
        `import { Hydrate } from '@tanstack/${framework}-start'
export function Page() {
  return <Hydrate><section><Hydrate><p>${framework}</p></Hydrate></section></Hydrate>
}`,
        { framework, chunksFromSource: true },
      )
      expect(module.Page()).toBe(`[<section>[<p>${framework}</p>]</section>]`)
      expect(lazyChunks.map((chunk) => chunk.rendered)).toEqual([true, true])
    },
  )

  // Source: Qwik optimizer example_capture_imports,
  // jsx_member_tag_object_is_captured, example_jsx
  test('client: default, namespace and aliased imports and namespaced names in the children', async () => {
    const { module, lazyChunks } = await loadClientModule(
      `${head}import Chart from './chart'
import * as UI from './ui'
import { format as fmt, default as theme } from './format'
export function Page() {
  return <Hydrate><Chart /><UI.Button label={fmt(theme)} /><svg><use xlink:href="#icon" /></svg></Hydrate>
}`,
      {
        stubs: {
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
      },
    )
    expect(module.Page()).toBe(
      '[<chart></chart><button>[dark]</button><svg><use></use></svg>]',
    )
    expectRenderedThroughChunks(lazyChunks)
  })

  // Source: Qwik optimizer should_handle_dangerously_set_inner_html
  test('client: string attributes keep their value', async () => {
    const element = `<span title="Fish &amp; Chips &copy;" data-q='say "hi"' data-n="a
b" dangerouslySetInnerHTML={{ __html: "<h1>I'm an h1!</h1>" }} />`
    // Intrinsic elements render with their props, so every attribute value
    // is compared.
    const propsRuntime = `const __Fragment = Symbol('Fragment')
const __jsx = (type, props, ...children) => {
  const text = children.flat(Infinity).join('')
  if (type === __Fragment) return text
  if (typeof type === 'function') {
    return type(children.length ? { ...props, children: text } : { ...props })
  }
  return '<' + type + ' ' + JSON.stringify(props) + '>' + text + '</' + type + '>'
}
`
    const expected = await evaluateModule(
      `export const element = ${element}`,
      {},
      { runtime: propsRuntime },
    )
    const { module, lazyChunks } = await loadClientModule(
      `${head}export function Page() {
  return <Hydrate>${element}</Hydrate>
}`,
      { runtime: propsRuntime },
    )
    expect(module.Page()).toBe(`[${expected.element}]`)
    expectRenderedThroughChunks(lazyChunks)
  })

  // Source: Qwik optimizer example_default_export
  test('client: an anonymous default-exported component splits its boundary', async () => {
    const { module, lazyChunks } =
      await loadClientModule(`${head}const label = 'default'
export default () => <Hydrate><p>{label}</p></Hydrate>`)
    expect(module.default()).toBe('[<p>default</p>]')
    expectRenderedThroughChunks(lazyChunks)
  })

  // Where the destructuring and the import end up is the bundler's call
  // (hydrate-build.test.ts).
  // Source: Qwik optimizer example_invalid_references,
  // should_migrate_destructured_binding_with_imported_dependency
  test('client: the children read a module-level destructuring of an import', async () => {
    const { module, lazyChunks } = await loadClientModule(
      `${head}import { source } from './lib'
const fallback = 'd'
const [a, { b = fallback, ...rest }] = source
export function Page() {
  return <Hydrate><p>{[a, b, JSON.stringify(rest)].join('|')}</p></Hydrate>
}`,
      { stubs: { './lib': { source: ['A', { extra: 'x' }] } } },
    )
    expect(module.Page()).toBe('[<p>A|d|{"extra":"x"}</p>]')
    expectRenderedThroughChunks(lazyChunks)
  })

  // A let the children only write is pinned in known-bugs-hydrate.test.ts.
  // Source: Qwik optimizer should_preserve_let_when_migrated_into_segment
  test('client: a module-level let only the children use stays mutable', async () => {
    const { module, lazyChunks } =
      await loadClientModule(`${head}let renders = 0
export function Page() {
  return <Hydrate><p>{++renders}</p></Hydrate>
}`)
    expect([module.Page(), module.Page()]).toEqual(['[<p>1</p>]', '[<p>2</p>]'])
    expectRenderedThroughChunks(lazyChunks)
  })

  // Source: Qwik optimizer should_keep_non_migrated_binding_from_shared_destructuring_declarator
  // (+ _array_destructuring_declarator, _with_rest)
  test.each([
    { name: 'object', declaration: `const { a, b } = { a: 'A', b: 'B' }` },
    { name: 'array', declaration: `const [a, b] = ['A', 'B']` },
    { name: 'rest', declaration: `const { a, ...b } = { a: 'A', c: 'B' }` },
  ])(
    'client: an $name destructuring shared by the parent and the children keeps both bindings',
    async ({ declaration }) => {
      const { module, lazyChunks } =
        await loadClientModule(`${head}${declaration}
export const fromRoot = () => JSON.stringify(b)
export function Page() {
  return <Hydrate><p>{a}</p></Hydrate>
}`)
      expect(module.fromRoot()).toContain('B')
      expect(module.Page()).toBe('[<p>A</p>]')
      expectRenderedThroughChunks(lazyChunks)
    },
  )

  // Source: Qwik optimizer should_keep_root_var_used_by_export_decl_and_qrl,
  // example_segment_variable_migration,
  // variable_migration_transitive_dep_used_by_other_segment
  test('client: helpers shared by two boundaries and an export stay available to each', async () => {
    const { module, lazyChunks } =
      await loadClientModule(`${head}const scrollState = (el) => ({ x: el.x, y: el.y })
const saveScroll = (s) => s.x + s.y
const bigHelper = (el) => saveScroll(scrollState(el))
export const direct = saveScroll(scrollState({ x: 1, y: 1 }))
export function App() {
  return <><Hydrate><p>{bigHelper({ x: 1, y: 2 })}</p></Hydrate><Hydrate><p>{scrollState({ x: 3, y: 4 }).y}</p></Hydrate></>
}`)
    expect(module.direct).toBe(2)
    expect(module.App()).toBe('[<p>3</p>][<p>4</p>]')
    expect(lazyChunks.map((chunk) => chunk.rendered)).toEqual([true, true])
  })

  // Whether the chunk shares the parent's instance of these declarations or
  // declares its own is pinned in known-bugs-hydrate.test.ts (module state
  // initialized once), like a default-exported function, enums and
  // namespaces; only the output is asserted here.
  // Source: Qwik optimizer example_exports (#8504
  // hydrate-split-modules.test.ts)
  test('client: exported declarations of every form used by the children render', async () => {
    const { module, lazyChunks } =
      await loadClientModule(`${head}export const [a, { b }] = ['a', { b: 'b' }]
const exp1 = 'e1'
const internal = 'i'
export { exp1, internal as expr2 }
export function foo() { return 'foo' }
export class Bar { static id = 'bar' }
export function Page() {
  return <Hydrate><p>{[a, b, exp1, internal, foo(), Bar.id].join('|')}</p></Hydrate>
}`)
    expect(module.Page()).toBe('[<p>a|b|e1|i|foo|bar</p>]')
    expectRenderedThroughChunks(lazyChunks)
  })

  // The children render a component the route file exports; the route is
  // created once.
  // Source: hydrate-when-transform.test.ts "unwraps exported declarations
  // needed by extracted virtual modules"
  test('client: an exported component of a route file renders in the chunk, and the route is created once', async () => {
    const created: Array<string> = []
    const { module, lazyChunks } = await loadClientModule(
      `import { createFileRoute } from '@tanstack/react-router'
${head}import { visible } from '@tanstack/react-start/hydration'
export const Route = createFileRoute('/test')({
  component: Page,
})
export const label = 'Ada'
export const Widget = () => {
  return <p>{label}</p>
}
function Page() {
  return <Hydrate when={visible()}><Widget /></Hydrate>
}`,
      {
        stubs: {
          '@tanstack/react-router': {
            createFileRoute: (id: string) => (options: unknown) => {
              created.push(id)
              return { id, options }
            },
          },
        },
      },
    )
    expect(module.Route.options.component()).toBe('[<p>Ada</p>]')
    expectRenderedThroughChunks(lazyChunks)
    expect(created).toEqual(['/test'])
  })

  // Source: Qwik optimizer example_ts_enums (TypeScript-only declaration forms)
  test('client: an overloaded function used by the children keeps its implementation', async () => {
    const { module, lazyChunks } =
      await loadClientModule(`${head}function label(value: string): string
function label(value: number): string
function label(value: unknown) { return 'label:' + String(value) }
export function Page() {
  return <Hydrate><p>{label(1)}</p></Hydrate>
}`)
    expect(module.Page()).toBe('[<p>label:1</p>]')
    expectRenderedThroughChunks(lazyChunks)
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
      const { module, lazyChunks } = await loadClientModule(widgetPage(body))
      expect(module.Page({})).toBe(`[${expected}]`)
      expectRenderedThroughChunks(lazyChunks)
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
        const calls: Array<string> = []
        ;(globalThis as { __hydrateCalls?: Array<string> }).__hydrateCalls =
          calls
        const { module, lazyChunks } = await loadClientModule(
          widgetPage(`function useTracked(label) {
  globalThis.__hydrateCalls.push(label)
  return label
}
function Widget() {
  const unused = ${initializer}
  return <p>widget</p>
}`),
        )
        expect(module.Page({})).toBe('[<p>widget</p>]')
        expectRenderedThroughChunks(lazyChunks)
        expect(calls).toHaveLength(1)
      },
    )
  })
})
