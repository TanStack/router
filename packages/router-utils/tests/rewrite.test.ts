import { describe, expect, it } from 'vitest'
import { dedent } from './helpers'
import { engine, rangeOf } from './engine'
import type { OutputId } from '../src/compiler'

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
    rewrites.add({
      range: outer,
      body: [
        { k: 'text', parts: ['tsrRpc('] },
        { k: 'slice', range: arg },
        { k: 'text', parts: [')'] },
      ],
      scope: 'all-outputs',
      by: 'a',
    })
    const innerCall = rangeOf(code, 'clientOnly(() => 1)')
    rewrites.add({
      range: innerCall,
      body: [{ k: 'text', parts: ['(() => {})'] }],
      scope: 'all-outputs',
      by: 'b',
    })
    const second = rangeOf(code, 'wrapServer(() => 2)')
    rewrites.add({
      range: second,
      body: [{ k: 'text', parts: ['tsrStub()'] }],
      scope: 'all-outputs',
      by: 'a',
    })
    // an edit inside the erased argument of the second call is dead
    rewrites.add({
      range: rangeOf(code, '2)'),
      body: [{ k: 'text', parts: ['3'] }],
      scope: 'all-outputs',
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
    rewrites.add({
      range: rangeOf(code, '2'),
      body: [{ k: 'text', parts: [{ sym: gen.sym, ctx: 'callee' }, '()'] }],
      scope: 'all-outputs',
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
      e.ctx.rewrites.add({
        range: rangeOf(code, '1 + 2'),
        body: [],
        scope: 'all-outputs',
        by: 'x',
      })
      e.ctx.rewrites.add({
        range: rangeOf(code, '2 + 3'),
        body: [],
        scope: 'all-outputs',
        by: 'y',
      })
      expect(() => e.render()).toThrow(/partially overlaps/)
    }
    {
      const e = engine(code)
      e.ctx.rewrites.add({
        range: rangeOf(code, '1 + 2'),
        body: [{ k: 'text', parts: ['9'] }],
        scope: 'all-outputs',
        by: 'x',
      })
      e.ctx.rewrites.add({
        range: rangeOf(code, '1 + 2'),
        body: [{ k: 'text', parts: ['8'] }],
        scope: 'all-outputs',
        by: 'y',
      })
      expect(() => e.render()).toThrow(/different bodies/)
    }
    {
      const e = engine(code)
      e.ctx.rewrites.add({
        range: rangeOf(code, '1 + 2'),
        body: [{ k: 'text', parts: ['9'] }],
        scope: 'all-outputs',
        by: 'x',
      })
      e.ctx.rewrites.add({
        range: rangeOf(code, '1 + 2'),
        body: [{ k: 'text', parts: ['9'] }],
        scope: 'all-outputs',
        by: 'y',
      })
      expect(e.render().code).toBe('const a = 9 + 3\n')
    }
  })

  it('scopes edits per output and erases a property in the env output only (deleteNodes)', () => {
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
    e.ctx.rewrites.add({
      range: rangeOf(code, 'ssr: false, '),
      body: [],
      scope: ['env'],
      by: 'split',
    })
    expect(e.render('env').code).toBe('export const Route = { component: 1 }\n')
    // exported clusters stay in the env module; the chunk imports them
    expect(e.render(chunk).code).toBe("import { Route } from './route.tsx'\n")
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
    e.ctx.renameRefs(sym, { sym: to.sym }, 'all-outputs', 'hmr')
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

  it('renames JSX tags (open and close) of a component binding', () => {
    const code = dedent(`
      const Foo = () => null
      const el = <Foo><Foo/></Foo>
    `)
    const e = engine(code)
    const sym = e.ctx.t1.units[0]!.declares[0]!
    e.ctx.renameRefs(
      sym,
      { sym: e.ctx.names.alloc('TsrFoo').sym },
      'all-outputs',
      'hmr',
    )
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
      e.ctx.rewrites.ref(
        ref,
        { member: [props.sym, 'read'] },
        'all-outputs',
        'hydrate',
      )
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
    e.ctx.renameRefs(
      pageSym,
      { sym: e.ctx.names.alloc('TsrPage').sym },
      'all-outputs',
      'hmr',
    )
    e.ctx.renameRefs(
      homeSym,
      { sym: e.ctx.names.alloc('TsrHome').sym },
      'all-outputs',
      'hmr',
    )
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
        { k: 'slice', range: value },
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
        { k: 'slice', range: value },
        { k: 'text', parts: ['\n'] },
      ],
      declares: [hoisted.sym],
      effectful: false,
      anchor: { k: 'before-unit', unit: 2 },
      home: 'auto',
      by: 'hmr',
    })
    ctx.rewrites.claim({
      region,
      owner,
      placeholder: [{ k: 'text', parts: [{ sym: hoisted.sym }] }],
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
    // the env's option value becomes a lazy wrapper (text replacing the placeholder occurrence is the claim's job; here we erase the read)
    ctx.rewrites.add({
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

  it('nests an edit addressed to every output on exactly a claimed region inside the claim: it travels with the region', () => {
    // an environment rewrite of exactly the hoisted value (the value is
    // itself an env-only call) renders where the value does, in the chunk;
    // the env output keeps the placeholder
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
        { k: 'slice', range: value },
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
    ctx.rewrites.add({
      range: value,
      body: [{ k: 'slice', range: impl }],
      scope: 'all-outputs',
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
        { k: 'slice', range: children },
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
    ctx.rewrites.add({
      range: rangeOf(code, 'wrapServer(() => <Hydrate><Heavy/></Hydrate>)'),
      body: [{ k: 'text', parts: ['tsrStub()'] }],
      scope: 'all-outputs',
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
          { k: 'slice', range: handler },
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
          { k: 'slice', range: chain },
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
      ctx.rewrites.add({
        range: rangeOf(
          code,
          "loader: () => { const fn = make(() => 'hi'); return fn } ",
        ),
        body: [],
        scope: 'all-outputs',
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

  // The erasure may start where the claim does (`[make(…) as any, 1]`): the
  // edits inside the region still render inside its owner.
  it('renders the edits inside a claim read elsewhere when the erasure starts with it', () => {
    const code = dedent(`
      import { make } from './make'
      export const list = [make(() => 'hi') as any, 1]
    `)
    const e = engine(code)
    const { ctx } = e
    const chain = rangeOf(code, "make(() => 'hi')")
    ctx.rewrites.add({
      range: rangeOf(code, "() => 'hi'"),
      body: [{ k: 'text', parts: ['tsrRpc'] }],
      scope: 'all-outputs',
      by: 'env',
    })
    const hoisted = ctx.names.alloc('tsrHoisted')
    const region = ctx.region(chain, 'nested-chain')
    const owner = ctx.rewrites.addGenerated({
      body: [
        { k: 'text', parts: ['const ', { sym: hoisted.sym }, ' = '] },
        { k: 'slice', range: chain },
        { k: 'text', parts: ['\n'] },
      ],
      declares: [hoisted.sym],
      effectful: false,
      anchor: { k: 'after-unit', unit: 0 },
      home: 'auto',
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
    ctx.rewrites.add({
      range: rangeOf(code, "make(() => 'hi') as any"),
      body: [{ k: 'text', parts: [','] }],
      scope: 'all-outputs',
      by: 'router',
    })
    e.freeze()
    expect(e.render('env').code).toContain('const tsrHoisted = make(tsrRpc)')
  })

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
          { k: 'slice', range },
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
    const inner = claimRead(rangeOf(code, 'inner(1)'), 'tsrInner')
    claimRead(rangeOf(code, 'make(() => inner(1))'), 'tsrOuter')
    ctx.rewrites.add({
      range: rangeOf(code, 'loader: () => make(() => inner(1)) '),
      body: [],
      scope: 'all-outputs',
      by: 'router',
    })
    e.freeze()
    expect(ctx.rewrites.tree('env').placeholderRenders(inner.region)).toBe(true)
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
        { k: 'slice', range: chain },
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
      by: 'env',
    })
    ctx.rewrites.add({
      range: chain,
      body: [{ k: 'slice', range: chain }],
      scope: ['env'],
      by: 'env',
    })
    ctx.rewrites.add({
      range: rangeOf(code, 'loader: () => make(1) '),
      body: [],
      scope: 'all-outputs',
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
        { k: 'slice', range: children },
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
    ctx.rewrites.add({
      range: { start: name.start, end: name.start + 3 },
      body: [{ k: 'text', parts: [{ sym: tipSym }] }],
      scope: [out],
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
          { k: 'slice', range: children },
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
              ` = tsrLazy(() => import('./route.tsx?tss-hydrate=h${n}'), 'TsrHydrate${n}')\n`,
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
      const TsrHydrate1 = tsrLazy(() => import('./route.tsx?tss-hydrate=h1'), 'TsrHydrate1')
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
      "const TsrHydrate0 = tsrLazy(() => import('./route.tsx?tss-hydrate=h0'), 'TsrHydrate0')",
    )
    expect(env).not.toContain("'./route.tsx?tss-hydrate=h1'")
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
    e.ctx.rewrites.add({
      range: rangeOf(code, 'export { one, two }\n'),
      body: [],
      scope: 'all-outputs',
      by: 'x',
    })
    e.ctx.rewrites.add({
      range: rangeOf(code, 'a()'),
      body: [{ k: 'text', parts: ['1'] }],
      scope: 'all-outputs',
      by: 'x',
    })
    e.ctx.rewrites.add({
      range: rangeOf(code, 'bb()'),
      body: [{ k: 'text', parts: ['2'] }],
      scope: 'all-outputs',
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
      import { f } from './route.tsx'
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
      import { b } from './route.tsx'
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
      "import { c } from './route.tsx'\nconst h = () => c\n",
    )
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
      e.ctx.rewrites.add({
        range: { start, end: start + call.length },
        body: [
          { k: 'text', parts: ['('] },
          { k: 'slice', range: arg },
          { k: 'text', parts: [')'] },
        ],
        scope: 'all-outputs',
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
      e.ctx.rewrites.add({
        range: { start, end: start + call.length },
        body: [{ k: 'text', parts: [replacement] }],
        scope: 'all-outputs',
        by: 'toy',
      })
    }
    replace('wrap(1)', '/* @__PURE__ */ lazy(1)')
    replace('wrap(2)', '/* @__PURE__ */ (0, lazy)(2)')
    const out = e.render().code
    expect(out).toContain('const x = foo\n/* @__PURE__ */ lazy(1)\n')
    expect(out).toContain('const y = bar\n;/* @__PURE__ */ (0, lazy)(2)\n')
  })
})
