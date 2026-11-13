import { describe, expect, it, vi } from 'vitest'
import { MemoryHost, dedent } from './helpers'
import { engine, rangeOf } from './engine'
import type { OutputId, PlanContext, Planner } from '../src/compiler'
import type { Anchor, EditScope } from '../src/compiler/rewrite'

describe('rewrite tree', () => {
  it('nests an inner edit inside a retained child slice and drops one inside erased text', () => {
    const code = dedent(`
      import { wrapServer, clientOnly } from 'toy-start'
      export const fn = wrapServer(() => { const inner = clientOnly(() => 1); return inner })
      export const other = wrapServer(() => 2)
    `)
    const e = engine(code)
    const { rewrites } = e.ctx
    const outer = rangeOf(
      code,
      'wrapServer(() => { const inner = clientOnly(() => 1); return inner })',
    )
    const arg = rangeOf(
      code,
      '() => { const inner = clientOnly(() => 1); return inner }',
    )
    rewrites.edit({
      range: outer,
      body: [
        { k: 'text', parts: ['tsrRpc('] },
        { k: 'slice', range: arg },
        { k: 'text', parts: [')'] },
      ],
      by: 'a',
    })
    const innerCall = rangeOf(code, 'clientOnly(() => 1)')
    rewrites.edit({
      range: innerCall,
      body: [{ k: 'text', parts: ['(() => {})'] }],
      by: 'b',
    })
    const second = rangeOf(code, 'wrapServer(() => 2)')
    rewrites.edit({
      range: second,
      body: [{ k: 'text', parts: ['tsrStub()'] }],
      by: 'a',
    })
    // an edit inside the erased argument of the second call is dead
    rewrites.edit({
      range: rangeOf(code, '2)'),
      body: [{ k: 'text', parts: ['3'] }],
      by: 'c',
    })
    const out = e.render().code
    expect(out).toContain(
      'export const fn = tsrRpc(() => { const inner = (() => {}); return inner })',
    )
    expect(out).toContain('export const other = tsrStub()')
    expect(out).not.toContain('3')
  })

  it('renders structured text through symbol names and reports conflicts per output', () => {
    const code = dedent(`
      const a = 1
      const b = 2
    `)
    const e = engine(code)
    const { rewrites, names } = e.ctx
    const gen = names.alloc('tsrHelper')
    rewrites.addGenerated({
      body: [
        {
          k: 'text',
          parts: [
            'const ',
            { sym: gen.sym },
            ' = () => ',
            { sym: e.ctx.t1.units[0]!.declares[0]! },
            '\n',
          ],
        },
      ],
      declares: [gen.sym],
      effectful: false,
      anchor: { k: 'end' },
      home: 'auto',
      by: 't',
    })
    // reads the generated symbol from an effect unit so it is needed
    rewrites.edit({
      range: rangeOf(code, '2'),
      body: [{ k: 'text', parts: [{ sym: gen.sym, ctx: 'callee' }, '()'] }],
      by: 't',
    })
    expect(e.render().code).toBe(
      'const a = 1\nconst b = tsrHelper()\nconst tsrHelper = () => a\n',
    )
  })

  it('rejects partial overlaps and differing bodies on one range, dedupes identical edits', () => {
    const code = 'const a = 1 + 2 + 3\n'
    {
      const e = engine(code)
      e.ctx.rewrites.edit({
        range: rangeOf(code, '1 + 2'),
        body: [],
        by: 'x',
      })
      // (one region tree for every output: the second range conflicts as it
      // is registered)
      expect(() =>
        e.ctx.rewrites.edit({
          range: rangeOf(code, '2 + 3'),
          body: [],
          by: 'y',
        }),
      ).toThrow(/partially overlaps/)
    }
    {
      const e = engine(code)
      e.ctx.rewrites.edit({
        range: rangeOf(code, '1 + 2'),
        body: [{ k: 'text', parts: ['9'] }],
        by: 'x',
      })
      e.ctx.rewrites.edit({
        range: rangeOf(code, '1 + 2'),
        body: [{ k: 'text', parts: ['8'] }],
        by: 'y',
      })
      expect(() => e.render()).toThrow(/different bodies/)
    }
    {
      const e = engine(code)
      e.ctx.rewrites.edit({
        range: rangeOf(code, '1 + 2'),
        body: [{ k: 'text', parts: ['9'] }],
        by: 'x',
      })
      e.ctx.rewrites.edit({
        range: rangeOf(code, '1 + 2'),
        body: [{ k: 'text', parts: ['9'] }],
        by: 'y',
      })
      expect(e.render().code).toBe('const a = 9 + 3\n')
    }
  })

  it('erases a property in the env output only with a placeholder there (deleteNodes)', () => {
    const code = dedent(`
      export const Route = { ssr: false, component: 1 }
    `)
    const e = engine(code)
    const chunk: OutputId = e.ctx.declareOutput({
      kind: 'split',
      key: 'x',
      derived: { kind: 'split', value: 'x' },
      roots: [{ t: 'unit', id: 0 }],
    })
    e.ctx.rewrites.placeholder({
      range: rangeOf(code, 'ssr: false, '),
      body: [],
      scope: ['env'],
      by: 'split',
    })
    expect(e.render('env').code).toBe('export const Route = { component: 1 }\n')
    // exported clusters stay in the env module; the chunk imports them
    expect(e.render(chunk).code).toBe(
      "import { Route } from '/app/route.tsx'\n",
    )
  })
})

describe('context-aware reference rewrites', () => {
  it('renames across plain, callee, shorthand, export specifier, JSX and assignment contexts', () => {
    const code = dedent(`
      let page = () => <div/>
      const o = { page, p: page }
      page()
      page\`x\`
      page = () => null
      page++
      export { page }
      export { page as p2 }
      export default page
    `)
    const e = engine(code)
    const sym = e.ctx.t1.units[0]!.declares[0]!
    const to = e.ctx.names.alloc('TsrPage')
    e.ctx.renameRefs(sym, { sym: to.sym }, 'hmr')
    const out = e.render().code
    expect(out).toBe(
      dedent(`
      let TsrPage = () => <div/>
      const o = { page: TsrPage, p: TsrPage }
      TsrPage()
      TsrPage\`x\`
      TsrPage = () => null
      TsrPage++
      export { TsrPage as page }
      export { TsrPage as p2 }
      export default TsrPage
    `),
    )
  })

  it('keeps the property a shorthand with a default names, in a pattern below the declaration', () => {
    const code = dedent(`
      var page = 1
      if (o) { var { page = 2 } = o }
      ;({ page = 3 } = o)
      for (var { page = 4 } of list) {}
      const f = ({ a = page }) => a
    `)
    const e = engine(code)
    const sym = e.ctx.t1.units[0]!.declares[0]!
    const to = e.ctx.names.alloc('TsrPage')
    e.ctx.renameRefs(sym, { sym: to.sym }, 'hmr')
    expect(e.render().code).toBe(
      dedent(`
      var TsrPage = 1
      if (o) { var { page: TsrPage = 2 } = o }
      ;({ page: TsrPage = 3 } = o)
      for (var { page: TsrPage = 4 } of list) {}
      const f = ({ a = TsrPage }) => a
    `),
    )
  })

  it('renames JSX tags (open and close) of a component binding', () => {
    const code = dedent(`
      const Foo = () => null
      const el = <Foo><Foo/></Foo>
    `)
    const e = engine(code)
    const sym = e.ctx.t1.units[0]!.declares[0]!
    e.ctx.renameRefs(sym, { sym: e.ctx.names.alloc('TsrFoo').sym }, 'hmr')
    expect(e.render().code).toBe(
      dedent(`
      const TsrFoo = () => null
      const el = <TsrFoo><TsrFoo/></TsrFoo>
    `),
    )
  })

  it('rewrites a bare callee to a member target as an unbound call', () => {
    const code = dedent(`
      function read() { return 1 }
      const x = read() + read?.() + read\`t\`
    `)
    const e = engine(code)
    const sym = e.ctx.t1.units[0]!.declares[0]!
    const props = e.ctx.names.alloc('props')
    for (const ref of e.ctx.t1.refs.refsOf(sym)) {
      e.ctx.rewrites.ref(ref, { member: [props.sym, 'read'] }, 'hydrate')
    }
    const out = e.render().code
    expect(out).toContain(
      'const x = (0, props.read)() + (0, props.read)?.() + (0, props.read)`t`',
    )
  })

  it('renames a directly exported declaration via the statement-level recipe', () => {
    const code = dedent(`
      export function page() { return null }
      export const other = 1
      export default function home() {}
    `)
    const e = engine(code)
    const pageSym = e.ctx.t1.units[0]!.declares[0]!
    const homeSym = e.ctx.t1.units[2]!.declares[0]!
    e.ctx.renameRefs(pageSym, { sym: e.ctx.names.alloc('TsrPage').sym }, 'hmr')
    e.ctx.renameRefs(homeSym, { sym: e.ctx.names.alloc('TsrHome').sym }, 'hmr')
    const out = e.render().code
    expect(out).toBe(
      dedent(`
      function TsrPage() { return null }
      export const other = 1
      export default function TsrHome() {}
      export { TsrPage as page }
    `),
    )
  })

  it('re-exports every binding of a renamed declarator and its siblings under its own name', () => {
    const code = dedent(`
      export const { page, meta } = views
      export const other = 1, { a, b } = parts
    `)
    const e = engine(code)
    const [pageSym] = e.ctx.t1.units[0]!.declares
    const [otherSym] = e.ctx.t1.units[1]!.declares
    e.ctx.renameRefs(pageSym!, { sym: e.ctx.names.alloc('TsrPage').sym }, 'hmr')
    e.ctx.renameRefs(
      otherSym!,
      { sym: e.ctx.names.alloc('TsrOther').sym },
      'hmr',
    )
    const out = e.render().code
    expect(out).toBe(
      dedent(`
      const { page: TsrPage, meta } = views
      const TsrOther = 1, { a, b } = parts
      export { meta, a, b, TsrPage as page, TsrOther as other }
    `),
    )
  })
})

