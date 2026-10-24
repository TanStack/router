import { describe, expect, it } from 'vitest'
import { dedent } from './helpers'
import { engine, rangeOf } from './engine'
import type { OutputId } from '../src/compiler'

describe('rewrite tree', () => {
  it('nests an inner edit inside a retained child slice and drops one inside erased text (A2)', () => {
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
      reason: 'deleteNodes',
    })
    expect(e.render('env').code).toBe('export const Route = { component: 1 }\n')
    // exported clusters stay in the env module; the chunk imports them (§3.5.2)
    expect(e.render(chunk).code).toBe("import { Route } from './route.tsx'\n")
  })
})

describe('context-aware reference rewrites (§3.17)', () => {
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

  it('rewrites a bare callee to a member target as an unbound call (N8-B)', () => {
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

  it('renames a directly exported declaration via the statement-level recipe (R38)', () => {
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

describe('claims, homes and substitution (R37, R39)', () => {
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

  it('homes the hoist in the chunk when only the chunk roots the placeholder (N7 composition)', () => {
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
    // the split planner claims nothing new: it re-roots the placeholder's symbol in the chunk
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

  it('kills a claim whose ancestor is erased (gate k, ancestor erasure)', () => {
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
    expect(ctx.rewrites.claimLive(region, 'env')).toBe(false)
    expect(ctx.rewrites.claimLive(region, h)).toBe(false)
    const plan = e.freeze()
    expect(e.render(h).code).toBe('export {}\n')
    expect(plan.edges[h]).toEqual([])
    expect(e.render('env').code).toBe(
      dedent(`
      export const fn = tsrStub()
    `),
    )
  })

  it('forwards captures through nested placeholders with a substitution environment (N9)', () => {
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
      // the parent's lazy const has the same name (D10: same name, same thing) but is its own symbol
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

describe('statement-level edits (R17)', () => {
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
