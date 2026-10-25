import { describe, expect, test } from 'vitest'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import { parseSync } from 'vite'
import {
  expectMapsTo,
  positionAt,
  tokenOffsets,
} from '@tanstack/compiler-test-utils/source-maps'
import {
  compileError,
  expectCompileError,
  serverOnlyModule,
} from '../../regression-helpers'
import {
  editableFiles,
  expectHydratedCleanly,
  expectRenderedThroughChunks,
  expectRendersLikeSource,
  lazyCode,
  renderClient,
  renderServer,
  renderSource,
  servedWithMap,
  useEditHost,
  useHydrateHost,
  useSolidHost,
  withoutHydrationIds,
} from '../../render'
import type { SourceMapInput } from '@tanstack/compiler-test-utils/source-maps'

// On the client `<Hydrate>` children move into split code the page loads
// on demand, and the parent renders it in their place; on the server the
// children render inline and the client-only `fallback` is stripped. Both
// must stay valid and behave like the original source: through the public
// Start plugin on a dev server, the server render (React's server renderer
// in the SSR environment) is compared with the uncompiled source, and the
// client hydrates it in a real page (`render.ts`). Where the split code
// lives (how many modules, under which ids) is free (SPEC §5.3).

const hosts = useHydrateHost()
const solidHost = useSolidHost()
const editHost = useEditHost()

/**
 * The directives a served module carries from the user's file: the string
 * expression statements its code starts with, once what the dev server puts
 * in front of every module it serves is skipped (its HMR client setup, the
 * imports it hoists and the interop bindings of the dependencies it
 * rewrites: Vite's own output, which breaks a served module's prologue in
 * dev whatever the compilers do).
 */
function sourceDirectives(code: string) {
  const { program } = parseSync('served.js', code, { sourceType: 'module' })
  const directives: Array<string> = []
  for (const statement of program.body) {
    const text = code.slice(statement.start, statement.end)
    if (
      statement.type === 'ImportDeclaration' ||
      (statement.type === 'ExpressionStatement' &&
        /^import\.meta\.hot\s*=/.test(text)) ||
      (statement.type === 'VariableDeclaration' &&
        text.includes('__vite__cjsImport'))
    ) {
      continue
    }
    if (
      statement.type === 'ExpressionStatement' &&
      statement.expression.type === 'Literal' &&
      typeof statement.expression.value === 'string'
    ) {
      directives.push(statement.expression.value)
      continue
    }
    break
  }
  return directives
}

const head = `import { Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
`