describe('claims, homes and substitution', () => {
  it('relocates a claimed region into its owner and renders the placeholder at the occurrence', () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      export const Route = createFileRoute('/')({
        component: () => <p>hi</p>,
      })
    `)
    const e = engine(code)
    const { ctx } = e
    const value = rangeOf(code, '() => <p>hi</p>')
    const region = ctx.region(value, 'option-value')
    const hoisted = ctx.names.alloc('TsrComponent')
    // intra-output relocation: the hoist renders before the Route unit AND the option reads it
    const owner = ctx.rewrites.addGenerated({
      body: [
        { k: 'text', parts: ['const ', { sym: hoisted.sym }, ' = '] },
        { k: 'region', id: region },
        { k: 'text', parts: ['\n'] },
      ],
      declares: [hoisted.sym],
      effectful: false,
      anchor: { k: 'before-unit', unit: 1 },
      home: 'auto',
      by: 'hmr',
    })
    ctx.rewrites.claim({
      region,
      owner,
      placeholder: [{ k: 'text', parts: [{ sym: hoisted.sym }] }],
      by: 'hmr',
    })
    expect(e.render().code).toBe(
      dedent(`
      import { createFileRoute } from 'toy-router'
      const TsrComponent = () => <p>hi</p>
      export const Route = createFileRoute('/')({
        component: TsrComponent,
      })
    `),
    )
  })

  it('finds what stands at exactly a range, and nothing on a range inside it', () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      export const Route = createFileRoute('/')({
        loader: wrapServer(() => 1),
      })
    `)
    const { ctx } = engine(code)
    const value = rangeOf(code, 'wrapServer(() => 1)')
    const hoisted = ctx.names.alloc('tsrHoisted')
    const owner = ctx.rewrites.addGenerated({
      body: [
        { k: 'text', parts: ['const ', { sym: hoisted.sym }, ' = '] },
        { k: 'region', id: ctx.region(value, 'nested-chain') },
        { k: 'text', parts: ['\n'] },
      ],
      declares: [hoisted.sym],
      effectful: false,
      anchor: { k: 'after-header' },
      home: 'auto',
      by: 'hoist',
    })
    ctx.rewrites.claim({
      region: ctx.region(value, 'nested-chain'),
      owner,
      placeholder: [{ k: 'text', parts: [{ sym: hoisted.sym }] }],
      by: 'hoist',
      subject: 'a hoisted call',
    })
    // (the planner that would claim the same text as an option value asks first)
    const env = ctx.rewrites.view('env')
    expect(env.placeholderAt(value)).toMatchObject({
      by: 'hoist',
      subject: 'a hoisted call',
    })
    expect(env.placeholderAt(rangeOf(code, '() => 1'))).toBeNull()
  })

  it('homes the hoist in the chunk when only the chunk roots the placeholder', () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { useThing } from './thing'
      export const Route = createFileRoute('/')({
        component: () => { useThing(); return <p>hi</p> },
      })
    `)
    const e = engine(code)
    const { ctx } = e
    ctx.setRouteModule()
    const value = rangeOf(code, '() => { useThing(); return <p>hi</p> }')
    const region = ctx.region(value, 'option-value')
    const hoisted = ctx.names.alloc('TsrComponent')
    const owner = ctx.rewrites.addGenerated({
      body: [
        { k: 'text', parts: ['const ', { sym: hoisted.sym }, ' = '] },
        { k: 'region', id: region },
        { k: 'text', parts: ['\n'] },
      ],
      declares: [hoisted.sym],
      effectful: false,
      anchor: { k: 'before-unit', unit: 2 },
      home: 'auto',
      by: 'hmr',
    })
    // (the env module's place holds the split's lazy wrapper instead)
    ctx.rewrites.claim({
      region,
      owner,
      placeholder: [{ k: 'text', parts: [{ sym: hoisted.sym }] }],
      scope: { except: ['env'] },
      by: 'hmr',
    })
    // the router planner's split part claims nothing new: it re-roots the placeholder's symbol in the chunk
    const chunk = ctx.declareOutput({
      kind: 'split',
      key: 'component',
      derived: { kind: 'split', value: 'component' },
    })
    const split = ctx.names.alloc('TsrSplitComponent')
    const exporter = ctx.rewrites.addGenerated({
      body: [
        {
          k: 'text',
          parts: [
            'const ',
            { sym: split.sym },
            ' = ',
            { sym: hoisted.sym },
            '\nexport { ',
            { sym: split.sym },
            ' as component }\n',
          ],
        },
      ],
      declares: [split.sym],
      effectful: false,
      anchor: { k: 'end' },
      home: chunk,
      by: 'split',
    })
    void exporter
    // the env's option value becomes a lazy wrapper
    ctx.rewrites.placeholder({
      range: value,
      body: [{ k: 'text', parts: ['tsrLazy()'] }],
      scope: ['env'],
      by: 'split',
    })
    const env = e.render('env').code
    const chunkCode = e.render(chunk).code
    expect(env).toBe(
      dedent(`
      import { createFileRoute } from 'toy-router'
      export const Route = createFileRoute('/')({
        component: tsrLazy(),
      })
    `),
    )
    expect(chunkCode).toBe(
      dedent(`
      import { useThing } from './thing'
      const TsrComponent = () => { useThing(); return <p>hi</p> }
      const TsrSplitComponent = TsrComponent
      export { TsrSplitComponent as component }
    `),
    )
  })

  it("renders a claimed region's text, an edit's, in its owner and the placeholder at its place", () => {
    // an environment rewrite of exactly the hoisted value (the value is
    // itself an env-only call) is the value's text: it renders where the
    // value does, in the chunk; the env output keeps the placeholder
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { serverOnly } from 'toy-start'
      export const Route = createFileRoute('/')({
        component: serverOnly(() => <p>hi</p>),
      })
    `)
    const e = engine(code)
    const { ctx } = e
    ctx.setRouteModule()
    const value = rangeOf(code, 'serverOnly(() => <p>hi</p>)')
    const impl = rangeOf(code, '() => <p>hi</p>')
    const region = ctx.region(value, 'option-value')
    const chunk = ctx.declareOutput({
      kind: 'split',
      key: 'component',
      derived: { kind: 'split', value: 'component' },
    })
    const hoisted = ctx.names.alloc('TsrComponent')
    const owner = ctx.rewrites.addGenerated({
      body: [
        { k: 'text', parts: ['const ', { sym: hoisted.sym }, ' = '] },
        { k: 'region', id: region },
        { k: 'text', parts: ['\nexport { ', { sym: hoisted.sym }, ' }\n'] },
      ],
      declares: [hoisted.sym],
      effectful: false,
      anchor: { k: 'end' },
      home: chunk,
      by: 'split',
    })
    ctx.rewrites.claim({
      region,
      owner,
      placeholder: [{ k: 'text', parts: ['tsrLazy()'] }],
      by: 'split',
    })
    ctx.rewrites.edit({
      range: value,
      body: [{ k: 'slice', range: impl }],
      by: 'env',
    })
    expect(e.render('env').code).toBe(
      dedent(`
      import { createFileRoute } from 'toy-router'
      export const Route = createFileRoute('/')({
        component: tsrLazy(),
      })
    `),
    )
    expect(e.render(chunk).code).toBe(
      dedent(`
      const TsrComponent = () => <p>hi</p>
      export { TsrComponent }
    `),
    )
  })

  it('kills a claim whose ancestor is erased (ancestor erasure)', () => {
    const code = dedent(`
      import { wrapServer } from 'toy-start'
      import { Hydrate } from 'toy-start'
      import { Heavy } from './heavy'
      export const fn = wrapServer(() => <Hydrate><Heavy/></Hydrate>)
    `)
    const e = engine(code, { env: { type: 'client' } })
    const { ctx } = e
    const children = rangeOf(code, '<Heavy/>')
    const region = ctx.region(children, 'hydrate-children')
    const h = ctx.declareOutput({
      kind: 'hydrate',
      key: 'h1',
      derived: { kind: 'hydrate', value: 'h1' },
    })
    const comp = ctx.names.alloc('TsrHydrate0', { jsxTag: true })
    const owner = ctx.rewrites.addGenerated({
      body: [
        {
          k: 'text',
          parts: ['export function ', { sym: comp.sym }, '() { return <>'],
        },
        { k: 'region', id: region },
        { k: 'text', parts: ['</> }\n'] },
      ],
      declares: [comp.sym],
      effectful: false,
      anchor: { k: 'end' },
      home: h,
      by: 'hydrate',
    })
    ctx.rewrites.claim({
      region,
      owner,
      placeholder: [
        { k: 'text', parts: ['<', { sym: comp.sym, ctx: 'jsxTag' }, '/>'] },
      ],
      by: 'hydrate',
    })
    // the client erases the handler
    ctx.rewrites.edit({
      range: rangeOf(code, 'wrapServer(() => <Hydrate><Heavy/></Hydrate>)'),
      body: [{ k: 'text', parts: ['tsrStub()'] }],
      by: 'env',
    })
    const plan = e.freeze()
    expect(e.render(h).code).toBe('export {}\n')
    expect(plan.edges[h]).toEqual([])
    expect(e.render('env').code).toBe(
      dedent(`
      export const fn = tsrStub()
    `),
    )
  })

  // An owner other generated code reads (a provider's hoisted server fn,
  // its RPC wrapper's callee) is a declaration of its own: an erasure of
  // its occurrence (an option a later planner deletes) removes the
  // placeholder there, and the owner still renders with what it reads and
  // the claims inside it. Without that reader it dies with the occurrence.
  it.each([
    { reader: true, outcome: 'keeps' },
    { reader: false, outcome: 'kills' },
  ])(
    '$outcome a claim whose ancestor is erased (owner read elsewhere: $reader)',
    ({ reader }) => {
      const code = dedent(`
        import { make } from './make'
        export const opts = { loader: () => { const fn = make(() => 'hi'); return fn } }
      `)
      const e = engine(code)
      const { ctx } = e
      const handler = rangeOf(code, "() => 'hi'")
      const lazy = ctx.declareOutput({
        kind: 'hydrate',
        key: 'h1',
        derived: { kind: 'hydrate', value: 'h1' },
      })
      const local = ctx.names.alloc('tsrHandler')
      const inner = ctx.rewrites.addGenerated({
        body: [
          { k: 'text', parts: ['export const ', { sym: local.sym }, ' = '] },
          { k: 'region', id: ctx.region(handler, 'custom') },
          { k: 'text', parts: ['\n'] },
        ],
        declares: [local.sym],
        effectful: false,
        anchor: { k: 'end' },
        home: lazy,
        by: 'env',
      })
      ctx.addRoot(lazy, { t: 'gen', id: inner })
      ctx.rewrites.claim({
        region: ctx.region(handler, 'custom'),
        owner: inner,
        placeholder: [{ k: 'text', parts: ['tsrLazy'] }],
        by: 'env',
      })
      const chain = rangeOf(code, "make(() => 'hi')")
      const hoisted = ctx.names.alloc('tsrHoisted')
      const region = ctx.region(chain, 'nested-chain')
      const owner = ctx.rewrites.addGenerated({
        body: [
          { k: 'text', parts: ['const ', { sym: hoisted.sym }, ' = '] },
          { k: 'region', id: region },
          { k: 'text', parts: ['\n'] },
        ],
        declares: [hoisted.sym],
        effectful: false,
        anchor: { k: 'after-unit', unit: 0 },
        home: 'auto',
        by: 'env',
      })
      if (reader) {
        const wrapper = ctx.names.alloc('tsrWrapper')
        const gen = ctx.rewrites.addGenerated({
          body: [
            {
              k: 'text',
              parts: [
                'export const ',
                { sym: wrapper.sym },
                ' = () => ',
                { sym: hoisted.sym },
                '\n',
              ],
            },
          ],
          declares: [wrapper.sym],
          effectful: false,
          anchor: { k: 'end' },
          home: 'auto',
          by: 'env',
        })
        ctx.addRoot('env', { t: 'gen', id: gen })
      }
      ctx.rewrites.claim({
        region,
        owner,
        placeholder: [{ k: 'text', parts: [{ sym: hoisted.sym }] }],
        by: 'env',
      })
      // a later planner deletes the option
      ctx.rewrites.edit({
        range: rangeOf(
          code,
          "loader: () => { const fn = make(() => 'hi'); return fn } ",
        ),
        body: [],
        by: 'router',
      })
      e.freeze()
      expect({ env: e.render('env').code, lazy: e.render(lazy).code }).toEqual(
        reader
          ? {
              env: dedent(`
                import { make } from './make'
                const tsrHoisted = make(tsrLazy)
                export const opts = { }
                export const tsrWrapper = () => tsrHoisted
              `),
              lazy: "export const tsrHandler = () => 'hi'\n",
            }
          : {
              env: 'export const opts = { }\n',
              lazy: 'export {}\n',
            },
      )
    },
  )

  // A claim read elsewhere inside another one: its occurrence renders inside
  // the outer owner, so its placeholder's reads count.
  it('renders the placeholder of a claim read elsewhere inside another such claim', () => {
    const code = dedent(`
      import { make, inner } from './make'
      export const opts = { loader: () => make(() => inner(1)) }
    `)
    const e = engine(code)
    const { ctx } = e
    const claimRead = (range: { start: number; end: number }, name: string) => {
      const hoisted = ctx.names.alloc(name)
      const region = ctx.region(range, 'nested-chain')
      const owner = ctx.rewrites.addGenerated({
        body: [
          { k: 'text', parts: ['const ', { sym: hoisted.sym }, ' = '] },
          { k: 'region', id: region },
          { k: 'text', parts: ['\n'] },
        ],
        declares: [hoisted.sym],
        effectful: false,
        anchor: { k: 'after-unit', unit: 0 },
        home: 'auto',
        by: 'env',
      })
      const wrapper = ctx.names.alloc(`${name}Wrapper`)
      const gen = ctx.rewrites.addGenerated({
        body: [
          {
            k: 'text',
            parts: [
              'export const ',
              { sym: wrapper.sym },
              ' = () => ',
              { sym: hoisted.sym },
              '\n',
            ],
          },
        ],
        declares: [wrapper.sym],
        effectful: false,
        anchor: { k: 'end' },
        home: 'auto',
        by: 'env',
      })
      ctx.addRoot('env', { t: 'gen', id: gen })
      ctx.rewrites.claim({
        region,
        owner,
        placeholder: [{ k: 'text', parts: [{ sym: hoisted.sym }] }],
        by: 'env',
      })
      return { hoisted, region }
    }
    claimRead(rangeOf(code, 'inner(1)'), 'tsrInner')
    claimRead(rangeOf(code, 'make(() => inner(1))'), 'tsrOuter')
    ctx.rewrites.edit({
      range: rangeOf(code, 'loader: () => make(() => inner(1)) '),
      body: [],
      by: 'router',
    })
    expect(e.render('env').code).toContain(
      'const tsrOuter = make(() => tsrInner)',
    )
  })

  // The env module of a separate provider: its own edit on exactly the region
  // replaces the placeholder, and the owner lives in the provider. Under an
  // erasure nothing of the region renders in the env module, so what only it
  // reads leaves, and the provider keeps both.
  it('erases a claim read elsewhere in an output whose own edit replaces it', () => {
    const code = dedent(`
      import { make } from './make'
      export const opts = { loader: () => make(1) }
    `)
    const e = engine(code)
    const { ctx } = e
    const chain = rangeOf(code, 'make(1)')
    const provider = ctx.declareOutput({
      kind: 'hydrate',
      key: 'p1',
      derived: { kind: 'hydrate', value: 'p1' },
    })
    const hoisted = ctx.names.alloc('tsrHoisted')
    const region = ctx.region(chain, 'nested-chain')
    const owner = ctx.rewrites.addGenerated({
      body: [
        { k: 'text', parts: ['const ', { sym: hoisted.sym }, ' = '] },
        { k: 'region', id: region },
        { k: 'text', parts: ['\n'] },
      ],
      declares: [hoisted.sym],
      effectful: false,
      anchor: { k: 'end' },
      home: provider,
      by: 'env',
    })
    const wrapper = ctx.names.alloc('tsrWrapper')
    const gen = ctx.rewrites.addGenerated({
      body: [
        {
          k: 'text',
          parts: [
            'export const ',
            { sym: wrapper.sym },
            ' = () => ',
            { sym: hoisted.sym },
            '\n',
          ],
        },
      ],
      declares: [wrapper.sym],
      effectful: false,
      anchor: { k: 'end' },
      home: provider,
      by: 'env',
    })
    ctx.addRoot(provider, { t: 'gen', id: gen })
    ctx.rewrites.claim({
      region,
      owner,
      placeholder: [{ k: 'text', parts: [{ sym: hoisted.sym }] }],
      scope: { except: ['env'] },
      by: 'env',
    })
    ctx.rewrites.edit({
      range: rangeOf(code, 'loader: () => make(1) '),
      body: [],
      by: 'router',
    })
    e.freeze()
    expect(e.render('env').code).not.toContain('make')
    expect(e.render(provider).code).toContain('const tsrHoisted = make(1)')
  })

  it('moves an import only generated text reads out of a non-route env module', () => {
    // a Solid `use:tip` directive is no reference in the semantic model: the planner's edit reads `tip`
    const code = dedent(`
      import { tip } from './tip'
      export function Comp() {
        return <div><p use:tip={1}>x</p></div>
      }
    `)
    const e = engine(code, { id: '/app/mod.tsx' })
    const { ctx } = e
    const tipSym = ctx.analysis.imports[0]!.specifiers[0]!.local
    const children = rangeOf(code, '<p use:tip={1}>x</p>')
    const region = ctx.region(children, 'hydrate-children')
    const out = ctx.declareOutput({
      kind: 'hydrate',
      key: 'h0',
      derived: { kind: 'hydrate', value: 'h0' },
    })
    const comp = ctx.names.alloc('TsrHydrate0', { jsxTag: true })
    const owner = ctx.rewrites.addGenerated({
      body: [
        {
          k: 'text',
          parts: ['export function ', { sym: comp.sym }, '() { return ('],
        },
        { k: 'region', id: region },
        { k: 'text', parts: [') }\n'] },
      ],
      declares: [comp.sym],
      effectful: false,
      anchor: { k: 'end' },
      home: out,
      by: 'hydrate',
    })
    ctx.rewrites.claim({
      region,
      owner,
      placeholder: [{ k: 'text', parts: ['{null}'] }],
      by: 'hydrate',
    })
    const name = rangeOf(code, 'tip={1}')
    ctx.rewrites.edit({
      range: { start: name.start, end: name.start + 3 },
      body: [{ k: 'text', parts: [{ sym: tipSym }] }],
      by: 'hydrate',
    })
    expect(e.render().code).toBe(
      dedent(`
      export function Comp() {
        return <div>{null}</div>
      }
    `),
    )
    expect(e.render(out).code).toBe(
      dedent(`
      import { tip } from './tip'
      export function TsrHydrate0() { return (<p use:tip={1}>x</p>) }
    `),
    )
  })

  it('separates a statement whose callee a substitution environment rewrites from the previous one', () => {
    const code = dedent(`
      export function Comp() {
        const set = (n) => n
        const open = () => 1
        return <button onClick={() => {
          set(1)
          open()
        }}/>
      }
    `)
    const e = engine(code)
    const { ctx } = e
    const children = {
      start: code.indexOf('<button'),
      end: code.indexOf('}}/>') + '}}/>'.length,
    }
    const symOf = (name: string) =>
      ctx.t1.symbols.binding(
        ctx.t1.refs.all.find((r) => ctx.t1.symbols.name(r.sym) === name)!.sym,
      )!.id as never
    const props = ctx.names.alloc('props')
    const out = ctx.declareOutput({
      kind: 'hydrate',
      key: 'h0',
      derived: { kind: 'hydrate', value: 'h0' },
    })
    const comp = ctx.names.alloc('TsrHydrate0', { jsxTag: true })
    const owner = ctx.rewrites.addGenerated({
      body: [
        {
          k: 'text',
          parts: [
            'export function ',
            { sym: comp.sym },
            '(',
            { sym: props.sym },
            ') { return (',
          ],
        },
        { k: 'region', id: ctx.region(children, 'hydrate-children') },
        { k: 'text', parts: [') }\n'] },
      ],
      declares: [comp.sym],
      effectful: false,
      anchor: { k: 'end' },
      home: out,
      env: new Map(
        ['set', 'open'].map(
          (c) => [symOf(c), { member: [props.sym, c] }] as const,
        ),
      ) as never,
      by: 'hydrate',
    })
    ctx.rewrites.claim({
      region: ctx.region(children, 'hydrate-children'),
      owner,
      placeholder: [{ k: 'text', parts: ['null'] }],
      by: 'hydrate',
    })
    expect(e.render(out).code).toBe(
      dedent(`
      export function TsrHydrate0(props) { return (<button onClick={() => {
          (0, props.set)(1)
          ;(0, props.open)()
        }}/>) }
    `),
    )
  })

  it('forwards captures through nested placeholders with a substitution environment', () => {
    const code = dedent(`
      import { Hydrate } from 'toy-start'
      export function Comp() {
        const label = 'x'
        const value = 2
        const read = () => value
        return <Hydrate><section>{read()}{ { value }.value }<Hydrate><b>{label}</b></Hydrate></section></Hydrate>
      }
    `)
    const e = engine(code)
    const { ctx } = e
    const innerChildren = rangeOf(code, '<b>{label}</b>')
    const outerChildren = rangeOf(
      code,
      '<section>{read()}{ { value }.value }<Hydrate><b>{label}</b></Hydrate></section>',
    )
    const symOf = (name: string) =>
      ctx.t1.symbols.binding(
        ctx.t1.refs.all.find((r) => ctx.t1.symbols.name(r.sym) === name)!.sym,
      )!.id as never
    const props = ctx.names.alloc('props')
    const mk = (
      n: number,
      children: { start: number; end: number },
      captures: Array<string>,
    ) => {
      const region = ctx.region(children, 'hydrate-children')
      const out = ctx.declareOutput({
        kind: 'hydrate',
        key: `h${n}`,
        derived: { kind: 'hydrate', value: `h${n}` },
      })
      const comp = ctx.names.alloc(`TsrHydrate${n}`, { jsxTag: true })
      const env = new Map(
        captures.map((c) => [symOf(c), { member: [props.sym, c] }] as const),
      )
      const owner = ctx.rewrites.addGenerated({
        body: [
          {
            k: 'text',
            parts: [
              'export function ',
              { sym: comp.sym },
              '(',
              { sym: props.sym },
              ') { return <>',
            ],
          },
          { k: 'region', id: region },
          { k: 'text', parts: ['</> }\n'] },
        ],
        declares: [comp.sym],
        effectful: false,
        anchor: { k: 'end' },
        home: out,
        env: env as never,
        by: 'hydrate',
      })
      // the parent's lazy const has the same name (the same name denotes the same thing) but is its own symbol
      const lazy = ctx.symbols.declare(`TsrHydrate${n}`)
      ctx.rewrites.addGenerated({
        body: [
          {
            k: 'text',
            parts: [
              'const ',
              { sym: lazy },
              ` = tsrLazy(() => import('/app/route.tsx?tss-hydrate=h${n}'), 'TsrHydrate${n}')\n`,
            ],
          },
        ],
        declares: [lazy],
        effectful: false,
        anchor: { k: 'after-header' },
        home: 'auto',
        by: 'hydrate',
      })
      const placeholder: Array<never> = []
      const parts: Array<string | { sym: never }> = [
        '<',
        { sym: lazy as never },
      ]
      for (const c of captures) {
        parts.push(` ${c}={`, { sym: symOf(c) }, '}')
      }
      parts.push('/>')
      ctx.rewrites.claim({
        region,
        owner,
        placeholder: [{ k: 'text', parts } as never, ...placeholder],
        by: 'hydrate',
      })
      return out
    }
    // innermost first (bottom-up): inner captures label; outer captures read, value and (through the inner placeholder) label
    const inner = mk(1, innerChildren, ['label'])
    const outer = mk(0, outerChildren, ['read', 'value', 'label'])
    expect(e.render(outer).code).toBe(
      dedent(`
      import { Hydrate } from 'toy-start'
      const TsrHydrate1 = tsrLazy(() => import('/app/route.tsx?tss-hydrate=h1'), 'TsrHydrate1')
      export function TsrHydrate0(props) { return <><section>{(0, props.read)()}{ { value: props.value }.value }<Hydrate><TsrHydrate1 label={props.label}/></Hydrate></section></> }
    `),
    )
    expect(e.render(inner).code).toBe(
      dedent(`
      export function TsrHydrate1(props) { return <><b>{props.label}</b></> }
    `),
    )
    const env = e.render('env').code
    expect(env).toContain(
      'return <Hydrate><TsrHydrate0 read={read} value={value} label={label}/></Hydrate>',
    )
    expect(env).toContain(
      "const TsrHydrate0 = tsrLazy(() => import('/app/route.tsx?tss-hydrate=h0'), 'TsrHydrate0')",
    )
    expect(env).not.toContain("'/app/route.tsx?tss-hydrate=h1'")
  })
})

