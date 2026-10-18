import { afterEach, describe, expect, test } from 'vitest'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import { createHydrateCompilerPlugin } from '../src/hydrate-when-transform'
import {
  compileCode,
  compileErrorMessage,
  compileFirstChunk,
  compileHydrate,
  createStartCompiler,
  directivePrologue,
  expectRenderedThroughChunks,
  expectRendersLikeSource,
  getChunkIds,
  importSources,
  loadChunk,
  renderClient,
  renderServer,
  renderSource,
  serverOnlyModule,
  withoutHydrationIds,
} from './regression-helpers'
import { originalPositionOf, positionOf } from './hydrate-helpers'

// On the client `<Hydrate>` children move into a lazily loaded chunk module
// and the parent renders the chunk component in their place; on the server
// the children render inline and the client-only `fallback` is stripped.
// Both modules must stay valid and behave like the original source: the
// outputs are rendered with real React and Start's real `Hydrate`
// (`render.ts`). What only a page can observe (prefetch, clicks, server fn
// calls) is in the integration tests.

const head = `import { Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
`

/** Graph id of a project module given in `files` (`'./chart'`). */
const fileId = (name: string) => `/test/src/${name}.tsx`

describe('the parent module', () => {
  afterEach(() => {
    delete (globalThis as { __formatCalls?: unknown }).__formatCalls
  })

  const widgetPage = `${head}import { visible } from '@tanstack/react-start/hydration'
import { FallbackPane } from './widgets'
import { Chart } from './chart'
import { formatValue } from './format'
const chartTitle = formatValue('Revenue')
export function Page() {
  return <Hydrate when={visible()} fallback={<FallbackPane />}><Chart title={chartTitle} /></Hydrate>
}`
  const widgetFiles = {
    './widgets': `export const FallbackPane = () => <aside>fallback</aside>`,
    './chart': `export const Chart = ({ title }) => <figure>{title}</figure>`,
    './format': `export function formatValue(value) {
  globalThis.__formatCalls = (globalThis.__formatCalls ?? 0) + 1
  return value + '!'
}`,
  }

  // Where the children's code ends up in the final bundle is the bundler's
  // call (hydrate-build.test.ts); the parent must not need it before the
  // chunk loads.
  test('client: modules and bindings only the split children use are not needed before the chunk loads', async () => {
    const { client } = await expectRendersLikeSource(widgetPage, {
      files: widgetFiles,
    })
    expect(client.html).toContain('<figure>Revenue!</figure>')
    // The client output alone.
    ;(globalThis as { __formatCalls?: number }).__formatCalls = 0
    const { requestedAtLoad, lazy } = await renderClient(widgetPage, {
      files: widgetFiles,
    })
    expect(requestedAtLoad).not.toContain(fileId('chart'))
    expect(lazy).toContain(fileId('chart'))
    // When the parent's own module-level code (`formatValue('Revenue')`) runs
    // is left open; it runs once.
    expect((globalThis as { __formatCalls?: number }).__formatCalls).toBe(1)
  })

  // Source: #8504 hydrate-split-modules.test.ts
  test("client: the directive prologue stays first in the parent module and 'use client' in the split chunk", async () => {
    const { parent, plugin } = await compileHydrate(
      'client',
      `'use client'
'use strict'
${head}import { Chart } from './chart'
export function Page() {
  return <Hydrate when={load()}><Chart /></Hydrate>
}`,
    )
    expect(directivePrologue(parent)).toEqual(['use client', 'use strict'])
    // The chunk as the bundler compiles it.
    const chunk =
      (await compileFirstChunk(plugin, parent)).code ??
      loadChunk(plugin, 'client', getChunkIds(parent)[0]!)!
    expect(directivePrologue(chunk)[0]).toBe('use client')
  })

  test('client: the split shorthand splits the children', async () => {
    const { client } =
      await expectRendersLikeSource(`${head}export function Page() {
  return <Hydrate when={load()} split><p>child</p></Hydrate>
}`)
    expect(client.html).toContain('<p>child</p>')
  })

  // An object that may be observed elsewhere (shared, or returned by a call)
  // may keep its fallback on the server; the boundaries still render their
  // children. Stripping the fallback of an object only Hydrate spreads read
  // is the goal (pinned below); seeing through calls is best effort.
  test.each([
    {
      name: 'shared by two boundaries',
      code: `const opts = { fallback: <p>server-fallback</p> }
export function Page() { return <><Hydrate when={load()} {...opts}><p>a</p></Hydrate><Hydrate when={load()} {...opts}><p>b</p></Hydrate></> }`,
      children: ['<p>a</p>', '<p>b</p>'],
    },
    {
      name: 'returned by a call',
      code: `const makeOpts = () => ({ fallback: <p>server-fallback</p> })
const opts = makeOpts()
export function Page() { return <Hydrate when={load()} {...opts}><p>child</p></Hydrate> }`,
      children: ['<p>child</p>'],
    },
  ])(
    'server: boundaries spreading an object $name render their children',
    async ({ code, children }) => {
      const server = await renderServer(`${head}${code}`)
      const source = await renderSource(`${head}${code}`)
      expect(withoutHydrationIds(server.html)).toBe(
        withoutHydrationIds(source.html),
      )
      for (const child of children) {
        expect(server.html).toContain(child)
      }
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
export function Page() { return <><Hydrate when={load()} {...opts}><p>a</p></Hydrate><Hydrate when={load()} {...opts}><p>b</p></Hydrate></> }`,
      )
      expect(await getModuleErrors(parent)).toEqual([])
      expect(parent).not.toContain('server-fallback')
    },
  )

  test('server: a split={false} boundary loses a fallback passed through a spread too', async () => {
    const code = `${head}export function Page() {
  return <Hydrate when={load()} split={false} {...{ fallback: <p>server-fallback</p> }}><p>child</p></Hydrate>
}`
    const { parent } = await compileHydrate('server', code)
    expect(await getModuleErrors(parent)).toEqual([])
    expect(parent).not.toContain('server-fallback')
    const server = await renderServer(code)
    expect(withoutHydrationIds(server.html)).toBe(
      withoutHydrationIds((await renderSource(code)).html),
    )
    expect(server.html).toContain('<p>child</p>')
  })

  // Source: Qwik optimizer example_functional_component_capture_props
  test('server: params used only by the fallback keep later params in place', async () => {
    const code = `${head}export function List({ items }) {
  return <ul>{items.map((item, i) => <Hydrate when={load()} key={i} fallback={<p>{item}</p>}><li>{i}</li></Hydrate>)}</ul>
}
export function Card(label, body) {
  return <Hydrate when={load()} fallback={<p>{label}</p>}><p>{body}</p></Hydrate>
}`
    const options = {
      render: (m: Record<string, any>, h: (...args: Array<any>) => unknown) =>
        h('main', null, h(m.List, { items: ['a', 'b'] }), m.Card('L', 'B')),
    }
    const server = await renderServer(code, options)
    expect(withoutHydrationIds(server.html)).toBe(
      withoutHydrationIds((await renderSource(code, options)).html),
    )
    expect(server.html).toContain('<li>0</li>')
    expect(server.html).toContain('<li>1</li>')
    expect(server.html).toContain('<p>B</p>')
  })

  // Source: Qwik optimizer should_transform_handler_in_for_of_loop
  test('server: a loop variable used only by the fallback keeps the module valid', async () => {
    const { parent } = await compileHydrate(
      'server',
      `${head}export function List({ xs }) {
  const out = []
  for (const x of xs) out.push(<Hydrate when={load()} fallback={<p>{x}</p>}><p>child</p></Hydrate>)
  return out
}`,
    )
    expect(await getModuleErrors(parent)).toEqual([])
  })

  // Source: Qwik optimizer should_keep_non_migrated_binding_from_shared_destructuring_declarator
  test('server: a destructuring shared by the fallback and the children keeps the children binding', async () => {
    const code = `${head}export function Page(props) {
  const { a, b } = props
  return <Hydrate when={load()} fallback={<p>{a}</p>}><p>{b}</p></Hydrate>
}`
    const props = { a: 'A', b: 'B' }
    const server = await renderServer(code, { props })
    expect(withoutHydrationIds(server.html)).toBe(
      withoutHydrationIds((await renderSource(code, { props })).html),
    )
    expect(server.html).toContain('<p>B</p>')
  })

  // Every boundary renders a hydration id (`idle()`): the client renders the
  // ids the server rendered.
  // Source: Qwik optimizer example_mutable_children, issue_5008
  test.each([
    { name: 'Page', props: { flag: true, items: ['x'] } },
    { name: 'Page', props: { flag: false, items: ['x'] } },
    { name: 'Other', props: { early: true } },
    { name: 'Other', props: { early: false } },
  ])(
    'client: boundaries in conditionals and callbacks hydrate like the server renders them: $name $props',
    async ({ name, props }) => {
      const code = `${head}import { idle } from '@tanstack/react-start/hydration'
export function Page({ flag, items }) {
  return <div>
    {flag ? <Hydrate when={idle()}><p>yes</p></Hydrate> : <Hydrate when={idle()}><p>no</p></Hydrate>}
    {flag && <Hydrate when={idle()}><p>and</p></Hydrate>}
    {items.map(function (item, idx) { return <Hydrate when={idle()} key={idx}><p>{'fn' + item}</p></Hydrate> })}
    {items.map((item) => <Hydrate when={idle()} key={item}><p>{'arrow' + item}</p></Hydrate>)}
  </div>
}
export function Other({ early }) {
  if (early) { return <Hydrate when={idle()}><p>early</p></Hydrate> }
  return <Hydrate when={idle()}><p>late</p></Hydrate>
}`
      const { client } = await expectRendersLikeSource(code, {
        render: (m, h) => h(m[name], props),
      })
      expect(client.html).toContain('data-ts-hydrate-id')
    },
  )

  // The route code splitter compiles a route's split component under the
  // route file's id with its own query (`?tsr-split=component`): the
  // boundaries keep the ids the server renders, and their chunks load.
  test('client: a module compiled under an id with another query keeps the server boundary ids', async () => {
    const code = `${head}import { idle } from '@tanstack/react-start/hydration'
export function Page() {
  return <div><Hydrate when={idle()}><p>one</p></Hydrate><Hydrate when={idle()}><p>two</p></Hydrate></div>
}`
    const server = await renderServer(code)
    const client = await renderClient(code, {
      id: '/test/src/module.tsx?tsr-split=component',
    })
    expect(client.html).toBe(server.html)
    expectRenderedThroughChunks(client)
    expect(client.html).toContain('<p>one</p>')
    expect(client.html).toContain('<p>two</p>')
  })

  test('client: a split={false} boundary nested in another does not shift the ids of later boundaries', async () => {
    const { client } =
      await expectRendersLikeSource(`${head}import { idle } from '@tanstack/react-start/hydration'
export function Page() {
  return <div><Hydrate when={idle()}><section><Hydrate when={idle()} split={false}><b>inline</b></Hydrate></section></Hydrate><Hydrate when={idle()}><p>second</p></Hydrate></div>
}`)
    expect(client.html).toContain('<b>inline</b>')
    expect(client.html).toContain('<p>second</p>')
  })

  test('client: a call whose name only contains "use" is split', async () => {
    const { client } = await expectRendersLikeSource(
      `${head}import { houseNumber } from './format'
export function Page() {
  return <Hydrate when={load()}><p>{houseNumber()}</p></Hydrate>
}`,
      { stubs: { './format': { houseNumber: () => '12' } } },
    )
    expect(client.html).toContain('<p>12</p>')
  })

  // The client never receives the server fn's handler code, however the
  // chunk reaches the server fn (its own caller, or the parent's). Calling
  // it from the chunk by the id the server runs needs a page.
  // Source: Qwik optimizer example_strip_exports_used
  test.each([
    {
      name: 'an exported server fn also called by the parent',
      code: `import { Hydrate, createServerFn } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
import { db } from '${serverOnlyModule}'
export const greet = createServerFn().handler(async () => db.read('greet-handler-marker'))
export function Page() {
  return <><button onClick={() => greet()}>a</button><Hydrate when={load()}><button onClick={() => greet()}>b</button></Hydrate></>
}`,
    },
    {
      name: 'a private server fn only called by the children',
      code: `import { Hydrate, createServerFn } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
import { db } from '${serverOnlyModule}'
const greet = createServerFn().handler(async () => db.read('greet-handler-marker'))
export function Page() {
  return <Hydrate when={load()}><button onClick={() => greet()}>b</button></Hydrate>
}`,
    },
  ])(
    'client: $name keeps its handler out of the parent and the split chunk',
    async ({ code }) => {
      const { parent, plugin } = await compileHydrate('client', code)
      // The chunk as the bundler compiles it.
      const chunk =
        (await compileFirstChunk(plugin, parent)).code ??
        loadChunk(plugin, 'client', getChunkIds(parent)[0]!)!
      for (const output of [parent, chunk]) {
        expect(await getModuleErrors(output)).toEqual([])
        expect(output).not.toContain('greet-handler-marker')
        expect(importSources(output)).not.toContain(serverOnlyModule)
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
    {
      name: 'entities',
      text: '&amp; &#38; &#x26;',
      rendered: '&amp; &amp; &amp;',
    },
    {
      name: 'numeric entities',
      text: '&copy; &#169; &#xA9;',
      rendered: '© © ©',
    },
  ])(
    'client: a text-only child renders like JSX text: $name',
    async ({ text, rendered }) => {
      const { client } =
        await expectRendersLikeSource(`${head}export function Page() {
  return <Hydrate when={load()}>${text}</Hydrate>
}`)
      expect(client.html).toContain(rendered)
    },
  )

  // A wrapper component forwarding its children through a boundary keeps
  // them after hydration.
  test.each([
    {
      name: 'a captured prop',
      code: `export function Page({ label }) {
  return <Hydrate when={load()}>{label}</Hydrate>
}`,
      props: { label: 'label-marker' },
    },
    {
      name: 'the children of a wrapper',
      code: `export function Page(props) {
  return <Hydrate when={load()}>{props.children}</Hydrate>
}`,
      props: { children: 'label-marker' },
    },
  ])(
    'client: a single expression child ($name) renders through the chunk',
    async ({ code, props }) => {
      const { client } = await expectRendersLikeSource(`${head}${code}`, {
        props,
      })
      expect(client.html).toContain('label-marker')
    },
  )

  // Server code never reaches the client, the chunk included.
  test('client: the chunk does not import what only a server fn handler uses', async () => {
    const { parent, plugin } = await compileHydrate(
      'client',
      `import { Hydrate, createServerFn } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
import { db } from './db'
export const getUser = createServerFn().handler(async () => db.read())
export function Page() {
  return <Hydrate when={load()}><p>child</p></Hydrate>
}`,
    )
    expect(getChunkIds(parent)).toHaveLength(1)
    // The chunk as the bundler compiles it.
    const chunk =
      (await compileFirstChunk(plugin, parent)).code ??
      loadChunk(plugin, 'client', getChunkIds(parent)[0]!)!
    for (const output of [parent, chunk]) {
      expect(importSources(output)).not.toContain('./db')
    }
  })

  // What the click handler returns needs a page.
  // Source: #8504 hydrate-split-modules.test.ts (click handler and IIFE)
  test('client: children may contain return statements', async () => {
    const { client } = await expectRendersLikeSource(
      `${head}const letters = ['a', 'b']
export function Page() {
  return <Hydrate when={load()}><ul onClick={() => { return 'click' }}>{letters.map((letter) => { const upper = letter.toUpperCase(); return <li>{upper}</li> })}{(function () { return 'iife' })()}</ul></Hydrate>
}`,
    )
    expect(client.html).toContain('<ul><li>A</li><li>B</li>iife</ul>')
  })

  // `children` is a required prop: a boundary without children is a mistake
  // a JavaScript user can make. It renders nothing and keeps its props, or
  // is rejected clearly. Leaving it unsplit is valid too.
  // Source: #8504 hydrate-split-modules.test.ts (self-closing row, "a
  // self-closing boundary without a children prop keeps its props")
  test('client: empty, self-closing and comment-only boundaries render nothing and keep their props, or are rejected clearly', async () => {
    const code = `${head}import { idle } from '@tanstack/react-start/hydration'
export function Page() {
  return <div><Hydrate when={idle()}></Hydrate><Hydrate when={idle()} /><Hydrate when={idle()}>{/* nothing */}</Hydrate></div>
}`
    const errors: Array<string> = []
    for (const env of ['client', 'server'] as const) {
      await compileHydrate(env, code).catch((error: unknown) => {
        errors.push(compileErrorMessage(error))
      })
    }
    if (errors.length > 0) {
      expect(errors).toContainEqual(expect.stringMatching(/\bHydrate\b/))
      return
    }
    // The strategy each boundary keeps shows in the markup it renders.
    const { client } = await expectRendersLikeSource(code, { split: false })
    expect(client.html.match(/data-ts-hydrate-id=/g)).toHaveLength(3)
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
      const { html, requestedAtLoad, lazy } = await renderClient(
        `${head}import { idle } from '@tanstack/react-start/hydration'
import { Chart } from './chart'
export function Page() {
  return <Hydrate ${attributes} />
}`,
        { files: { './chart': `export const Chart = () => 'chart'` } },
      )
      expect(requestedAtLoad).not.toContain(fileId('chart'))
      expect(lazy).toContain(fileId('chart'))
      expect(html).toContain('chart')
    },
  )

  // Deferring them is the goal above; either way they render, like on the
  // server.
  test('client: the children prop of a self-closing boundary renders like on the server', async () => {
    const { client } = await expectRendersLikeSource(
      `${head}import { idle } from '@tanstack/react-start/hydration'
import { Chart } from './chart'
export function Page() {
  return <section><Hydrate when={idle()} children={<Chart />} /></section>
}`,
      {
        files: { './chart': `export const Chart = () => 'chart'` },
        split: false,
      },
    )
    expect(client.html).toContain('chart')
    expect(client.html).toContain('data-ts-hydrate-id')
  })

  test('client: a chunk id renders the same children when the same source is compiled again', async () => {
    const source = `${head}export function Page() {
  return <Hydrate when={load()}><p>chunk-marker</p></Hydrate>
}`
    const { parent, plugin } = await compileHydrate('client', source)
    const render = async () => {
      const rendered = await renderClient(source, {
        compiled: { parent, plugin },
      })
      expectRenderedThroughChunks(rendered)
      return rendered.html
    }
    const first = await render()
    expect(first).toContain('<p>chunk-marker</p>')
    await compileCode('client', source, { compilerPlugins: [plugin] })
    expect(await render()).toBe(first)
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
    const sources = {
      A: `${head}export function A() { return <Hydrate when={load()}><p>first</p></Hydrate> }`,
      B: `${head}export function B() { return <Hydrate when={load()}><p>second</p></Hydrate> }`,
    }
    const ids = { A: '/test/src/first.tsx', B: '/test/src/second.tsx' }
    const parents = {
      A: (await compile(sources.A, ids.A))!,
      B: (await compile(sources.B, ids.B))!,
    }
    for (const [name, child] of [
      ['A', '<p>first</p>'],
      ['B', '<p>second</p>'],
    ] as const) {
      const rendered = await renderClient(sources[name], {
        id: ids[name],
        compiled: { parent: parents[name], plugin },
        render: (m, h) => h(m[name]),
      })
      expectRenderedThroughChunks(rendered)
      expect(rendered.html).toContain(child)
    }
  })

  // The bundler may load a chunk with the source module's code before the
  // plugin compiled that module (e.g. in a fresh build worker); the chunk,
  // and the nested boundary it splits again, use the packages of the
  // module's framework only (a Solid module graph has no React packages, and
  // the other way around).
  test('client: react chunks loaded from the source code alone render with their own packages', async () => {
    const { client } = await expectRendersLikeSource(
      `import { Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
export function Page() {
  return <Hydrate when={load()}><section><Hydrate when={load()}><p>react</p></Hydrate></section></Hydrate>
}`,
      { chunksFromSource: true },
    )
    expect(client.html).toContain('<p>react</p>')
    // The boundary and the nested one each load their chunk (J5.2).
    expect(client.loadedChunks.length).toBeGreaterThan(1)
    expect(
      client.graph.requested.filter((specifier) => /solid/.test(specifier)),
    ).toEqual([])
  })

  // `@tanstack/solid-router` cannot be linked in process (`render.ts`): the
  // Solid outputs are compiled and checked for validity and packages only.
  test('client: solid chunks loaded from the source code alone are valid and use the Solid packages only', async () => {
    const source = `import { Hydrate } from '@tanstack/solid-start'
import { load } from '@tanstack/solid-start/hydration'
export function Page() {
  return <Hydrate when={load()}><section><Hydrate when={load()}><p>solid</p></Hydrate></section></Hydrate>
}`
    const { parent } = await compileHydrate('client', source, {
      framework: 'solid',
    })
    expect(getChunkIds(parent)).not.toEqual([])
    // Each chunk is loaded by a plugin that did not compile the parent, from
    // the source code, and compiled like the bundler compiles it (which
    // splits the nested boundary again).
    const outputs = [parent]
    const pending = [...getChunkIds(parent)]
    while (pending.length > 0) {
      const id = pending.shift()!
      const plugin = createHydrateCompilerPlugin()
      const chunk = loadChunk(plugin, 'client', id, source)
      expect(chunk, id).not.toBeNull()
      const { compile } = createStartCompiler({
        env: 'client',
        compilerPlugins: [plugin],
        framework: 'solid',
      })
      const compiled = (await compile(chunk!, id)) ?? chunk!
      outputs.push(compiled)
      pending.push(...getChunkIds(compiled))
    }
    expect(outputs.length).toBeGreaterThan(2)
    for (const output of outputs) {
      expect(await getModuleErrors(output, undefined, { source })).toEqual([])
      expect(
        importSources(output).filter((specifier) =>
          /^(react|react-dom|@tanstack\/react-)/.test(specifier),
        ),
      ).toEqual([])
    }
  })

  // Source: Qwik optimizer example_capture_imports,
  // jsx_member_tag_object_is_captured, example_jsx
  test('client: default, namespace and aliased imports and namespaced names in the children', async () => {
    const { client } = await expectRendersLikeSource(
      `${head}import Chart from './chart'
import * as UI from './ui'
import { format as fmt, default as theme } from './format'
export function Page() {
  return <Hydrate when={load()}><Chart /><UI.Button label={fmt(theme)} /><svg><use xlink:href="#icon" /></svg></Hydrate>
}`,
      {
        files: {
          './chart': `export default () => <figure>chart</figure>`,
          './ui': `export const Button = ({ label }) => <button>{label}</button>`,
        },
        stubs: {
          './format': {
            format: (value: string) => `[${value}]`,
            default: 'dark',
          },
        },
      },
    )
    expect(client.html).toContain(
      '<figure>chart</figure><button>[dark]</button>',
    )
    expect(client.html).toContain('#icon')
  })

  // Source: Qwik optimizer should_handle_dangerously_set_inner_html
  test('client: string attributes keep their value', async () => {
    // The markup comparison covers every attribute value.
    const { client } =
      await expectRendersLikeSource(`${head}export function Page() {
  return <Hydrate when={load()}><span title="Fish &amp; Chips &copy;" data-q='say "hi"' data-n="a
b" dangerouslySetInnerHTML={{ __html: "<h1>I'm an h1!</h1>" }} /></Hydrate>
}`)
    expect(client.html).toContain("<h1>I'm an h1!</h1>")
  })

  // Source: Qwik optimizer example_default_export
  test('client: an anonymous default-exported component splits its boundary', async () => {
    const { client } = await expectRendersLikeSource(
      `${head}const label = 'default'
export default () => <Hydrate when={load()}><p>{label}</p></Hydrate>`,
      { render: (m, h) => h(m.default) },
    )
    expect(client.html).toContain('<p>default</p>')
  })

  // Where the destructuring and the import end up is the bundler's call
  // (hydrate-build.test.ts).
  // Source: Qwik optimizer example_invalid_references,
  // should_migrate_destructured_binding_with_imported_dependency
  test('client: the children read a module-level destructuring of an import', async () => {
    const { client } = await expectRendersLikeSource(
      `${head}import { source } from './lib'
const fallback = 'd'
const [a, { b = fallback, ...rest }] = source
export function Page() {
  return <Hydrate when={load()}><p>{[a, b, JSON.stringify(rest)].join('|')}</p></Hydrate>
}`,
      { stubs: { './lib': { source: ['A', { extra: 'x' }] } } },
    )
    expect(client.html).toContain(
      '<p>A|d|{&quot;extra&quot;:&quot;x&quot;}</p>',
    )
  })

  // A let the children only write is pinned in known-bugs-hydrate.test.ts.
  // Source: Qwik optimizer should_preserve_let_when_migrated_into_segment
  test('client: a module-level let only the children use stays mutable', async () => {
    const { client } = await expectRendersLikeSource(
      `${head}let renders = 0
export function Page() {
  return <Hydrate when={load()}><p>{++renders}</p></Hydrate>
}`,
      {
        render: (m, h) => [
          h(m.Page, { key: 'first' }),
          h(m.Page, { key: 'second' }),
        ],
      },
    )
    expect(client.html).toContain('<p>1</p>')
    expect(client.html).toContain('<p>2</p>')
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
      const { client } = await expectRendersLikeSource(`${head}${declaration}
export const fromRoot = () => JSON.stringify(b)
export function Page() {
  return <Hydrate when={load()}><p>{a}</p></Hydrate>
}`)
      expect(client.module.fromRoot()).toContain('B')
      expect(client.html).toContain('<p>A</p>')
    },
  )

  // Source: Qwik optimizer should_keep_root_var_used_by_export_decl_and_qrl,
  // example_segment_variable_migration,
  // variable_migration_transitive_dep_used_by_other_segment
  test('client: helpers shared by two boundaries and an export stay available to each', async () => {
    const { client } = await expectRendersLikeSource(
      `${head}const scrollState = (el) => ({ x: el.x, y: el.y })
const saveScroll = (s) => s.x + s.y
const bigHelper = (el) => saveScroll(scrollState(el))
export const direct = saveScroll(scrollState({ x: 1, y: 1 }))
export function App() {
  return <><Hydrate when={load()}><p>{bigHelper({ x: 1, y: 2 })}</p></Hydrate><Hydrate when={load()}><p>{scrollState({ x: 3, y: 4 }).y}</p></Hydrate></>
}`,
      { render: (m, h) => h(m.App) },
    )
    expect(client.module.direct).toBe(2)
    expect(client.html).toContain('<p>3</p>')
    expect(client.html).toContain('<p>4</p>')
  })

  // Whether the chunk shares the parent's instance of these declarations or
  // declares its own is pinned in known-bugs-hydrate.test.ts (module state
  // initialized once), like a default-exported function, enums and
  // namespaces; only the output is asserted here.
  // Source: Qwik optimizer example_exports (#8504
  // hydrate-split-modules.test.ts)
  test('client: exported declarations of every form used by the children render', async () => {
    const { client } =
      await expectRendersLikeSource(`${head}export const [a, { b }] = ['a', { b: 'b' }]
const exp1 = 'e1'
const internal = 'i'
export { exp1, internal as expr2 }
export function foo() { return 'foo' }
export class Bar { static id = 'bar' }
export function Page() {
  return <Hydrate when={load()}><p>{[a, b, exp1, internal, foo(), Bar.id].join('|')}</p></Hydrate>
}`)
    expect(client.html).toContain('<p>a|b|e1|i|foo|bar</p>')
  })

  describe('a route file', () => {
    afterEach(() => {
      delete (globalThis as { __routes?: unknown }).__routes
    })

    // The children render a component the route file exports; the route is
    // created once (`track` counts the creations).
    // Source: hydrate-when-transform.test.ts "unwraps exported declarations
    // needed by extracted virtual modules"
    test('client: an exported component of a route file renders in the chunk, and the route is created once', async () => {
      const code = `import { createFileRoute } from '@tanstack/react-router'
${head}import { visible } from '@tanstack/react-start/hydration'
import { track } from './track'
export const Route = track(createFileRoute('/test')({
  component: Page,
}))
export const label = 'Ada'
export const Widget = () => {
  return <p>{label}</p>
}
function Page() {
  return <Hydrate when={visible()}><Widget /></Hydrate>
}`
      const options = {
        files: {
          './track': `export function track(route) {
  globalThis.__routes = (globalThis.__routes ?? 0) + 1
  return route
}`,
        },
        render: (m: Record<string, any>, h: (...args: Array<any>) => unknown) =>
          h(m.Route.options.component),
      }
      const { client } = await expectRendersLikeSource(code, options)
      expect(client.html).toContain('<p>Ada</p>')
      // The client output alone.
      ;(globalThis as { __routes?: number }).__routes = 0
      expectRenderedThroughChunks(await renderClient(code, options))
      expect((globalThis as { __routes?: number }).__routes).toBe(1)
    })
  })

  // Source: Qwik optimizer example_ts_enums (TypeScript-only declaration forms)
  test('client: an overloaded function used by the children keeps its implementation', async () => {
    const { client } =
      await expectRendersLikeSource(`${head}function label(value: string): string
function label(value: number): string
function label(value: unknown) { return 'label:' + String(value) }
export function Page() {
  return <Hydrate when={load()}><p>{label(1)}</p></Hydrate>
}`)
    expect(client.html).toContain('<p>label:1</p>')
  })

  /** A page whose split child renders `Widget`, declared by `body`. */
  const widgetPage = (body: string) => `${head}${body}
export function Page(props) {
  return <Hydrate when={load()}><Widget {...props} /></Hydrate>
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
      expected: '<p>thrown<!-- -->-<!-- -->module</p>',
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
      expected: '<p>local<!-- -->/<!-- -->module</p>',
    },
    {
      // destructure-*-default fixtures
      name: 'parameter defaults reading module bindings',
      body: `const fallback = 'fb'
function Widget({ title = fallback, items: [first = fallback.toUpperCase()] = [] }) {
  return <p>{title}{first}</p>
}`,
      expected: '<p>fb<!-- -->FB</p>',
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
      const { client } = await expectRendersLikeSource(widgetPage(body))
      expect(client.html).toContain(expected)
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
        const code = widgetPage(`function useTracked(label) {
  globalThis.__hydrateCalls.push(label)
  return label
}
function Widget() {
  const unused = ${initializer}
  return <p>widget</p>
}`)
        const { client } = await expectRendersLikeSource(code)
        expect(client.html).toContain('<p>widget</p>')
        // The client output alone.
        calls.length = 0
        expectRenderedThroughChunks(await renderClient(code))
        expect(calls).toHaveLength(1)
      },
    )
  })
})