describe('the parent module', () => {
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
  // split code loads.
  test('client: modules and bindings only the split children use are not needed before the chunk loads', async () => {
    const { client } = await expectRendersLikeSource(
      await hosts(),
      widgetPage,
      {
        files: widgetFiles,
        setup: `globalThis.__formatCalls = 0
export const cleanup = ['__formatCalls']`,
        script: 'return globalThis.__formatCalls',
      },
    )
    expect(client.html).toContain('<figure>Revenue!</figure>')
    expect(client.loaded).not.toContain('./chart')
    expect(client.lazy).toContain('./chart')
    // When the parent's own module-level code (`formatValue('Revenue')`) runs
    // is left open; it runs once.
    expect(client.result).toBe(1)
  })

  // Source: #8504 hydrate-split-modules.test.ts
  // Whether the client-only split chunk repeats 'use client' is free: the
  // directive has no effect in a chunk only the client loads (SPEC J5.9).
  test('client: the directives stay in the prologue of the parent module', async () => {
    const client = await renderClient(
      await hosts(),
      `'use client'
'use strict'
${head}import { Chart } from './chart'
export function Page() {
  return <Hydrate when={load()}><Chart /></Hydrate>
}`,
      { files: { './chart': `export const Chart = () => <p>chart</p>` } },
    )
    expectHydratedCleanly(client)
    // Both directives stay in the prologue (before any statement); their
    // order is free (SPEC §5.5).
    expect(sourceDirectives(await client.case.served())).toEqual(
      expect.arrayContaining(['use client', 'use strict']),
    )
  })

  test('client: the split shorthand splits the children', async () => {
    const { client } = await expectRendersLikeSource(
      await hosts(),
      `${head}export function Page() {
  return <Hydrate when={load()} split><p>child</p></Hydrate>
}`,
    )
    expect(client.html).toContain('<p>child</p>')
  })

  // An object that may be observed elsewhere (shared, or returned by a call)
  // may keep its fallback on the server (SPEC J5.3, deferred-hydration docs:
  // "the compiler may keep them"); the boundaries still render their
  // children.
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
      const server = await renderServer(await hosts(), `${head}${code}`)
      const source = await renderSource(await hosts(), `${head}${code}`)
      expect(withoutHydrationIds(server.html)).toBe(source.html)
      for (const child of children) {
        expect(server.html).toContain(child)
      }
    },
  )

  test('server: a split={false} boundary loses a fallback passed through a spread too', async () => {
    const code = `${head}export function Page() {
  return <Hydrate when={load()} split={false} {...{ fallback: <p>server-fallback</p> }}><p>child</p></Hydrate>
}`
    const server = await renderServer(await hosts(), code)
    expect(server.code).not.toContain('server-fallback')
    expect(withoutHydrationIds(server.html)).toBe(
      (await renderSource(await hosts(), code)).html,
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
      render: `h('main', null, h(m.List, { items: ['a', 'b'] }), m.Card('L', 'B'))`,
    }
    const server = await renderServer(await hosts(), code, options)
    expect(withoutHydrationIds(server.html)).toBe(
      (await renderSource(await hosts(), code, options)).html,
    )
    expect(server.html).toContain('<li>0</li>')
    expect(server.html).toContain('<li>1</li>')
    expect(server.html).toContain('<p>B</p>')
  })

  // Source: Qwik optimizer should_transform_handler_in_for_of_loop
  test('server: a loop variable used only by the fallback keeps the module valid', async () => {
    const code = `${head}export function List({ xs }) {
  const out = []
  for (const x of xs) out.push(<Hydrate when={load()} fallback={<p>{x}</p>}><p>child</p></Hydrate>)
  return out
}`
    // The SSR environment serves and evaluates it, and it renders.
    const server = await renderServer(await hosts(), code, {
      render: `h(m.List, { xs: ['a', 'b'] })`,
    })
    expect(server.html.match(/<p>child<\/p>/g)).toHaveLength(2)
  })

  // Source: Qwik optimizer should_keep_non_migrated_binding_from_shared_destructuring_declarator
  test('server: a destructuring shared by the fallback and the children keeps the children binding', async () => {
    const code = `${head}export function Page(props) {
  const { a, b } = props
  return <Hydrate when={load()} fallback={<p>{a}</p>}><p>{b}</p></Hydrate>
}`
    const props = { a: 'A', b: 'B' }
    const server = await renderServer(await hosts(), code, { props })
    expect(withoutHydrationIds(server.html)).toBe(
      (await renderSource(await hosts(), code, { props })).html,
    )
    expect(server.html).toContain('<p>B</p>')
  })

  // Every boundary renders a hydration id (`idle()`): the client hydrates
  // the ids the server rendered.
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
      const { server } = await expectRendersLikeSource(await hosts(), code, {
        render: `h(m.${name}, props)`,
        props,
      })
      expect(server.html).toContain('data-ts-hydrate-id')
    },
  )

  // The route code splitter compiles a route's split component in its own
  // module: the boundaries of a route component, split by the router plugin
  // Start runs, keep the ids the server renders, and their split code loads.
  test('client: a module compiled under an id with another query keeps the server boundary ids', async () => {
    const started = await editHost()
    const file = 'hydrate-split-route.tsx'
    await started.start.edit({
      [`src/routes/${file}`]: `import { createFileRoute } from '@tanstack/react-router'
${head}import { idle } from '@tanstack/react-start/hydration'
export const Route = createFileRoute('/hydrate-split-route')({
  component: Page,
})
function Page() {
  return <div><Hydrate when={idle()}><p>one</p></Hydrate><Hydrate when={idle()}><p>two</p></Hydrate></div>
}`,
    })
    const client = await renderClient(started, '', {
      target: {
        dir: 'src/routes',
        setup: false,
        ssr: (name: string) =>
          started.start.host.importServer(`/src/routes/${name}`),
        served: (name: string, environment: 'client' | 'ssr') =>
          started.start.host.transform(`/src/routes/${name}`, environment),
      },
      file,
      render: 'h(m.Route.options.component)',
      // The router loads a route's split component before it renders it:
      // what loads once hydration starts is the boundaries' split code, not
      // the route code splitter's module of the component
      beforeRender: 'await m.Route.options.component.preload?.()',
      freshPage: true,
    })
    expectHydratedCleanly(client)
    expect(client.html).toBe(client.server.html)
    expectRenderedThroughChunks(client)
    expect(client.html).toContain('<p>one</p>')
    expect(client.html).toContain('<p>two</p>')
  }, 30_000)

  test('client: a split={false} boundary nested in another does not shift the ids of later boundaries', async () => {
    const { client } = await expectRendersLikeSource(
      await hosts(),
      `${head}import { idle } from '@tanstack/react-start/hydration'
export function Page() {
  return <div><Hydrate when={idle()}><section><Hydrate when={idle()} split={false}><b>inline</b></Hydrate></section></Hydrate><Hydrate when={idle()}><p>second</p></Hydrate></div>
}`,
    )
    expect(client.html).toContain('<b>inline</b>')
    expect(client.html).toContain('<p>second</p>')
  })

  test('client: a call whose name only contains "use" is split', async () => {
    const { client } = await expectRendersLikeSource(
      await hosts(),
      `${head}import { houseNumber } from './format'
export function Page() {
  return <Hydrate when={load()}><p>{houseNumber()}</p></Hydrate>
}`,
      { files: { './format.ts': `export const houseNumber = () => '12'` } },
    )
    expect(client.html).toContain('<p>12</p>')
  })

  // The client never receives the server fn's handler code, however the
  // split children reach the server fn (its own caller, or the parent's).
  // Calling it from the children by the id the server runs needs a page.
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
      const client = await renderClient(await hosts(), code, {
        files: { 'db.server.ts': `export const db = { read: (x) => x }` },
      })
      expectHydratedCleanly(client)
      expectRenderedThroughChunks(client)
      const shipped = {
        parent: await client.case.served(),
        ...(await lazyCode(await hosts(), client)),
      }
      for (const [url, output] of Object.entries(shipped)) {
        expect(output, url).not.toContain('greet-handler-marker')
      }
      // Neither the parent nor what it imports, statically or on demand.
      expectNotLoaded(await client.case.loads(), [serverOnlyModule])
      expect(client.lazy).not.toContain(serverOnlyModule)
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
      const { client } = await expectRendersLikeSource(
        await hosts(),
        `${head}export function Page() {
  return <Hydrate when={load()}>${text}</Hydrate>
}`,
      )
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
      const { client } = await expectRendersLikeSource(
        await hosts(),
        `${head}${code}`,
        { props },
      )
      expect(client.html).toContain('label-marker')
    },
  )

  // Server code never reaches the client, the split code included. Where
  // the split code lives and how many modules it takes is free (SPEC §5.3).
  test('client: the chunk does not import what only a server fn handler uses', async () => {
    const client = await renderClient(
      await hosts(),
      `import { Hydrate, createServerFn } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
import { db } from './db'
export const getUser = createServerFn().handler(async () => db.read())
export function Page() {
  return <Hydrate when={load()}><p>child</p></Hydrate>
}`,
      { files: { './db.ts': `export const db = { read: () => 'db' }` } },
    )
    expectHydratedCleanly(client)
    expectRenderedThroughChunks(client)
    // The parent and everything it imports, statically or on demand.
    expectNotLoaded(await client.case.loads(), ['./db'])
    expect(client.lazy).not.toContain('./db')
  })

  // What the click handler returns needs a page.
  // Source: #8504 hydrate-split-modules.test.ts (click handler and IIFE)
  test('client: children may contain return statements', async () => {
    const { client } = await expectRendersLikeSource(
      await hosts(),
      `${head}const letters = ['a', 'b']
export function Page() {
  return <Hydrate when={load()}><ul onClick={() => { return 'click' }}>{letters.map((letter) => { const upper = letter.toUpperCase(); return <li>{upper}</li> })}{(function () { return 'iife' })()}</ul></Hydrate>
}`,
    )
    expect(client.html).toContain('<ul><li>A</li><li>B</li>iife</ul>')
  })

  // `null` children are valid (TypeScript accepts `children={null}` and
  // `{null}`): both environments render the empty boundary the source
  // renders.
  test('client: boundaries with null children render like the source', async () => {
    const { client } = await expectRendersLikeSource(
      await hosts(),
      `${head}import { idle } from '@tanstack/react-start/hydration'
export function Page() {
  return <div><Hydrate when={idle()} children={null} /><Hydrate when={idle()}>{null}</Hydrate></div>
}`,
      { split: false },
    )
    expect(client.server.html.match(/data-ts-hydrate-id=/g)).toHaveLength(2)
  })

  // Not a supported input (TypeScript rejects all three: `children` is a
  // required prop), but a mistake a JavaScript user can make: a boundary
  // without children renders nothing and keeps its props, or is rejected at
  // its line. Leaving it unsplit is valid too.
  // Source: #8504 hydrate-split-modules.test.ts (self-closing row, "a
  // self-closing boundary without a children prop keeps its props")
  test('client: empty, self-closing and comment-only boundaries render nothing and keep their props, or are rejected at their line', async () => {
    const code = `${head}import { idle } from '@tanstack/react-start/hydration'
export function Page() {
  return <div><Hydrate when={idle()}></Hydrate><Hydrate when={idle()} /><Hydrate when={idle()}>{/* nothing */}</Hydrate></div>
}`
    const started = await hosts()
    const startCase = await started.start.case({ 'module.tsx': code })
    let rejected = false
    for (const environment of ['client', 'ssr'] as const) {
      const error = await compileError(startCase, environment)
      if (error !== undefined) {
        // A rejection points at the boundaries' line
        expectCompileError(error, { source: code, at: '<Hydrate' })
        rejected = true
      }
    }
    if (rejected) {
      return
    }
    // The strategy each boundary keeps shows in the markup it renders.
    const { client } = await expectRendersLikeSource(started, code, {
      split: false,
    })
    expect(client.server.html.match(/data-ts-hydrate-id=/g)).toHaveLength(3)
  })

  // Goal: `<Hydrate children={…} />` defers its children like JSX children:
  // the parent does not need their modules before the split code loads.
  // Source: #8504 hydrate-split-modules.test.ts "a children prop moves into
  // the chunk"
  test.each([
    { name: 'last', attributes: 'when={idle()} children={<Chart />}' },
    { name: 'first', attributes: 'children={<Chart />} when={idle()}' },
  ])(
    'client: the children prop ($name) of a self-closing boundary is deferred',
    async ({ attributes }) => {
      const client = await renderClient(
        await hosts(),
        `${head}import { idle } from '@tanstack/react-start/hydration'
import { Chart } from './chart'
export function Page() {
  return <Hydrate ${attributes} />
}`,
        { files: { './chart': `export const Chart = () => 'chart'` } },
      )
      expect(client.loaded).not.toContain('./chart')
      expect(client.lazy).toContain('./chart')
      expect(client.html).toContain('chart')
    },
  )

  // Deferring them is the goal above; either way they render, like on the
  // server.
  test('client: the children prop of a self-closing boundary renders like on the server', async () => {
    const { client } = await expectRendersLikeSource(
      await hosts(),
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
    expect(client.server.html).toContain('data-ts-hydrate-id')
  })

  // The dev server compiles a module again when it changes (here: written
  // again with the same source): a fresh page then gets split code that
  // renders the same children.
  test('client: a chunk id renders the same children when the same source is compiled again', async () => {
    const source = `${head}export function Page() {
  return <Hydrate when={load()}><p>chunk-marker</p></Hydrate>
}`
    const started = await editHost()
    const files = await editableFiles(started, source)
    const render = async () => {
      const rendered = await renderClient(started, '', {
        target: files.target,
        freshPage: true,
      })
      expectHydratedCleanly(rendered)
      expectRenderedThroughChunks(rendered)
      return rendered.html
    }
    const first = await render()
    expect(first).toContain('<p>chunk-marker</p>')
    await files.edit(`${source}\n`)
    expect(await render()).toBe(first)
  }, 30_000)

  // Code in the split code and in the parent maps back to where the user
  // wrote it: the throws of a handler in the parent and of one in the
  // children, located by their parsed string tokens (whatever the printing),
  // resolve through each served module's map to their line and column in
  // the source file. Real stack traces of a built page: hydrate-build.test.ts.
  // Source: #8504 hydrate-split-modules.test.ts.
  test('client: the source maps of the chunk and the parent point at the original code', async () => {
    const source = `${head}import { visible } from '@tanstack/react-start/hydration'
export function Page() {
  const fail = () => {
    throw new Error('parent-throw')
  }
  return (
    <main onClick={fail}>
      <Hydrate when={visible()}>
        <button onClick={() => { throw new Error('child-throw') }}>x</button>
      </Hydrate>
    </main>
  )
}`
    const started = await hosts()
    const client = await renderClient(started, source)
    expectRenderedThroughChunks(client)
    const parent = await servedWithMap(started, client.case.url())
    // The case's split code, whatever its URLs (SPEC §5.3)
    const chunks = await Promise.all(
      client.chunks.map((url) => servedWithMap(started, url)),
    )
    /** Asserts every occurrence of `marker` in `output` maps to the source's. */
    const expectMarkersMapped = (
      output: { code: string; map?: unknown },
      marker: string,
    ) => {
      const offsets = tokenOffsets(output.code, { string: marker })
      const original = positionAt(source, source.indexOf(`'${marker}'`))
      for (const offset of offsets) {
        expectMapsTo(
          output.map as SourceMapInput,
          positionAt(output.code, offset),
          {
            file: client.case.file(),
            line: original.line,
            column: original.column,
          },
        )
      }
      return offsets.length
    }
    // The handler of the parent stays in the parent; the children's is in
    // the split code (wherever else either is copied, it maps back too).
    expect(expectMarkersMapped(parent, 'parent-throw')).toBeGreaterThan(0)
    expectMarkersMapped(parent, 'child-throw')
    let inChunks = 0
    for (const chunk of chunks) {
      inChunks += expectMarkersMapped(chunk, 'child-throw')
      expectMarkersMapped(chunk, 'parent-throw')
    }
    expect(inChunks).toBeGreaterThan(0)
  })

  test('client: the chunks of a module stay loadable after another module is compiled', async () => {
    const started = await hosts()
    const sources = {
      A: `${head}export function A() { return <Hydrate when={load()}><p>first</p></Hydrate> }`,
      B: `${head}export function B() { return <Hydrate when={load()}><p>second</p></Hydrate> }`,
    }
    const startCase = await started.start.case({
      'setup.ts': 'export {}\n',
      'first.tsx': sources.A,
      'second.tsx': sources.B,
    })
    // Both are compiled before either renders.
    await startCase.served('first.tsx')
    await startCase.served('second.tsx')
    for (const [name, file, child] of [
      ['A', 'first.tsx', '<p>first</p>'],
      ['B', 'second.tsx', '<p>second</p>'],
    ] as const) {
      const rendered = await renderClient(started, '', {
        target: startCase,
        file,
        render: `h(m.${name})`,
      })
      expectHydratedCleanly(rendered)
      expectRenderedThroughChunks(rendered)
      expect(rendered.html).toContain(child)
    }
  })

  // SPEC J5.2: a boundary nested in another one has split code of its own,
  // behind its own gate: once the outer gate opens, the outer children's
  // modules load, and the nested children's modules wait for the nested
  // gate (here `never()`, which stays shut). How many modules either split
  // takes is free (SPEC §5.3).
  test('client: the children of a nested boundary wait for its own gate', async () => {
    const client = await renderClient(
      await hosts(),
      `${head}import { never } from '@tanstack/react-start/hydration'
import { Chart } from './chart'
import { Inner } from './inner'
export function Page() {
  return <Hydrate when={load()}><section><Chart /><Hydrate when={never()}><Inner /></Hydrate></section></Hydrate>
}`,
      {
        files: {
          './chart': `export const Chart = () => <figure>chart</figure>`,
          './inner': `export const Inner = () => <p>inner</p>`,
        },
      },
    )
    expectHydratedCleanly(client)
    expect(client.html).toContain('<figure>chart</figure>')
    expect(client.html).toContain('<p>inner</p>')
    expect(client.loaded).not.toContain('./chart')
    expect(client.lazy).toContain('./chart')
    expect(client.loaded).not.toContain('./inner')
    expect(client.lazy).not.toContain('./inner')
  })

  // SPEC J5.2: sibling boundaries have split code of their own, each behind
  // its own gate: opening one gate loads that boundary's children only (how
  // many modules either split takes is free, SPEC §5.3).
  test('client: opening one of two sibling boundaries loads its children only', async () => {
    const client = await renderClient(
      await hosts(),
      `${head}import { interaction } from '@tanstack/react-start/hydration'
import { Chart } from './chart'
import { Table } from './table'
export function Page() {
  return <><Hydrate when={interaction()}><Chart /></Hydrate><Hydrate when={interaction()}><Table /></Hydrate></>
}`,
      {
        files: {
          './chart': `export const Chart = () => <figure>chart</figure>`,
          './table': `export const Table = () => <table><tbody><tr><td>table</td></tr></tbody></table>`,
        },
        gates: `(boundary) => boundary.textContent.includes('chart')`,
      },
    )
    expectHydratedCleanly(client)
    expect(client.html).toContain('<figure>chart</figure>')
    expect(client.html).toContain('<td>table</td>')
    expect(client.loaded).not.toContain('./chart')
    expect(client.loaded).not.toContain('./table')
    expect(client.lazy).toContain('./chart')
    expect(client.lazy).not.toContain('./table')
    expectRenderedThroughChunks(client)
  })

  // The split code of a boundary, and of the nested boundary it contains,
  // uses the packages of the module's framework only (a React module graph
  // has no Solid packages, and the other way around). How many modules the
  // split takes is free (SPEC §5.3).
  test('client: react split code of a boundary and a nested one renders with its own packages', async () => {
    const { client } = await expectRendersLikeSource(
      await hosts(),
      `import { Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
export function Page() {
  return <Hydrate when={load()}><section><Hydrate when={load()}><p>react</p></Hydrate></section></Hydrate>
}`,
    )
    expect(client.html).toContain('<p>react</p>')
    expect(client.lazy.filter((url) => /solid/.test(url))).toEqual([])
    expect(
      (await client.case.loads()).filter((name) => /solid/.test(name)),
    ).toEqual([])
  })

  // A Solid app (`vite-plugin-solid`) mounts the boundary in its page: the
  // split code of the boundary and of the nested one loads and renders,
  // and needs no React package. How many modules the split takes is free
  // (SPEC §5.3).
  test('client: solid split code of a boundary and a nested one is valid and uses the Solid packages only', async () => {
    const solid = await solidHost()
    const mounted =
      await solid.mount(`import { Hydrate } from '@tanstack/solid-start'
import { load } from '@tanstack/solid-start/hydration'
export function Page() {
  return <Hydrate when={load()}><section><Hydrate when={load()}><p>solid</p></Hydrate></section></Hydrate>
}`)
    expect(mounted.errors).toEqual([])
    expect(mounted.html).toContain('<p>solid</p>')
    expect(mounted.lazy).not.toEqual([])
    const isReact = (name: string) =>
      /^(?:\/node_modules\/\.vite\/deps\/)?(react|react-dom)(?:[_/.]|$)|@tanstack\/react-/.test(
        name,
      )
    expect(mounted.lazy.filter(isReact)).toEqual([])
    expect(mounted.loads.filter(isReact)).toEqual([])
    expect(mounted.serverLoads.filter(isReact)).toEqual([])
  })

  // Source: Qwik optimizer example_capture_imports,
  // jsx_member_tag_object_is_captured, example_jsx
  test('client: default, namespace and aliased imports and namespaced names in the children', async () => {
    const { client } = await expectRendersLikeSource(
      await hosts(),
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
          './format.ts': `export const format = (value: string) => \`[\${value}]\`
export default 'dark'`,
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
    const { client } = await expectRendersLikeSource(
      await hosts(),
      `${head}export function Page() {
  return <Hydrate when={load()}><span title="Fish &amp; Chips &copy;" data-q='say "hi"' data-n="a
b" dangerouslySetInnerHTML={{ __html: "<h1>I'm an h1!</h1>" }} /></Hydrate>
}`,
    )
    expect(client.html).toContain("<h1>I'm an h1!</h1>")
  })

  // Source: Qwik optimizer example_default_export
  test('client: an anonymous default-exported component splits its boundary', async () => {
    const { client } = await expectRendersLikeSource(
      await hosts(),
      `${head}const label = 'default'
export default () => <Hydrate when={load()}><p>{label}</p></Hydrate>`,
      { render: 'h(m.default)' },
    )
    expect(client.html).toContain('<p>default</p>')
  })

  // Where the destructuring and the import end up is the bundler's call
  // (hydrate-build.test.ts).
  // Source: Qwik optimizer example_invalid_references,
  // should_migrate_destructured_binding_with_imported_dependency
  test('client: the children read a module-level destructuring of an import', async () => {
    const { client } = await expectRendersLikeSource(
      await hosts(),
      `${head}import { source } from './lib'
const fallback = 'd'
const [a, { b = fallback, ...rest }] = source
export function Page() {
  return <Hydrate when={load()}><p>{[a, b, JSON.stringify(rest)].join('|')}</p></Hydrate>
}`,
      { files: { './lib.ts': `export const source = ['A', { extra: 'x' }]` } },
    )
    expect(client.html).toContain('<p>A|d|{"extra":"x"}</p>')
  })

  // A let the children only write is pinned in known-bugs-hydrate.test.ts.
  // Source: Qwik optimizer should_preserve_let_when_migrated_into_segment
  test('client: a module-level let only the children use stays mutable', async () => {
    const { client } = await expectRendersLikeSource(
      await hosts(),
      `${head}let renders = 0
export function Page() {
  return <Hydrate when={load()}><p>{++renders}</p></Hydrate>
}`,
      {
        render: `[h(m.Page, { key: 'first' }), h(m.Page, { key: 'second' })]`,
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
      const { client } = await expectRendersLikeSource(
        await hosts(),
        `${head}${declaration}
export const fromRoot = () => JSON.stringify(b)
export function Page() {
  return <Hydrate when={load()}><p>{a}</p></Hydrate>
}`,
        { script: 'return m.fromRoot()' },
      )
      expect(client.result).toContain('B')
      expect(client.html).toContain('<p>A</p>')
    },
  )

  // Source: Qwik optimizer should_keep_root_var_used_by_export_decl_and_qrl,
  // example_segment_variable_migration,
  // variable_migration_transitive_dep_used_by_other_segment
  test('client: helpers shared by two boundaries and an export stay available to each', async () => {
    const { client } = await expectRendersLikeSource(
      await hosts(),
      `${head}const scrollState = (el) => ({ x: el.x, y: el.y })
const saveScroll = (s) => s.x + s.y
const bigHelper = (el) => saveScroll(scrollState(el))
export const direct = saveScroll(scrollState({ x: 1, y: 1 }))
export function App() {
  return <><Hydrate when={load()}><p>{bigHelper({ x: 1, y: 2 })}</p></Hydrate><Hydrate when={load()}><p>{scrollState({ x: 3, y: 4 }).y}</p></Hydrate></>
}`,
      { render: 'h(m.App)', script: 'return m.direct' },
    )
    expect(client.result).toBe(2)
    expect(client.html).toContain('<p>3</p>')
    expect(client.html).toContain('<p>4</p>')
  })

  // Whether the split code shares the parent's instance of these
  // declarations or declares its own is pinned in known-bugs-hydrate.test.ts
  // (module state initialized once), like a default-exported function, enums
  // and namespaces; only the output is asserted here.
  // Source: Qwik optimizer example_exports (#8504
  // hydrate-split-modules.test.ts)
  test('client: exported declarations of every form used by the children render', async () => {
    const { client } = await expectRendersLikeSource(
      await hosts(),
      `${head}export const [a, { b }] = ['a', { b: 'b' }]
const exp1 = 'e1'
const internal = 'i'
export { exp1, internal as expr2 }
export function foo() { return 'foo' }
export class Bar { static id = 'bar' }
export function Page() {
  return <Hydrate when={load()}><p>{[a, b, exp1, internal, foo(), Bar.id].join('|')}</p></Hydrate>
}`,
    )
    expect(client.html).toContain('<p>a|b|e1|i|foo|bar</p>')
  })

  describe('a route file', () => {
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
      const { client } = await expectRendersLikeSource(await hosts(), code, {
        files: {
          './track': `export function track(route) {
  globalThis.__routes = (globalThis.__routes ?? 0) + 1
  return route
}`,
        },
        setup: `globalThis.__routes = 0
export const cleanup = ['__routes']`,
        render: 'h(m.Route.options.component)',
        script: 'return globalThis.__routes',
      })
      expect(client.html).toContain('<p>Ada</p>')
      expect(client.result).toBe(1)
    })
  })

  // Source: Qwik optimizer example_ts_enums (TypeScript-only declaration forms)
  test('client: an overloaded function used by the children keeps its implementation', async () => {
    const { client } = await expectRendersLikeSource(
      await hosts(),
      `${head}function label(value: string): string
function label(value: number): string
function label(value: unknown) { return 'label:' + String(value) }
export function Page() {
  return <Hydrate when={load()}><p>{label(1)}</p></Hydrate>
}`,
    )
    expect(client.html).toContain('<p>label:1</p>')
  })

  /** A page whose split child renders `Widget`, declared by `body`. */
  const widgetPage = (body: string) => `${head}${body}
export function Page(props) {
  return <Hydrate when={load()}><Widget {...props} /></Hydrate>
}`

  // A component the children render moves into the split code with the
  // module bindings it reads.
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
      const { client } = await expectRendersLikeSource(
        await hosts(),
        widgetPage(body),
      )
      expect(client.html).toContain(expected)
    },
  )

  describe('side effects of the component bodies it moves', () => {
    // An unused local initialized by a hook call or another side effect must
    // still run when the split code renders: once on the client.
    // Source: React Compiler fixtures react-namespace.js,
    // unused-optional-method-assigned-to-variable.js, error.todo-reassign-const.js
    // One row at a time: each resets a global of this process (the server
    // realm)
    test.each([
      { name: 'a call', initializer: `useTracked('call')` },
      { name: 'an optional call', initializer: `useTracked?.('optional')` },
      {
        name: 'a member read of a call',
        initializer: `useTracked('member').length`,
      },
    ])(
      'client: an unused local initialized by $name still runs',
      { concurrent: false },
      async ({ initializer }) => {
        const code = widgetPage(`function useTracked(label) {
  globalThis.__hydrateCalls.push(label)
  return label
}
function Widget() {
  const unused = ${initializer}
  return <p>widget</p>
}`)
        const { client } = await expectRendersLikeSource(await hosts(), code, {
          setup: `globalThis.__hydrateCalls = []
export const cleanup = ['__hydrateCalls']`,
          script: 'return globalThis.__hydrateCalls.length',
        })
        expect(client.html).toContain('<p>widget</p>')
        expect(client.result).toBe(1)
      },
    )
  })
})