describe('statement-level edits (one edit per statement)', () => {
  it('cuts declarators, import specifiers and export lists from the retained set', () => {
    const code = dedent(`
      import d, { a, b as bb } from './x'
      import * as ns from './ns'
      import './side.css'
      const one = a(), two = bb(), three = d()
      export const four = ns.x, five = 5
      export { one, two }
      export { three as t3 }
      export function keep() { return five }
    `)
    const e = engine(code)
    // erase the readers of `a`, `bb` and `one`/`two` so they become orphaned by us
    e.ctx.rewrites.edit({
      range: rangeOf(code, 'export { one, two }\n'),
      body: [],
      by: 'x',
    })
    e.ctx.rewrites.edit({
      range: rangeOf(code, 'a()'),
      body: [{ k: 'text', parts: ['1'] }],
      by: 'x',
    })
    e.ctx.rewrites.edit({
      range: rangeOf(code, 'bb()'),
      body: [{ k: 'text', parts: ['2'] }],
      by: 'x',
    })
    const out = e.render().code
    expect(out).toBe(
      dedent(`
      import d from './x'
      import * as ns from './ns'
      import './side.css'
      const three = d()
      export const four = ns.x, five = 5
      export { three as t3 }
      export function keep() { return five }
    `),
    )
  })

  it('moves a pure cluster to its only needer, importing exported clusters from the env module', () => {
    const code = dedent(`
      export const a = 1, b = 2
      export function f() { return b }
      const g = () => f()
    `)
    const e = engine(code)
    const chunk = e.ctx.declareOutput({
      kind: 'split',
      key: 'x',
      derived: { kind: 'split', value: 'x' },
      roots: [{ t: 'unit', id: 3 }],
    })
    expect(e.render(chunk).code).toBe(
      dedent(`
      import { f } from '/app/route.tsx'
      const g = () => f()
    `),
    )
    expect(e.render('env').code).toBe(
      dedent(`
      export const a = 1, b = 2
      export function f() { return b }
    `),
    )
  })

  it('drops the export keyword of a declaration included in a derived output', () => {
    const code = dedent(`
      export const a = 1, b = 2
      const g = () => b
    `)
    const e = engine(code)
    // `b` is exported (env root) and read by the chunk-only `g`: the chunk imports it
    const chunk = e.ctx.declareOutput({
      kind: 'split',
      key: 'x',
      derived: { kind: 'split', value: 'x' },
      roots: [{ t: 'unit', id: 2 }],
    })
    expect(e.render(chunk).code).toBe(
      dedent(`
      import { b } from '/app/route.tsx'
      const g = () => b
    `),
    )
    // a non-exported declaration keeps nothing of `export`; an exported one included in a chunk loses the keyword
    const e2 = engine('export const c = 3\nconst h = () => c\n')
    const chunk2 = e2.ctx.declareOutput({
      kind: 'split',
      key: 'x',
      derived: { kind: 'split', value: 'x' },
      roots: [
        { t: 'unit', id: 0 },
        { t: 'unit', id: 1 },
      ],
    })
    expect(e2.render(chunk2).code).toBe(
      "import { c } from '/app/route.tsx'\nconst h = () => c\n",
    )
  })
})

describe('renaming an annotated declaration', () => {
  const rename = (code: string, name = 'page') => {
    const e = engine(code)
    const sym = e.ctx.t1.units
      .flatMap((u) => u.declares)
      .find((s) => e.ctx.symbols.name(s) === name)!
    e.ctx.renameRefs(sym, { sym: e.ctx.names.alloc('TsrPage').sym }, 'hmr')
    return e.render().code
  }

  it.each<[string, string, string, string?]>([
    [
      'const',
      'const page: FC = () => null\nuse(page)\n',
      'const TsrPage: FC = () => null\nuse(TsrPage)\n',
    ],
    [
      'let',
      'let page: FC = () => null\nuse(page)\n',
      'let TsrPage: FC = () => null\nuse(TsrPage)\n',
    ],
    [
      'var',
      'var page: FC = () => null\nuse(page)\n',
      'var TsrPage: FC = () => null\nuse(TsrPage)\n',
    ],
    [
      'definite',
      'let page!: FC\nuse(page)\n',
      'let TsrPage!: FC\nuse(TsrPage)\n',
    ],
    [
      'a comment before the annotation',
      'const page /* c */ : FC = () => null\nuse(page)\n',
      'const TsrPage /* c */ : FC = () => null\nuse(TsrPage)\n',
    ],
    [
      'an annotation that names the binding (types are erased)',
      'const page: Wrap<typeof page> = w()\nuse(page)\n',
      'const TsrPage: Wrap<typeof page> = w()\nuse(TsrPage)\n',
    ],
    [
      'a non-ASCII name',
      'const pagé: FC = () => null\nuse(pagé)\n',
      'const TsrPage: FC = () => null\nuse(TsrPage)\n',
      'pagé',
    ],
    [
      'an escaped name',
      'const p\\u0061ge = () => null\nuse(page)\n',
      'const TsrPage = () => null\nuse(TsrPage)\n',
    ],
    [
      'an escaped annotated name',
      'const p\\u{61}ge: FC = () => null\nuse(page)\n',
      'const TsrPage: FC = () => null\nuse(TsrPage)\n',
    ],
    [
      'a `var` hoisted out of a block',
      'if (a) { var page: FC = () => null }\nuse(page)\n',
      'if (a) { var TsrPage: FC = () => null }\nuse(TsrPage)\n',
    ],
    [
      'a `var` declared again',
      'var page: FC = a\nvar page: FC = b\nuse(page)\n',
      'var TsrPage: FC = a\nvar TsrPage: FC = b\nuse(TsrPage)\n',
    ],
    [
      'an exported declaration',
      'export const page: FC = () => null\n',
      'const TsrPage: FC = () => null\nexport { TsrPage as page }\n',
    ],
  ])('keeps the annotation of %s', (_, code, renamed, name) => {
    expect(rename(code, name)).toBe(renamed)
  })

  it("renames one binding of a destructuring, not its siblings or the pattern's annotation", () => {
    expect(
      rename(
        'const { page, other = 1, r: [third] }: Shape = o\nuse(page, other, third)\n',
      ),
    ).toBe(
      'const { page: TsrPage, other = 1, r: [third] }: Shape = o\nuse(TsrPage, other, third)\n',
    )
    expect(rename('const [other, page]: Pair = o\nuse(page, other)\n')).toBe(
      'const [other, TsrPage]: Pair = o\nuse(TsrPage, other)\n',
    )
  })

  it('leaves an annotated declaration it does not rename as written', () => {
    expect(
      rename('const page = () => null\nconst Page: FC = page\nuse(Page)\n'),
    ).toBe('const TsrPage = () => null\nconst Page: FC = TsrPage\nuse(Page)\n')
  })
})

describe('renaming a `var` declared again', () => {
  it('renames every declaration once', () => {
    const code = `var a = 1\nvar a = 2\n{\n  var { a } = o\n}\nfor (var a of o) {}\nf(a)\n`
    const e = engine(code)
    const to = e.ctx.names.alloc('b')
    const sym = e.ctx.t1.declaringUnits.keys().next().value!
    e.ctx.renameRefs(sym, { sym: to.sym }, 'hmr')
    expect(e.render().code).toBe(
      `var b = 1\nvar b = 2\n{\n  var { a: b } = o\n}\nfor (var b of o) {}\nf(b)\n`,
    )
  })
})

describe('generated units next to what the source wrote', () => {
  const unit = (e: ReturnType<typeof engine>, anchor: Anchor) =>
    e.ctx.rewrites.addGenerated({
      body: [{ k: 'text', parts: ['const gen = 1\n'] }],
      declares: [e.ctx.names.alloc('gen').sym],
      effectful: true,
      anchor,
      home: 'auto',
      by: 'toy',
    })

  it('starts on its own line after a statement a license comment ends', () => {
    const e = engine(`const a = 1 /*! a\nb */ const b = 2\n`)
    e.ctx.addRoot('env', {
      t: 'gen',
      id: unit(e, { k: 'after-unit', unit: 0 }),
    })
    expect(e.render().code).toBe(
      `const a = 1 \nconst gen = 1\n/*! a\nb */ const b = 2\n`,
    )
  })

  it('gives a statement starting with a parenthesis its `;` past a license comment after the unit', () => {
    const e = engine(`const a = 1;\n/*! l */\n(a).b = 1\n`)
    e.ctx.addRoot('env', {
      t: 'gen',
      id: unit(e, { k: 'after-unit', unit: 0 }),
    })
    expect(e.render().code).toContain(`const gen = 1\n/*! l */\n;(a).b = 1`)
  })

  it('renders before the next statement in a derived output, as in the env module', () => {
    const e = engine(`const a = 1\nconst b = 2\n`)
    const out = e.ctx.declareOutput({
      kind: 'hydrate',
      key: 'h1',
      derived: { kind: 'hydrate', value: 'h1' },
    })
    const gen = e.ctx.rewrites.addGenerated({
      body: [{ k: 'text', parts: ['const gen = 1\n'] }],
      declares: [e.ctx.names.alloc('gen').sym],
      effectful: true,
      anchor: { k: 'after-unit', unit: 0 },
      home: out,
      by: 'toy',
    })
    for (const output of ['env' as const, out]) {
      e.ctx.addRoot(output, { t: 'gen', id: gen })
      e.ctx.addRoot(output, { t: 'unit', id: 0 })
      e.ctx.addRoot(output, { t: 'unit', id: 1 })
    }
    expect(e.render(out).code).toMatch(
      /const a = 1\nconst gen = 1\nconst b = 2/,
    )
  })

  it('gives a statement starting with a parenthesis its `;`, after the unit', () => {
    const e = engine(`(a).b = 1\n`)
    e.ctx.addRoot('env', { t: 'gen', id: unit(e, { k: 'after-header' }) })
    expect(e.render().code).toBe(`const gen = 1\n;(a).b = 1\n`)
  })
})

describe('replacements at a statement start', () => {
  // `const x = foo\n(() => 1)()` parses as a call of `foo`: a replacement
  // whose first token could continue the previous statement is guarded with
  // a `;` when it starts a statement of a list whose previous statement has
  // no `;`, and only there (an `if` body is no list).
  it('guards a replacement that could continue the previous statement', () => {
    const code = dedent(`
      import { wrap } from 'toy-start'
      const x = foo
      wrap(() => 1)()
      export function f() {
        const y = bar
        wrap(() => 2)()
        if (y)
          wrap(() => 3)()
        baz;
        wrap(() => 4)()
        wrap(() => 5)()
      }
      {
        wrap(() => 6)()
      }
    `)
    const e = engine(code)
    for (let n = 1; n <= 6; n++) {
      const call = `wrap(() => ${n})`
      const start = code.indexOf(call)
      const arg = {
        start: start + 'wrap('.length,
        end: start + call.length - 1,
      }
      e.ctx.rewrites.edit({
        range: { start, end: start + call.length },
        body: [
          { k: 'text', parts: ['('] },
          { k: 'slice', range: arg },
          { k: 'text', parts: [')'] },
        ],
        by: 'toy',
      })
    }
    const out = e.render().code
    expect(out).toContain('const x = foo\n;(() => 1)()\n')
    expect(out).toContain('const y = bar\n  ;(() => 2)()\n')
    expect(out).toContain('if (y)\n    (() => 3)()\n')
    expect(out).toContain('baz;\n  (() => 4)()\n  ;(() => 5)()\n')
    expect(out).toContain('{\n  (() => 6)()\n}')
  })

  it('reads the first token past a leading comment', () => {
    const code = dedent(`
      const x = foo
      wrap(1)
      const y = bar
      wrap(2)
    `)
    const e = engine(code)
    const replace = (call: string, replacement: string) => {
      const start = code.indexOf(call)
      e.ctx.rewrites.edit({
        range: { start, end: start + call.length },
        body: [{ k: 'text', parts: [replacement] }],
        by: 'toy',
      })
    }
    replace('wrap(1)', '/* @__PURE__ */ lazy(1)')
    replace('wrap(2)', '/* @__PURE__ */ (0, lazy)(2)')
    const out = e.render().code
    expect(out).toContain('const x = foo\n/* @__PURE__ */ lazy(1)\n')
    expect(out).toContain('const y = bar\n;/* @__PURE__ */ (0, lazy)(2)\n')
  })

  // a removal leaves the statement after it next to the one before it: the
  // statement the source wrote after it is guarded the same way, whatever
  // its first token (`(`, `[`, a template, a sign, a regular expression), past
  // a comment (the `;` before it), and only in a list
  it('guards the statement after a removal', () => {
    const next = ['(mk)()', '[1].map(f)', '`t`', '+n', '-n', '/x/.test(s)']
    const code = [
      'export function f() {',
      '  let y = foo',
      ...next.flatMap((n) => ['  const gone = 1;', `  ${n}`]),
      '  const z = 1;',
      '  /* c */ (mk)()',
      '  const w = 2;',
      '  g()',
      '  if (y) { const v = 3; }',
      '  (mk)()',
      '  switch (y) {',
      '    case 1:',
      '      let u = foo',
      '      const t = 4;',
      '      (mk)()',
      '  }',
      '}',
      '',
    ].join('\n')
    const e = engine(code)
    const remove = (from: number, text: string) => {
      const start = code.indexOf(text, from)
      e.ctx.rewrites.edit({
        range: { start, end: start + text.length },
        body: [],
        by: 'toy',
      })
      return start + text.length
    }
    let at = 0
    for (let i = 0; i < next.length; i++) {
      at = remove(at, 'const gone = 1;')
    }
    for (const text of [
      'const z = 1;',
      'const w = 2;',
      'const v = 3;',
      'const t = 4;',
    ]) {
      remove(0, text)
    }
    const out = e.render().code
    expect(out).toContain(`let y = foo\n  \n  ;(mk)()\n`)
    for (const n of next.slice(1)) {
      expect(out).toContain(`\n  \n  ;${n}\n`)
    }
    expect(out).toContain('\n  ;/* c */ (mk)()\n')
    // an identifier continues nothing; a block ends a statement
    expect(out).toContain('\n  \n  g()\n')
    expect(out).toContain('if (y) {  }\n  (mk)()\n')
    expect(out).toContain('let u = foo\n      \n      ;(mk)()\n')
  })

  // the list is found through every node holding the replacement: an
  // arrow's body in a call's argument in JSX, a class's static block, a case
  it('finds the statement list deep in the statement', () => {
    const code = dedent(`
      export const C = () => (
        <div onClick={[() => {
          const a = foo
          wrap(1)
        }]}>{list.map((x) => { let b = x
          wrap(2) })}</div>
      )
      class K {
        static {
          const c = foo
          wrap(3)
        }
        m() { switch (1) { case 1: { let d = 1 } let e = foo
          wrap(4) } }
      }
    `)
    const e = engine(code)
    for (let n = 1; n <= 4; n++) {
      e.ctx.rewrites.edit({
        range: rangeOf(code, `wrap(${n})`),
        body: [{ k: 'text', parts: [`(${n})`] }],
        by: 'toy',
      })
    }
    const out = e.render().code
    expect(out).toContain('const a = foo\n    ;(1)\n')
    expect(out).toContain('let b = x\n    ;(2) }')
    expect(out).toContain('const c = foo\n    ;(3)\n')
    expect(out).toContain('let e = foo\n    ;(4) }')
  })

  // a text that is only a comment has no first token: it continues nothing,
  // and what renders after it is guarded after it (design 1 step 4's notes:
  // it read as starting with `/`)
  it('reads no first token in a text that is only a comment', () => {
    const code = dedent(`
      export function f() {
        let y = foo
        const gone = 1;
        /* c */
        wrap(1)
        let z = bar
        g()
      }
    `)
    const e = engine(code)
    const gone = rangeOf(code, 'const gone = 1;')
    e.ctx.rewrites.edit({ range: gone, body: [], by: 'toy' })
    e.ctx.rewrites.edit({
      range: rangeOf(code, 'wrap(1)'),
      body: [{ k: 'text', parts: ['(1)'] }],
      by: 'toy',
    })
    e.ctx.rewrites.insert({
      at: rangeOf(code, 'g()').start,
      body: [{ k: 'text', parts: ['/*i*/'] }],
      by: 'toy',
    })
    const out = e.render().code
    expect(out).toContain('let y = foo\n  \n  /* c */\n  ;(1)\n')
    expect(out).toContain('let z = bar\n  /*i*/g()\n')
  })
})

// R127 (Fable review of the cast-split class, 2026-11-10): an owner renders
// its claimed region whole (`{ k: 'region' }`), with every edit of the output
// inside it.
describe('a claim its owner renders', () => {
  const code = dedent(`
    import { make } from './make'
    export const opts = { loader: make(() => 'secret') as any }
  `)
  it('renders the edits inside the claimed text', () => {
    const e = engine(code)
    const { ctx } = e
    const local = ctx.names.alloc('tsrValue')
    const claimed = rangeOf(code, "make(() => 'secret') as any")
    const region = ctx.region(claimed, 'option-value')
    const owner = ctx.rewrites.addGenerated({
      body: [
        { k: 'text', parts: ['export const ', { sym: local.sym }, ' = '] },
        { k: 'region', id: region },
        { k: 'text', parts: ['\n'] },
      ],
      declares: [local.sym],
      effectful: false,
      anchor: { k: 'end' },
      home: 'env',
      by: 'toy-hoist',
    })
    ctx.rewrites.claim({
      region,
      owner,
      placeholder: [{ k: 'text', parts: [{ sym: local.sym }] }],
      by: 'toy-hoist',
    })
    ctx.rewrites.edit({
      range: rangeOf(code, "make(() => 'secret')"),
      body: [{ k: 'text', parts: ['stub()'] }],
      by: 'toy-env',
    })
    expect(e.render().code).toBe(
      dedent(`
      export const opts = { loader: tsrValue }
      export const tsrValue = stub() as any
    `),
    )
  })
})

// Source: design note 1 (rewrite tree), invariant I3 and F2-1 of the Fable
// review: an edit's body names source text as a slice of the region it
// edits, and a slice that cuts a region another edit rewrites would copy the
// text that edit replaces. Such a body fails the compile, in every mode.
describe('a kept slice cuts no edited region', () => {
  const lastRangeOf = (code: string, text: string) => {
    const start = code.lastIndexOf(text)
    return { start, end: start + text.length }
  }
  /** `outer` rewrites `outerText` keeping `kept`; `inner` rewrites `innerText`. */
  const cutting = (
    code: string,
    outerText: string,
    kept: string,
    innerText: string,
  ): Planner => ({
    name: 'toy-keep',
    tier: 1,
    gate: () => true,
    plan(ctx) {
      ctx.rewrites.edit({
        range: lastRangeOf(code, outerText),
        body: [
          { k: 'text', parts: ['keep('] },
          { k: 'slice', range: lastRangeOf(code, kept) },
          { k: 'text', parts: [')'] },
        ],
        by: 'toy-outer',
      })
      ctx.rewrites.edit({
        range: lastRangeOf(code, innerText),
        body: [{ k: 'text', parts: ['stub()'] }],
        by: 'toy-inner',
      })
    },
  })
  const between = {
    code: dedent(`
      import { outer, inner, secret } from './lib'
      outer(inner(secret))
    `),
    outer: 'outer(inner(secret))',
    kept: 'secret',
    inner: 'inner(secret)',
  }
  const straddling = {
    code: dedent(`
      import { outer, secret, other } from './lib'
      outer(secret + 1, other)
    `),
    outer: 'outer(secret + 1, other)',
    kept: '1, other',
    inner: 'secret + 1',
  }
  const compileIn = async (
    host: typeof MemoryHost,
    c: typeof between,
  ): Promise<unknown> =>
    new host({ files: { '/app/mod.ts': c.code } }).compile('/app/mod.ts', [
      cutting(c.code, c.outer, c.kept, c.inner),
    ])

  it('fails the compile when an edit lies between an edit and the slice it keeps', async () => {
    await expect(compileIn(MemoryHost, between)).rejects.toThrow(
      /conflict: .* cuts /,
    )
  })

  it('fails the compile when an edit straddles the start of a kept slice', async () => {
    await expect(compileIn(MemoryHost, straddling)).rejects.toThrow(
      /conflict: .* cuts /,
    )
  })

  it("fails the compile on both in users' runs", async () => {
    vi.stubEnv('TSR_COMPILER_VERIFY', undefined)
    vi.resetModules()
    try {
      const { MemoryHost: Host } = await import('./helpers')
      await expect(compileIn(Host, between)).rejects.toThrow(
        /conflict: .* cuts /,
      )
      await expect(compileIn(Host, straddling)).rejects.toThrow(
        /conflict: .* cuts /,
      )
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })
})

// Source: design note 1, invariant I5 and F2-3 of the Fable review: an
// insert belongs to the innermost region strictly containing its position,
// so one at the edge of a claimed region renders once, at the place, and the
// member around the place reads what it names.
describe('an insert at the edge of a claimed region', () => {
  it('renders once, beside the placeholder, and its reads stay with the place', () => {
    const code = dedent(`
      import { value } from './lib'
      export const a = { x: value() }
    `)
    const e = engine(code)
    const { ctx } = e
    const range = rangeOf(code, 'value()')
    const tag = ctx.names.alloc('tsrTag')
    ctx.rewrites.addGenerated({
      body: [{ k: 'text', parts: ['const ', { sym: tag.sym }, ' = 1\n'] }],
      declares: [tag.sym],
      effectful: false,
      anchor: { k: 'after-header' },
      home: 'auto',
      by: 'toy',
    })
    const hoisted = ctx.names.alloc('tsrHoisted')
    const owner = ctx.rewrites.addGenerated({
      body: [
        { k: 'text', parts: ['const ', { sym: hoisted.sym }, ' = '] },
        { k: 'region', id: ctx.region(range, 'custom') },
        { k: 'text', parts: ['\n'] },
      ],
      declares: [hoisted.sym],
      effectful: false,
      anchor: { k: 'end' },
      home: 'auto',
      by: 'toy',
    })
    ctx.rewrites.claim({
      region: ctx.region(range, 'custom'),
      owner,
      placeholder: [{ k: 'text', parts: [{ sym: hoisted.sym }] }],
      by: 'toy',
    })
    for (const at of [range.start, range.end]) {
      ctx.rewrites.edit({
        range: { start: at, end: at },
        body: [
          {
            k: 'text',
            parts:
              at === range.start
                ? [{ sym: tag.sym }, ' + ']
                : [' + ', { sym: tag.sym }],
          },
        ],
        by: 'toy',
      })
    }
    expect(e.render().code).toBe(
      dedent(`
      const tsrTag = 1
      import { value } from './lib'
      export const a = { x: tsrTag + tsrHoisted + tsrTag }
      const tsrHoisted = value()
    `),
    )
  })
})

// Source: the Fable review of design 1 step 1 (findings 1 and 2), invariants
// I1 and I4: a claim is a node of the one tree, whatever region it claims, so
// what renders does not depend on the order of the calls, and a second claim
// on one range is a conflict.
describe('claims on the tree', () => {
  const code = `import { c0_, a1_ } from 'toy-names'\nc0_(a1_)\n`
  /** Claims the unit `c0_(a1_)` (with its line end) and rewrites it for every output, in either order. */
  const claimingUnit = (claimFirst: boolean): Planner => ({
    name: 'toy-unit',
    tier: 1,
    gate: () => true,
    plan(ctx) {
      const u = ctx.t1.units.find((x) =>
        code.slice(x.range.start, x.range.end).startsWith('c0_('),
      )!
      const hoisted = ctx.names.alloc('g')
      const owner = ctx.rewrites.addGenerated({
        body: [
          { k: 'text', parts: ['const ', { sym: hoisted.sym }, ' = '] },
          { k: 'region', id: u.region },
        ],
        declares: [hoisted.sym],
        effectful: false,
        anchor: { k: 'end' },
        home: 'auto',
        by: 'toy-unit',
      })
      const claim = () =>
        ctx.rewrites.claim({
          region: u.region,
          owner,
          placeholder: [
            { k: 'text', parts: ['void ', { sym: hoisted.sym }, '\n'] },
          ],
          by: 'toy-unit',
        })
      const edit = () =>
        ctx.rewrites.edit({
          range: u.range,
          body: [
            { k: 'text', parts: ['k('] },
            { k: 'slice', range: rangeOf(code, 'a1_', 1) },
            { k: 'text', parts: [')\n'] },
          ],
          by: 'toy-unit',
        })
      if (claimFirst) {
        claim()
        edit()
      } else {
        edit()
        claim()
      }
    },
  })

  it('renders a claim on a unit region the same, claimed before or after an edit of its range', async () => {
    const outputs: Array<string> = []
    for (const claimFirst of [true, false]) {
      const host = new MemoryHost({ files: { '/app/mod.ts': code } })
      outputs.push(
        (await host.compile('/app/mod.ts', [claimingUnit(claimFirst)]))!.code,
      )
    }
    // the edit is the region's text: it travels with it into the owner
    expect(outputs).toEqual([
      "import { a1_ } from 'toy-names'\nvoid g\nconst g = k(a1_)\n",
      "import { a1_ } from 'toy-names'\nvoid g\nconst g = k(a1_)\n",
    ])
  })

  it('rejects a second region on one range, of another kind', () => {
    const e = engine(`export const a = { x: value() }\n`)
    const { ctx } = e
    const range = rangeOf(e.code, 'value()')
    const claimAs = (kind: 'custom' | 'nested-chain', name: string) => {
      const region = ctx.region(range, kind)
      const hoisted = ctx.names.alloc(name)
      const owner = ctx.rewrites.addGenerated({
        body: [
          { k: 'text', parts: ['const ', { sym: hoisted.sym }, ' = '] },
          { k: 'region', id: region },
          { k: 'text', parts: ['\n'] },
        ],
        declares: [hoisted.sym],
        effectful: false,
        anchor: { k: 'end' },
        home: 'auto',
        by: name,
      })
      ctx.rewrites.claim({
        region,
        owner,
        placeholder: [{ k: 'text', parts: [{ sym: hoisted.sym }] }],
        by: name,
      })
    }
    claimAs('custom', 'first')
    expect(() => claimAs('nested-chain', 'second')).toThrow(
      /conflict: a nested-chain region \[\d+, \d+\) is the custom region there/,
    )
  })
})

// Source: design note 1 (rewrite tree), invariant I1: every range a planner
// addresses is a region of one tree shared by every output, so two edits
// that cut each other conflict whichever outputs they are scoped to.
describe('one region tree for every output', () => {
  const code = dedent(`
    import { createFileRoute } from 'toy-router'
    export const Route = createFileRoute('/')({ component: () => 1 + 2 + 3 })
  `)
  /** Edits `1 + 2` in the env module and `2 + 3` in a chunk only. */
  const cutting: Planner = {
    name: 'toy-cut',
    tier: 1,
    gate: () => true,
    plan(ctx) {
      const chunk = ctx.declareOutput({
        kind: 'split',
        key: 'component',
        derived: { kind: 'split', value: 'component' },
        roots: [{ t: 'unit', id: ctx.t1.units.length - 1 }],
      })
      ctx.rewrites.placeholder({
        range: rangeOf(code, '1 + 2'),
        body: [{ k: 'text', parts: ['3'] }],
        scope: ['env'],
        by: 'toy-cut',
      })
      ctx.rewrites.placeholder({
        range: rangeOf(code, '2 + 3'),
        body: [{ k: 'text', parts: ['5'] }],
        scope: [chunk],
        by: 'toy-cut',
      })
    },
  }

  it('fails the compile on a partial overlap of edits scoped to different outputs', async () => {
    const host = new MemoryHost({ files: { '/app/route.tsx': code } })
    await expect(host.compile('/app/route.tsx', [cutting])).rejects.toThrow(
      /partially overlaps/,
    )
  })

  it("fails the compile on it in users' runs", async () => {
    vi.stubEnv('TSR_COMPILER_VERIFY', undefined)
    vi.resetModules()
    try {
      const { MemoryHost: Host } = await import('./helpers')
      const host = new Host({ files: { '/app/route.tsx': code } })
      await expect(host.compile('/app/route.tsx', [cutting])).rejects.toThrow(
        /partially overlaps/,
      )
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })
})

// Source: the review of design 1, step 1 (finding 3, item 6): text stands at
// a claimed region's place in one output only, and claims are read
// elsewhere around and inside it. B, C and D are claimed (B and C read by
// other generated code, D not), an erasure encloses B, and the env module
// replaces C's placeholder with other text. C's text renders in C's owner,
// so D, inside it, is kept and renders there; whichever claim is
// registered first.
describe('a claimed region whose place holds other text in one output', () => {
  const code = dedent(`
    import { b, c, d } from './m'
    export const opts = { loader: () => b(c(d(1))) }
  `)
  const compile = (outerFirst: boolean) => {
    const e = engine(code)
    const { ctx } = e
    const claim = (
      text: string,
      name: string,
      read: boolean,
      scope?: EditScope,
    ) => {
      const hoisted = ctx.names.alloc(name)
      const region = ctx.region(rangeOf(code, text), 'nested-chain')
      const owner = ctx.rewrites.addGenerated({
        body: [
          { k: 'text', parts: ['const ', { sym: hoisted.sym }, ' = '] },
          { k: 'region', id: region },
          { k: 'text', parts: ['\n'] },
        ],
        declares: [hoisted.sym],
        effectful: false,
        anchor: { k: 'end' },
        home: 'auto',
        by: 'toy-hoist',
      })
      if (read) {
        const reader = ctx.names.alloc(`${name}Reader`)
        const gen = ctx.rewrites.addGenerated({
          body: [
            {
              k: 'text',
              parts: [
                'export const ',
                { sym: reader.sym },
                ' = () => ',
                { sym: hoisted.sym },
                '\n',
              ],
            },
          ],
          declares: [reader.sym],
          effectful: false,
          anchor: { k: 'end' },
          home: 'auto',
          by: 'toy-hoist',
        })
        ctx.addRoot('env', { t: 'gen', id: gen })
      }
      ctx.rewrites.claim({
        region,
        owner,
        placeholder: [{ k: 'text', parts: [{ sym: hoisted.sym }] }],
        ...(scope ? { scope } : {}),
        by: 'toy-hoist',
      })
    }
    const claims: Array<[string, string, boolean, EditScope?]> = [
      ['b(c(d(1)))', 'gB', true],
      ['c(d(1))', 'gC', true, { except: ['env'] }],
      ['d(1)', 'gD', false],
    ]
    for (const args of outerFirst ? claims : [...claims].reverse()) {
      claim(...args)
    }
    // the env module's text at C's place
    ctx.rewrites.placeholder({
      range: rangeOf(code, 'c(d(1))'),
      body: [{ k: 'text', parts: ['0'] }],
      scope: ['env'],
      by: 'toy-env',
    })
    ctx.rewrites.edit({
      range: rangeOf(code, 'loader: () => b(c(d(1))) '),
      body: [],
      by: 'toy-router',
    })
    const d = ctx.t1.refs.all.find(
      (r) =>
        code.slice(r.range.start, r.range.end) === 'd' && r.ctx === 'callee',
    )!
    const live = ctx.liveness('env').live(d)
    return { live, code: e.render('env').code }
  }

  it.each([
    ['outer', true],
    ['inner', false],
  ])(
    'keeps D, rendered in the owner of C, with the %s claim registered first',
    (_order, outerFirst) => {
      const { live, code: out } = compile(outerFirst)
      expect(live).toBe(true)
      expect(out).toContain('const gB = b(0)')
      expect(out).toContain('const gC = c(gD)')
      expect(out).toContain('const gD = d(1)')
    },
  )
})

// Source: the review of design 1, step 2 (finding 2), invariant I5: an
// insert belongs to the innermost region strictly holding its position. At
// a unit's start that is the module, and the unit's member reads it: what
// the insert names stays declared, also when an edit rewrites the unit.
describe('an insert at the start of a unit', () => {
  const code = `import { c0_, a1_ } from 'toy-names'\nconst helper = 1\na1_(helper)\nc0_(1)\n`
  const inserting = (editUnit: boolean): Planner => ({
    name: 'toy-insert',
    tier: 1,
    gate: () => true,
    plan(ctx) {
      const text = (r: { start: number; end: number }) =>
        code.slice(r.start, r.end)
      const unit = ctx.t1.units.find((u) => text(u.range).startsWith('c0_(1'))!
      const helper = ctx.t1.units.find((u) =>
        text(u.range).includes('helper = 1'),
      )!.declares[0]!
      ctx.rewrites.edit({
        range: rangeOf(code, 'helper', 1),
        body: [{ k: 'text', parts: ['0'] }],
        by: 'toy-insert',
      })
      if (editUnit) {
        ctx.rewrites.edit({
          range: unit.range,
          body: [
            { k: 'text', parts: ['void '] },
            {
              k: 'slice',
              range: { start: unit.range.start, end: unit.range.start + 6 },
            },
          ],
          by: 'toy-insert',
        })
      }
      ctx.rewrites.edit({
        range: { start: unit.range.start, end: unit.range.start },
        body: [{ k: 'text', parts: [{ sym: helper }, ';'] }],
        by: 'toy-insert',
      })
    },
  })

  it.each([
    ['as written', false],
    ['rewritten', true],
  ])(
    'keeps what it names declared, with the unit %s',
    async (_name, editUnit) => {
      const host = new MemoryHost({ files: { '/app/mod.ts': code } })
      const out = (await host.compile('/app/mod.ts', [inserting(editUnit)]))!
        .code
      expect(out).toContain('const helper = 1')
      expect(out).toContain(editUnit ? 'helper;void c0_(1)' : 'helper;c0_(1)')
    },
  )
})

describe("the env module's pieces", () => {
  const text = (t: string) => ({ k: 'text' as const, parts: [t] })
  const unit = (e: ReturnType<typeof engine>, anchor: Anchor) =>
    e.ctx.rewrites.addGenerated({
      body: [text('const gen = 1\n')],
      declares: [e.ctx.names.alloc('gen').sym],
      effectful: true,
      anchor,
      home: 'auto',
      by: 'toy',
    })

  it("renders a planner's insert first at a position, then the generated unit and the statement's `;`", () => {
    const code = `const a = 1;\n(a).b = 2\n`
    const e = engine(code)
    e.ctx.rewrites.insert({
      at: rangeOf(code, '(a)').start,
      body: [text('/*i*/')],
      by: 'toy',
    })
    e.ctx.addRoot('env', {
      t: 'gen',
      id: unit(e, { k: 'after-unit', unit: 0 }),
    })
    expect(e.render().code).toBe(
      `const a = 1;\n/*i*/const gen = 1\n;(a).b = 2\n`,
    )
  })

  // Source: the final review of design 1 (findings 1 and 2): an insert has
  // one owner, the text holding its position (the innermost node strictly
  // holding it, else the unit holding the byte there), and renders and is
  // read with that text only.
  it.each([
    [
      'the start of a statement placement drops: it goes with it',
      'function h',
      'export const y = 2\n',
    ],
    [
      'the start of a kept declarator: what it names stays',
      'y = h',
      'const k = 5\nexport const use(k);y = 2\n',
    ],
  ])('renders an insert naming a binding at %s', (_, at, expected) => {
    const code = `const k = 5\nfunction h() { return k }\nexport const y = h\n`
    const e = engine(code)
    const k = e.ctx.t1.units[0]!.declares[0]!
    // (`h` is orphaned by the edit of its only reader)
    e.ctx.rewrites.edit({
      range: rangeOf(code, 'h', 1),
      body: [text('2')],
      by: 'toy',
    })
    e.ctx.rewrites.insert({
      at: rangeOf(code, at).start,
      body: [{ k: 'text', parts: ['use(', { sym: k }, ');'] }],
      by: 'toy',
    })
    expect(e.render().code).toBe(expected)
  })

  it.each([
    ["a statement's keyword", (code: string) => rangeOf(code, 'export').start],
    ['the end of the module', (code: string) => code.length],
  ])('refuses an insert at %s: no text holds it', (_, at) => {
    const code = `const h = 1\nexport const y = h\n`
    const e = engine(code)
    expect(() =>
      e.ctx.rewrites.insert({ at: at(code), body: [text('b0;')], by: 'toy' }),
    ).toThrow(/stands in no statement/)
  })

  // A region nests in one unit: one over whole statements would own their
  // references, which placement then reads for no unit (it dropped a
  // declaration kept code reads). Source: design 2 steps 0-1 lane, finding 3.
  it.each([
    ['two statements', 'const a = 1\nfunction b() { return 2 }\n'],
    ['a whole declaration', 'const a = 1\n'],
  ])('refuses a region over %s', (_, over) => {
    const code = `const a = 1\nfunction b() { return 2 }\nexport const c = a + b\n`
    const e = engine(code)
    expect(() => e.ctx.region(rangeOf(code, over), 'custom')).toThrow(
      /^conflict: a custom region \[\d+, \d+\) holds unit \d+/,
    )
  })

  it('accepts a region on exactly a statement', () => {
    const code = `createServerFn().handler(h)\nexport const c = 1\n`
    const e = engine(code)
    expect(() =>
      e.ctx.region(rangeOf(code, 'createServerFn().handler(h)'), 'custom'),
    ).not.toThrow()
  })

  it('fails the compile when a planner edit across two statements holds an anchored unit', () => {
    const code = `const a = 1\nconst b = 2\nexport const c = a + b\n`
    const e = engine(code)
    e.ctx.rewrites.edit({
      range: rangeOf(code, 'const a = 1\nconst b = 2'),
      body: [
        text('/*x*/'),
        { k: 'slice', range: rangeOf(code, 'const a = 1\nconst b = 2') },
      ],
      by: 'toy',
    })
    e.ctx.addRoot('env', {
      t: 'gen',
      id: unit(e, { k: 'before-unit', unit: 1 }),
    })
    expect(() => e.render()).toThrow(/conflict: the text .* cuts toy/)
  })

  it('fails the compile when a planner edit on exactly a statement keeps text placement cuts', () => {
    const code = `const a = 1, b = 2\nexport const c = b\n`
    const e = engine(code)
    const statement = rangeOf(code, 'const a = 1, b = 2\n')
    e.ctx.rewrites.edit({
      range: statement,
      body: [text('/*x*/'), { k: 'slice', range: statement }],
      by: 'toy',
    })
    // (`a` is orphaned by the edit of its only reader: the declarator list is cut)
    e.ctx.rewrites.edit({
      range: rangeOf(code, 'b', 1),
      body: [text('2')],
      by: 'toy',
    })
    expect(() => e.render()).toThrow(/conflict: the text .* cuts toy/)
  })
})

// Liveness against what the outputs hold (I2), for the two shapes the seeded
// random rewrite trees found (design 1, steps 1-3): what a planner's
// `liveness` reports of a name in a claimed region is what the output holds
// (in the env module exactly; in the derived output, a name it holds is
// live), and verify accepts the outputs.
describe('liveness of a claimed region, as the outputs hold it', () => {
  const code = `import { c0_, c1_, a2_, c3_, a4_ } from 'toy-names'\nc0_(c1_(a2_, c3_(a4_)))\n`
  const names = ['c0_', 'c1_', 'a2_', 'c3_', 'a4_']
  const claimed = 'c3_(a4_)'

  /** Claims `claimed` (read in the env module or not; for every output but `except`), after `before` registered its edit; records what `liveness` reports. */
  const claiming = (
    read: boolean,
    except: 'env' | 'other' | null,
    before: (ctx: PlanContext, other: OutputId) => void,
    reported: Map<'env' | 'other', Map<string, boolean>>,
  ): Planner => ({
    name: 'toy-claim',
    tier: 1,
    gate: () => true,
    plan(ctx) {
      const other: OutputId = ctx.declareOutput({
        kind: 'split',
        key: 'other',
        derived: { kind: 'split', value: 'other' },
      })
      before(ctx, other)
      const region = ctx.region(rangeOf(code, claimed), 'nested-chain')
      const hoisted = ctx.names.alloc('g0')
      const owner = ctx.rewrites.addGenerated({
        body: [
          { k: 'text', parts: ['const ', { sym: hoisted.sym }, ' = '] },
          { k: 'region', id: region },
          { k: 'text', parts: ['\n'] },
        ],
        declares: [hoisted.sym],
        effectful: false,
        anchor: { k: 'end' },
        home: 'auto',
        by: 'toy-claim',
      })
      if (read) {
        const reader = ctx.names.alloc('r0')
        const gen = ctx.rewrites.addGenerated({
          body: [
            {
              k: 'text',
              parts: [
                'export const ',
                { sym: reader.sym },
                ' = () => ',
                { sym: hoisted.sym },
                '\n',
              ],
            },
          ],
          declares: [reader.sym],
          effectful: false,
          anchor: { k: 'end' },
          home: 'auto',
          by: 'toy-claim',
        })
        ctx.addRoot('env', { t: 'gen', id: gen })
      }
      ctx.rewrites.claim({
        region,
        owner,
        placeholder: [{ k: 'text', parts: [{ sym: hoisted.sym }] }],
        scope:
          except === null
            ? 'all-outputs'
            : { except: [except === 'env' ? 'env' : other] },
        by: 'toy-claim',
      })
      for (const o of ['env', 'other'] as const) {
        const view = ctx.liveness(o === 'env' ? 'env' : other)
        const live = new Map<string, boolean>()
        for (const ref of ctx.t1.refs.all) {
          live.set(ctx.symbols.name(ref.sym), view.live(ref))
        }
        reported.set(o, live)
      }
    },
  })

  async function check(
    read: boolean,
    except: 'env' | 'other' | null,
    before: (ctx: PlanContext, other: OutputId) => void,
  ) {
    const reported = new Map<'env' | 'other', Map<string, boolean>>()
    const planners = [claiming(read, except, before, reported)]
    const host = new MemoryHost({ files: { '/app/mod.ts': code } })
    const held = {
      env: (await host.compile('/app/mod.ts', planners))!.code,
      other: (await host.compile('/app/mod.ts?tsr-split=other', planners))!
        .code,
    }
    /** Whether an output's text, past its imports, names `name`. */
    const holds = (o: 'env' | 'other', name: string) =>
      new RegExp(`\\b${name}(?!\\w)`).test(
        held[o]
          .split('\n')
          .filter((l) => !l.startsWith('import '))
          .join('\n'),
      )
    for (const name of names) {
      expect(reported.get('env')!.get(name), `env ${name}`).toBe(
        holds('env', name),
      )
      if (holds('other', name)) {
        expect(reported.get('other')!.get(name), `other ${name}`).toBe(true)
      }
    }
    return held
  }

  // One output's placeholder on exactly the region, claimed for the other
  // outputs (an override): that output shows the placeholder's text at the
  // place; the claimed text renders in its owner where something reads it.
  // Source: rewrite-random (design 1 step 1: 183 of 3,000 seeds, e.g. seed
  // 30, reported text live that did not render; steps 2-3: the override
  // shape, 307 entries in 1,000 seeds at the step 3 base).
  it.each([
    ['the env module', 'read', 'env', true],
    ['the env module', 'not read', 'env', false],
    ['the derived output', 'read', 'other', true],
    ['the derived output', 'not read', 'other', false],
  ] as const)(
    'reports the names of a claimed region %s replaces as it renders them (%s)',
    async (_, _read, output, read) => {
      const held = await check(read, output, (ctx, other) => {
        const placed: OutputId = output === 'env' ? 'env' : other
        ctx.rewrites.placeholder({
          range: rangeOf(code, claimed),
          body: [{ k: 'text', parts: ['0'] }],
          scope: [placed],
          by: 'toy-env',
        })
      })
      if (output === 'env') {
        expect(held.env).toContain('c0_(c1_(a2_, 0))')
      }
    },
  )

  // An edit of the call around the region that keeps exactly its text (a
  // slice): the claim takes the kept text, and the edit renders the
  // placeholder where the slice stands.
  // Source: rewrite-random (design 1 step 1: 7 of 3,000 seeds failed
  // verify (g), "reads g5, which it neither declares nor imports").
  it.each([
    ['read', true],
    ['not read', false],
  ])(
    'reports the names of a claimed region another edit keeps as a slice as it renders them (%s)',
    async (_, read) => {
      const held = await check(read, null, (ctx) =>
        ctx.rewrites.edit({
          range: rangeOf(code, `c1_(a2_, ${claimed})`),
          body: [
            { k: 'text', parts: ['k('] },
            { k: 'slice', range: rangeOf(code, claimed) },
            { k: 'text', parts: [')'] },
          ],
          by: 'toy-keep',
        }),
      )
      expect(held.env).toContain('c0_(k(g0))')
      expect(held.env).toContain('const g0 = c3_(a4_)')
    },
  )
})
