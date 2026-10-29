/**
 * The `<Hydrate>` planner (J5) on the compiler core, through
 * `compileModule` and an in-memory host: what each env serves for a module
 * and for its `?tss-hydrate=<id>` chunks.
 */
import { createHash } from 'node:crypto'
import { posix } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  expectMapsTo,
  positionAt,
  tokenOffsets,
} from '@tanstack/compiler-test-utils/source-maps'
import { createHydratePlanner } from '../../src/planners/hydrate'
import { MemoryHost, clientEnv, envInfo, ssrEnv } from './memory-host'
import type {
  CompileOutput,
  EnvInfo,
  PlanContext,
  Planner,
  SymbolId,
} from '@tanstack/router-utils/compiler'

const buildClientEnv = envInfo({ mode: 'build' })
const ROOT = '/app'
const FILE = '/app/src/page.tsx'
const HASH = createHash('sha1')
  .update('src/page.tsx')
  .digest('hex')
  .slice(0, 10)

const hydrate = createHydratePlanner()

const REACT = `import { Hydrate } from '@tanstack/react-start'\n`
const SOLID = `import { Hydrate } from '@tanstack/solid-start'\n`

/** The id of the boundary whose `<` is the `nth` occurrence of `needle` in `code`. */
function idAt(code: string, needle = '<Hydrate', nth = 0): string {
  let at = -1
  for (let i = 0; i <= nth; i++) {
    at = code.indexOf(needle, at + 1)
  }
  if (at === -1) {
    throw new Error(`no ${needle} in the code`)
  }
  // the id's ordinal counts the boundaries before this one (`<Hydrate`
  // openings; the recognition rows have one boundary each)
  const ordinal = (code.slice(0, at).match(/<Hydrate\b/g) ?? []).length
  return `${ordinal.toString(36)}_${HASH}`
}

interface Compiled {
  out: CompileOutput
  code: string
  /** The boundaries the output extracts (the chunks it imports, nested ones included), in source order. */
  extracted: Array<{ id: string; chunk: string }>
  /** Chunk code by boundary id. */
  chunks: Record<string, string>
  chunkOutputs: Record<string, CompileOutput>
  errors: Array<{ code: string | undefined; start: number | undefined }>
  host: MemoryHost
}

async function compile(
  code: string,
  opts: {
    env?: EnvInfo
    files?: Record<string, string>
    planners?: ReadonlyArray<Planner>
    config?: Record<string, unknown>
    id?: string
    wantMap?: boolean
  } = {},
): Promise<Compiled> {
  const id = opts.id ?? FILE
  const path = id.split('?')[0]!
  const host = new MemoryHost({ [path]: code, ...opts.files })
  const planners = opts.planners ?? [hydrate]
  const config = {
    configKey: 'cfg',
    perPlanner: { hydrate: { root: ROOT, ...opts.config } },
  }
  const env = opts.env ?? clientEnv
  const out = await host.compile(id, planners, {
    env,
    config,
    wantMap: opts.wantMap,
  })
  if (!out) {
    throw new Error('the module was not compiled')
  }
  // the chunks the output imports, directly or through the module's other
  // outputs (a boundary in a component an extracted-export module holds)
  const extracted: Compiled['extracted'] = []
  const chunks: Record<string, string> = {}
  const chunkOutputs: Record<string, CompileOutput> = {}
  const seen = new Set<string>()
  const ownOutput = `./${posix.basename(path)}?`
  const visit = async (output: CompileOutput): Promise<void> => {
    for (const e of output.edges) {
      if (!e.specifier.startsWith(ownOutput) || seen.has(e.specifier)) {
        continue
      }
      seen.add(e.specifier)
      const derived = posix.join(posix.dirname(path), e.specifier)
      const c = (await host.compile(derived, planners, {
        env,
        config,
        wantMap: opts.wantMap,
      }))!
      const id = /[?&]tss-hydrate=([^&]+)/.exec(e.specifier)?.[1]
      if (id !== undefined) {
        extracted.push({ id, chunk: derived })
        chunks[id] = c.code
        chunkOutputs[id] = c
      }
      await visit(c)
    }
  }
  await visit(out)
  // (an id's ordinal counts the boundaries before it: `idAt`)
  const ordinal = (id: string) => parseInt(id.split('_')[0]!, 36)
  extracted.sort((a, b) => ordinal(a.id) - ordinal(b.id))
  return {
    out,
    code: out.code,
    extracted,
    chunks,
    chunkOutputs,
    errors: out.diagnostics
      .filter((d) => d.severity === 'error')
      .map((d) => ({ code: d.code, start: d.range?.start })),
    host,
  }
}

/** Both envs. */
async function both(code: string, opts: Parameters<typeof compile>[1] = {}) {
  const [client, server] = await Promise.all([
    compile(code, { ...opts, env: clientEnv }),
    compile(code, { ...opts, env: ssrEnv }),
  ])
  return { client, server }
}

/** The `h` prefixes an output renders, in order. */
const prefixes = (code: string) =>
  [...code.matchAll(/ h="([^"]+)"/g)].map((m) => m[1])

describe('recognition (J5.1)', () => {
  it.each([
    ['a named import', REACT, '<Hydrate when={w}>', '</Hydrate>'],
    [
      'a renamed import',
      `import { Hydrate as HW } from '@tanstack/react-start'\n`,
      '<HW when={w}>',
      '</HW>',
    ],
    [
      'a namespace member',
      `import * as Start from '@tanstack/react-start'\n`,
      '<Start.Hydrate when={w}>',
      '</Start.Hydrate>',
    ],
  ])('%s is a boundary', async (_, head, open, close) => {
    const code = `${head}import { Chart } from './chart'\nexport const Page = ({ w }) => ${open}<Chart />${close}\n`
    const { client, server } = await both(code)
    const id = idAt(code, open)
    expect(client.extracted).toEqual([
      { id, chunk: `${FILE}?tss-hydrate=${id}` },
    ])
    expect(client.code).toContain(
      `${open.slice(0, -1)} h="${id}"><TsrHydrate0/>${close}`,
    )
    expect(client.chunks[id]).toBe(
      `import { Chart } from './chart'\nfunction TsrHydrate0() { return (<Chart />) }\nexport { TsrHydrate0 as H0 }\n`,
    )
    expect(server.code).toContain(
      `${open.slice(0, -1)} h="${id}"><Chart />${close}`,
    )
  })

  it.each([
    [
      'a global Hydrate',
      `import { visible } from '@tanstack/react-start/hydration'\nexport const Page = () => <Hydrate when={visible()}><p>x</p></Hydrate>\n`,
    ],
    [
      'a Hydrate of another package',
      `import { Hydrate } from 'not-tanstack-start'\nexport const Page = () => <Hydrate><p>x</p></Hydrate>\n`,
    ],
    [
      'a namespace of another package',
      `import * as Start from 'not-tanstack-start'\nexport const Page = () => <Start.Hydrate><p>x</p></Start.Hydrate>\n`,
    ],
    [
      'a type-only import',
      `import type { Hydrate } from '@tanstack/react-start'\nexport const Page = () => <Hydrate><p>x</p></Hydrate>\n`,
    ],
  ])('%s is left alone (the module is untouched)', async (_, code) => {
    const host = new MemoryHost({ [FILE]: code })
    for (const env of [clientEnv, ssrEnv]) {
      expect(
        await host.compile(FILE, [hydrate], {
          env,
          config: { configKey: 'c', perPlanner: { hydrate: { root: ROOT } } },
        }),
      ).toBeNull()
    }
  })

  it.each([
    [
      'a local component named Hydrate',
      `${REACT}export const Real = () => <Hydrate><p>real</p></Hydrate>
export function Local() {
  const Hydrate = (props) => props.children
  return <Hydrate><p>local</p></Hydrate>
}
`,
    ],
    [
      'a member of a local shadowing the namespace',
      `import * as Start from '@tanstack/react-start'
export const Real = () => <Start.Hydrate><p>real</p></Start.Hydrate>
export function Local({ Start }) {
  return <Start.Hydrate><p>local</p></Start.Hydrate>
}
`,
    ],
    [
      'a deeper member of the namespace',
      `import * as Start from '@tanstack/react-start'
export const Real = () => <Start.Hydrate><p>real</p></Start.Hydrate>
export const Deeper = () => <Start.X.Hydrate><p>local</p></Start.X.Hydrate>
`,
    ],
  ])('%s is a look-alike (G15)', async (_, code) => {
    const { client, server } = await both(code)
    expect(client.extracted).toHaveLength(1)
    expect(client.code).toContain('<p>local</p>')
    expect(server.code).toContain('<p>local</p>')
    expect(prefixes(server.code)).toEqual([client.extracted[0]!.id])
  })

  it('splits the split shorthand and a dynamic split', async () => {
    const code = `${REACT}export const Page = ({ flag }) => <><Hydrate split><p>a</p></Hydrate><Hydrate split={flag}><p>b</p></Hydrate></>\n`
    const { client, server } = await both(code)
    const ids = [idAt(code), idAt(code, '<Hydrate', 1)]
    expect(Object.keys(client.chunks)).toEqual(ids)
    expect(prefixes(server.code)).toEqual(ids)
  })

  it('Solid boundaries load the chunk through the Solid router', async () => {
    const code = `${SOLID}export const Page = () => <Hydrate><p>x</p></Hydrate>\n`
    const client = await compile(code, { env: clientEnv })
    expect(client.code).toContain(
      "import { lazyRouteComponent as tsrLazy } from '@tanstack/solid-router'",
    )
  })
})

describe('the client output (J5.2)', () => {
  it('moves the children into a chunk loaded by a pure lazy component, with child-only code', async () => {
    const code = `${REACT}import { load } from '@tanstack/react-start/hydration'
import { Chart } from './chart'
import { formatValue } from './format'
const title = formatValue('Revenue')
export function Page({ label }) {
  return <Hydrate when={load()}><Chart title={title} label={label} /></Hydrate>
}
`
    const id = idAt(code)
    const client = await compile(code)
    expect(client.code).toBe(
      `import { lazyRouteComponent as tsrLazy } from '@tanstack/react-router'
const TsrHydrate0 = /* @__PURE__ */ tsrLazy(() => import('./page.tsx?tss-hydrate=${id}'), 'H0')
import { Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
export function Page({ label }) {
  return <Hydrate when={load()} h="${id}"><TsrHydrate0 label={label}/></Hydrate>
}
`,
    )
    // an effectful initialiser only the chunk needs, with nothing effectful after it, moves
    // (its only needer is the chunk, nothing else writes it and no later effect
    // could observe the deferred initialisation)
    expect(client.chunks[id]).toBe(
      `import { Chart } from './chart'
import { formatValue } from './format'
const title = formatValue('Revenue')
function TsrHydrate0({ label }) { return (<Chart title={title} label={label} />) }
export { TsrHydrate0 as H0 }
`,
    )
  })

  it('wraps several children, and text, in a fragment that keeps JSX whitespace and entities', async () => {
    const code = `${REACT}export function Page() {
  return <><Hydrate> <p>x</p> </Hydrate><Hydrate>
      Fish &amp;
      Chips &copy;
    </Hydrate><Hydrate>
      <a />
      <b />
    </Hydrate></>
}
`
    const client = await compile(code)
    const ids = client.extracted.map((b) => b.id)
    expect(client.chunks[ids[0]!]).toBe(
      'function TsrHydrate0() { return <> <p>x</p> </> }\nexport { TsrHydrate0 as H0 }\n',
    )
    expect(client.chunks[ids[1]!]).toBe(
      'function TsrHydrate1() { return <>\n      Fish &amp;\n      Chips &copy;\n    </> }\nexport { TsrHydrate1 as H1 }\n',
    )
    expect(client.chunks[ids[2]!]).toBe(
      'function TsrHydrate2() { return <><a />\n      <b /></> }\nexport { TsrHydrate2 as H2 }\n',
    )
    // whitespace lines around the region stay in the parent, where JSX drops them
    expect(client.code).toContain(
      `<Hydrate h="${ids[2]}">\n      <TsrHydrate2/>\n    </Hydrate>`,
    )
  })

  it('returns a single expression child as is', async () => {
    const code = `${REACT}export function Page({ label }) {
  return <Hydrate>{label}</Hydrate>
}
`
    const client = await compile(code)
    const [b] = client.extracted
    expect(client.code).toContain(
      `<Hydrate h="${b!.id}">{<TsrHydrate0 label={label}/>}</Hydrate>`,
    )
    expect(client.chunks[b!.id]).toBe(
      'function TsrHydrate0({ label }) { return (label) }\nexport { TsrHydrate0 as H0 }\n',
    )
  })

  it('extracts a children prop of a self-closing boundary, and boundaries nested in it', async () => {
    const code = `${REACT}import { Chart } from './chart'
export function Page() {
  return <Hydrate children={<section><Chart /><Hydrate><p>inner</p></Hydrate></section>} />
}
`
    const outer = idAt(code)
    const inner = idAt(code, '<Hydrate', 1)
    const { client, server } = await both(code)
    expect(client.code).toContain(
      `<Hydrate children={<TsrHydrate0/>} h="${outer}" />`,
    )
    expect(client.code).not.toContain('./chart')
    expect(client.chunks[outer]).toContain(
      `return (<section><Chart /><Hydrate h="${inner}"><TsrHydrate1/></Hydrate></section>)`,
    )
    expect(client.chunks[inner]).toBe(
      'function TsrHydrate1() { return (<p>inner</p>) }\nexport { TsrHydrate1 as H1 }\n',
    )
    // text order: the nested boundary sits inside the outer opening tag
    expect(prefixes(server.code)).toEqual([inner, outer])
  })

  it.each([
    ['a string children prop', '<Hydrate children="text" />'],
    ['a spread only', '<Hydrate {...props} />'],
    ['no children', '<Hydrate when={w} />'],
    ['empty children', '<Hydrate></Hydrate>'],
    ['a comment only', '<Hydrate>{/* nothing */}</Hydrate>'],
    ['whitespace lines only', '<Hydrate>\n  \n</Hydrate>'],
  ])(
    '%s has nothing to extract: no chunk and no prefix in either env',
    async (_, jsx) => {
      const code = `${REACT}export const Page = (props) => ${jsx}\n`
      const { client, server } = await both(code)
      expect(client.extracted).toEqual([])
      expect(prefixes(client.code)).toEqual([])
      expect(prefixes(server.code)).toEqual([])
      expect(client.code).not.toContain('lazyRouteComponent')
    },
  )

  it.each([
    ['a prefetch prop', 'prefetch={idle()}', true],
    ['an inline spread with prefetch', '{...{ prefetch: idle() }}', true],
    [
      'an inline spread with a computed key',
      "{...{ ['pre' + 'fetch']: 1 }}",
      true,
    ],
    ['a spread of an unknown object', '{...props}', true],
    ['a spread of a single-use const without prefetch', '{...opts}', false],
    ['no prefetch', 'when={idle()}', false],
  ])('%s: the client passes p={…preload} (%s)', async (_, attrs, p) => {
    const code = `${REACT}import { idle } from '@tanstack/react-start/hydration'
const opts = { when: idle() }
export const Page = (props) => <Hydrate ${attrs}><b /></Hydrate>
`
    const { client, server } = await both(code)
    const id = idAt(code)
    expect(client.code).toContain(
      `${attrs} h="${id}"${p ? ' p={TsrHydrate0.preload}' : ''}><TsrHydrate0/>`,
    )
    expect(server.code).not.toContain('preload')
  })

  it('names generated bindings away from the file universe and starts tag names uppercase', async () => {
    // (the user's primitives are copied into the chunk: copyable)
    const code = `${REACT}const TsrHydrate0 = 'mine'
const tsrLazy = 'mine'
export function Page({ props }) {
  return <Hydrate><p>{TsrHydrate0}{tsrLazy}{props}</p></Hydrate>
}
`
    const client = await compile(code)
    const [b] = client.extracted
    expect(client.code).toContain(
      "import { lazyRouteComponent as tsrLazy$1 } from '@tanstack/react-router'",
    )
    expect(client.code).toContain(
      `const TsrHydrate0$1 = /* @__PURE__ */ tsrLazy$1(() => import('./page.tsx?tss-hydrate=${b!.id}'), 'H0')`,
    )
    expect(client.code).toContain('<TsrHydrate0$1 props={props}/>')
    expect(client.chunks[b!.id]).toBe(
      `const TsrHydrate0 = 'mine'
const tsrLazy = 'mine'
function TsrHydrate0$1({ props }) { return (<p>{TsrHydrate0}{tsrLazy}{props}</p>) }
export { TsrHydrate0$1 as H0 }
`,
    )
  })

  it('keeps a foreign query on the chunk id and its specifier', async () => {
    const code = `${REACT}export const Page = () => <Hydrate><p>x</p></Hydrate>\n`
    const client = await compile(code, { id: `${FILE}?flavour=b` })
    const [b] = client.extracted
    expect(b!.chunk).toBe(`${FILE}?flavour=b&tss-hydrate=${b!.id}`)
    expect(client.code).toContain(
      `import('./page.tsx?flavour=b&tss-hydrate=${b!.id}')`,
    )
    expect(client.chunks[b!.id]).toContain('return (<p>x</p>)')
  })

  it('records the lazy import as a runtime edge and the moved import as the chunk’s source edge', async () => {
    const code = `${REACT}import { Chart } from './chart'
export const Page = () => <Hydrate><Chart /></Hydrate>
`
    const client = await compile(code)
    const [b] = client.extracted
    const env = client.out.edges.map((e) => [e.specifier, e.provenance.origin])
    expect(env).toContainEqual(['@tanstack/react-router', 'runtime'])
    expect(env).toContainEqual([`./page.tsx?tss-hydrate=${b!.id}`, 'runtime'])
    expect(env).not.toContainEqual(['./chart', 'source'])
    expect(
      client.chunkOutputs[b!.id]!.edges.map((e) => [
        e.specifier,
        e.provenance.origin,
        e.importerId,
      ]),
    ).toEqual([['./chart', 'source', b!.chunk]])
  })

  it('compiles the same chunk from a chunk-first request and from a recompile', async () => {
    const code = `${REACT}import { Chart } from './chart'
export const Page = ({ a }) => <Hydrate><Chart a={a} /></Hydrate>
`
    const client = await compile(code)
    const [b] = client.extracted
    const fresh = new MemoryHost({ [FILE]: code })
    const config = {
      configKey: 'cfg',
      perPlanner: { hydrate: { root: ROOT } },
    }
    const first = await fresh.compile(b!.chunk, [hydrate], { config })
    expect(first!.code).toBe(client.chunks[b!.id])
    const again = await fresh.compile(b!.chunk, [hydrate], {
      config,
      code: `${code}`,
    })
    expect(again!.code).toBe(first!.code)
  })
})

describe('captures (J5.2)', () => {
  const capturesOf = async (body: string) => {
    const client = await compile(`${REACT}${body}`, { env: clientEnv })
    const [b] = client.extracted
    return { code: client.code, chunk: client.chunks[b!.id]!, client }
  }

  it('passes locals of the enclosing scopes, not module bindings or names declared inside', async () => {
    const { code, chunk } = await capturesOf(`const fromModule = 1
export function Page({ a: [b = 1], ...rest }) {
  const value = 'outer'
  let latest = 'first'
  latest = 'second'
  try { throw 1 } catch (error) {
    return <Hydrate><p>{b}{rest.x}{value}{latest}{error}{fromModule}{[1].map((item) => { const inner = item; return inner })}</p></Hydrate>
  }
}`)
    expect(code).toContain(
      '<TsrHydrate0 b={b} rest={rest} value={value} latest={latest} error={error}/>',
    )
    expect(chunk).toContain(
      'function TsrHydrate0({ b, rest, value, latest, error }) {',
    )
  })

  it('passes a local shadowing a module binding; the chunk keeps the module binding for code that reads it', async () => {
    const code = `${REACT}import { label } from './labels'
const value = 'module'
function Show() { return <b>{value + ':' + label}</b> }
export function Page() {
  const label = 'local'
  const value = 'local-value'
  return <Hydrate><Show /><i>{label}{value}</i></Hydrate>
}
`
    const client = await compile(code)
    const [b] = client.extracted
    expect(client.code).toContain('<TsrHydrate0 label={label} value={value}/>')
    expect(client.code).not.toContain('./labels')
    expect(client.chunks[b!.id]).toBe(
      `import { label } from './labels'
const value = 'module'
function Show() { return <b>{value + ':' + label}</b> }
function TsrHydrate0({ label, value }) { return <><Show /><i>{label}{value}</i></> }
export { TsrHydrate0 as H0 }
`,
    )
  })

  it('renames props React keeps for itself (key, ref, children)', async () => {
    const { code, chunk } =
      await capturesOf(`export function Page({ children }) {
  const key = 'k'
  const ref = 'r'
  return <Hydrate><p>{key}{ref}{children}</p></Hydrate>
}`)
    expect(code).toContain(
      '<TsrHydrate0 tsrCap$key={key} tsrCap$ref={ref} tsrCap$children={children}/>',
    )
    expect(chunk).toContain(
      '({ tsrCap$key: key, tsrCap$ref: ref, tsrCap$children: children })',
    )
  })

  it('takes JSX tags of locals for reads: _, $, non-ASCII and member roots, not intrinsic names', async () => {
    const { code } = await capturesOf(`export function Page({ Model }) {
  const _Local = () => 1, $Local = () => 2, ÉLocal = () => 3, 组件 = () => 4
  const ui = { Home: () => 5 }
  const div = sideEffect('div')
  console.log(div)
  return <Hydrate><_Local /><$Local /><ÉLocal /><组件 /><ui.Home /><Model.Item /><div>x</div></Hydrate>
}`)
    expect(code).toContain(
      '<TsrHydrate0 _Local={_Local} $Local={$Local} ÉLocal={ÉLocal} 组件={组件} ui={ui} Model={Model}/>',
    )
  })

  it('takes neither property names, method keys, member names nor locals bound inside for reads', async () => {
    const { code } = await capturesOf(`import { icons } from './icons'
export function Page({ obj, ids }) {
  const el = <Hydrate><p>{obj?.later + ({ later() { return '!' } }).later()}{ids.map((id) => { const Icon = icons[id]; return <Icon key={id} /> })}</p></Hydrate>
  const later = 1
  const Icon = 2
  console.log(later, Icon)
  return el
}`)
    expect(code).toContain('<TsrHydrate0 obj={obj} ids={ids}/>')
  })

  it('passes a local enum and ignores type positions', async () => {
    const { code } = await capturesOf(`import type { Shape } from './types'
export function Page({ v }: { v: unknown }) {
  enum Color { Red = 'red' }
  type Local = string
  return <Hydrate><p>{Color.Red}{(v as Local as Shape) satisfies unknown}</p></Hydrate>
}`)
    expect(code).toContain('<TsrHydrate0 Color={Color} v={v}/>')
  })

  it('keeps the own this and arguments of functions inside the children', async () => {
    const { code, chunk, client } =
      await capturesOf(`export function Page({ items }) {
  return <Hydrate><ul>{items.map(function (item) { return <li>{this.prefix + item + arguments.length}</li> }, { prefix: '>' })}</ul><p>{new (class { label = 'x'; read() { return this.label } })().read()}{({ read() { return this.x } }).read()}</p></Hydrate>
}`)
    expect(client.errors).toEqual([])
    expect(code).toContain('<TsrHydrate0 items={items}/>')
    expect(chunk).toContain('this.prefix + item + arguments.length')
  })

  it('passes the enclosing function’s arguments as tsrArguments, through nested boundaries', async () => {
    const { code, chunk, client } = await capturesOf(`export function Page() {
  return <Hydrate><p>{arguments[0].title}{(() => arguments.length)()}</p><Hydrate>{arguments.length}</Hydrate></Hydrate>
}`)
    const [, inner] = client.extracted
    expect(code).toContain('<TsrHydrate0 tsrArguments={arguments}/>')
    expect(chunk).toContain(
      'function TsrHydrate0({ tsrArguments }) { return <><p>{tsrArguments[0].title}{(() => tsrArguments.length)()}</p>',
    )
    expect(chunk).toContain(
      `<Hydrate h="${inner!.id}">{<TsrHydrate1 tsrArguments={tsrArguments}/>}</Hydrate>`,
    )
    expect(client.chunks[inner!.id]).toBe(
      'function TsrHydrate1({ tsrArguments }) { return (tsrArguments.length) }\nexport { TsrHydrate1 as H1 }\n',
    )
  })

  it('makes an enclosing boundary capture what its nested placeholders read (React)', async () => {
    const code = `${REACT}export function Page({ isOpen, fee }) {
  const label = 'fee'
  return <Hydrate><section><Hydrate><p>{label + ':' + (isOpen ? fee : 0)}</p></Hydrate></section></Hydrate>
}
`
    const client = await compile(code)
    const [outer, inner] = client.extracted
    expect(client.code).toContain(
      '<TsrHydrate0 label={label} isOpen={isOpen} fee={fee}/>',
    )
    expect(client.chunks[outer!.id]).toBe(
      `import { lazyRouteComponent as tsrLazy$1 } from '@tanstack/react-router'
import { Hydrate } from '@tanstack/react-start'
const TsrHydrate1 = /* @__PURE__ */ tsrLazy$1(() => import('./page.tsx?tss-hydrate=${inner!.id}'), 'H1')
function TsrHydrate0({ label, isOpen, fee }) { return (<section><Hydrate h="${inner!.id}"><TsrHydrate1 label={label} isOpen={isOpen} fee={fee}/></Hydrate></section>) }
export { TsrHydrate0 as H0 }
`,
    )
    expect(client.chunks[inner!.id]).toBe(
      "function TsrHydrate1({ label, isOpen, fee }) { return (<p>{label + ':' + (isOpen ? fee : 0)}</p>) }\nexport { TsrHydrate1 as H1 }\n",
    )
  })
})

describe('Solid (J5.2)', () => {
  it('reads captures through props, context-aware, and forwards them to nested boundaries', async () => {
    const code = `${SOLID}export function Page(props) {
  const label = 'x'
  const value = 2
  const read = () => props.count
  const Local = () => <i />
  return <Hydrate><section>{read()}{ { value }.value }<Local></Local><Hydrate><b>{label}{props.count}</b></Hydrate></section></Hydrate>
}
`
    const client = await compile(code, { env: clientEnv })
    const [outer, inner] = client.extracted
    expect(client.code).toContain(
      '<TsrHydrate0 read={read} value={value} Local={Local} label={label} props={props}/>',
    )
    expect(client.chunks[outer!.id]).toContain(
      `function TsrHydrate0(props$1) { return (<section>{(0, props$1.read)()}{ { value: props$1.value }.value }<props$1.Local></props$1.Local><Hydrate h="${inner!.id}"><TsrHydrate1 label={props$1.label} props={props$1.props}/></Hydrate></section>) }`,
    )
    expect(client.chunks[inner!.id]).toBe(
      'function TsrHydrate1(props$1) { return (<b>{props$1.label}{props$1.props.count}</b>) }\nexport { TsrHydrate1 as H1 }\n',
    )
  })

  it('passes a setter for ref={x} on a captured let, and a function ref as is', async () => {
    const code = `${SOLID}export function Page() {
  let input
  const setOther = (node) => node
  return <Hydrate><input ref={input} /><div ref={setOther} /></Hydrate>
}
`
    const client = await compile(code, { env: clientEnv })
    const [b] = client.extracted
    expect(client.code).toContain(
      "<TsrHydrate0 setOther={setOther} tsrRef$input={(el) => typeof input === 'function' ? input(el) : (input = el)}/>",
    )
    expect(client.chunks[b!.id]).toContain(
      'return <><input ref={props.tsrRef$input} /><div ref={props.setOther} /></> }',
    )
  })

  it('rejects ref={x} of a let declared outside two nested boundaries', async () => {
    const code = `${SOLID}export function Page() {
  let input
  return <Hydrate><section><Hydrate><input ref={input} /></Hydrate></section></Hydrate>
}
`
    const client = await compile(code, { env: clientEnv })
    expect(client.errors).toEqual([
      { code: 'hydrate-nested-ref', start: code.indexOf('<Hydrate') },
    ])
  })

  it('makes use: directives reads: a module binding moves with the chunk, a local is passed', async () => {
    const code = `${SOLID}import { tip } from './tip'
export function Page() {
  const local = (el) => el
  return <Hydrate><p use:tip={1} use:local /></Hydrate>
}
`
    const client = await compile(code, { env: clientEnv })
    const [b] = client.extracted
    expect(client.code).not.toContain('./tip')
    expect(client.code).toContain('<TsrHydrate0 local={local}/>')
    expect(client.chunks[b!.id]).toBe(
      `import { tip } from './tip'
function TsrHydrate0(props) { const local = props.local; return (<p use:tip={1} use:local />) }
export { TsrHydrate0 as H0 }
`,
    )
  })

  it('renames ref and children props for Solid too, and passes arguments through props', async () => {
    const code = `${SOLID}export function Page() {
  const ref = 'r'
  return <Hydrate><p>{ref}{arguments.length}</p></Hydrate>
}
`
    const client = await compile(code, { env: clientEnv })
    const [b] = client.extracted
    expect(client.code).toContain(
      '<TsrHydrate0 tsrCap$ref={ref} tsrArguments={arguments}/>',
    )
    expect(client.chunks[b!.id]).toContain(
      'return (<p>{props.tsrCap$ref}{props.tsrArguments.length}</p>)',
    )
  })
})

describe('module-level code the children use', () => {
  // A component only the chunk reads moves with its own property writes
  // (`Card.Title = …`: nothing outside its cluster augments it).
  it('imports exported declarations and Route from the parent; moves what only the chunk uses, augmented components included', async () => {
    const code = `${REACT}import { createFileRoute } from '@tanstack/react-router'
import { makeStore } from './store'
export const Route = createFileRoute('/')({ component: Page })
export const store = makeStore()
let renders = 0
const label = 'Ada'
const helper = (x) => x + 1
export const direct = helper(1)
function Card({ children }) { return <div>{children}</div> }
Card.Title = () => <h1>t</h1>
function Widget() { return <i>{label}</i> }
function Page() {
  return <Hydrate><Card><Card.Title /></Card>{++renders}<Widget />{store.id}{Route.options.id}{helper(2)}</Hydrate>
}
`
    const client = await compile(code)
    const [b] = client.extracted
    expect(client.errors).toEqual([])
    expect(client.chunks[b!.id]).toBe(
      `import { Route, store, helper } from './page.tsx'
let renders = 0
const label = 'Ada'
function Card({ children }) { return <div>{children}</div> }
Card.Title = () => <h1>t</h1>
function Widget() { return <i>{label}</i> }
function TsrHydrate0() { return <><Card><Card.Title /></Card>{++renders}<Widget />{store.id}{Route.options.id}{helper(2)}</> }
export { TsrHydrate0 as H0 }
`,
    )
    expect(client.code).not.toContain('let renders')
    expect(client.code).not.toContain('function Widget')
    expect(client.code).not.toContain('function Card')
    expect(client.code).toContain('export { helper }')
  })

  it('moves a let the children only assign into the chunk', async () => {
    const code = `${REACT}let renders = 0
export const Page = () => <Hydrate><p>{(() => { renders = 1 })()}</p></Hydrate>
`
    const client = await compile(code)
    const [b] = client.extracted
    expect(client.errors).toEqual([])
    expect(client.chunks[b!.id]).toContain('let renders = 0')
    expect(client.code).not.toContain('renders')
  })

  it('rejects children that assign a module binding the parent also uses', async () => {
    const code = `${REACT}let clicks = 0
export function bump() { clicks++ }
export const Page = () => <Hydrate><p onClick={() => clicks++}>{clicks}</p></Hydrate>
`
    const client = await compile(code)
    expect(client.errors).toEqual([
      { code: 'hydrate-module-write', start: code.indexOf('<Hydrate') },
    ])
    expect(client.chunks).toEqual({})
  })

  // (Adjusted: in a build the exported writer and its state are an extracted
  // export only the chunk needs, so the live binding's home is that output,
  // not the parent; in dev it stays in the parent, as on main.)
  it('lets the children read a let the parent reassigns through the live binding', async () => {
    const code = `${REACT}let clicks = 0
export function bump() { clicks++ }
export const Page = () => <Hydrate><p>{clicks}</p></Hydrate>
`
    const client = await compile(code)
    const [b] = client.extracted
    expect(client.chunks[b!.id]).toContain(
      "import { clicks } from './page.tsx'",
    )
    expect(client.code).toContain('let clicks = 0')
    expect(client.code).toContain('export function bump() { clicks++ }')
    expect(client.code).toContain('export { clicks }')
    const built = await compile(code, { env: buildClientEnv })
    expect(built.chunks[b!.id]).toContain(
      "import { clicks } from './page.tsx?tsr-split=export~bump'",
    )
    expect(built.code).toContain(
      "export { bump } from './page.tsx?tsr-split=export~bump'",
    )
    expect(built.code).not.toContain('let clicks')
  })

  it('re-exports every exported binding of an extracted cluster in a build (an exported let and its setter)', async () => {
    const code = `${REACT}export let theme = 'light'
export const setTheme = (t: string) => { theme = t }
export const Page = () => <Hydrate><p>{theme}</p></Hydrate>
`
    const client = await compile(code, { env: buildClientEnv })
    const [b] = client.extracted
    expect(client.chunks[b!.id]).toContain(
      "import { theme } from './page.tsx?tsr-split=export~setTheme'",
    )
    expect(client.code).toContain(
      "export { theme, setTheme } from './page.tsx?tsr-split=export~setTheme'",
    )
    expect(client.code).not.toContain('let theme')
    const dev = await compile(code)
    expect(dev.chunks[b!.id]).toContain("import { theme } from './page.tsx'")
    expect(dev.code).toContain("export let theme = 'light'")
  })

  // A pure exported component only the children render: the chunk carries
  // its own copy; in a build the parent re-exports it from its
  // extracted module for other importers, in dev it keeps it as written
  it('copies a pure exported component the children render into the chunk', async () => {
    const code = `${REACT}export function Card() { return <b>card</b> }
export const Page = () => <Hydrate><Card /></Hydrate>
`
    const built = await compile(code, { env: buildClientEnv })
    const [b] = built.extracted
    expect(built.chunks[b!.id]).toContain(
      'function Card() { return <b>card</b> }',
    )
    expect(built.chunks[b!.id]).not.toContain('export~Card')
    expect(built.code).toContain(
      "export { Card } from './page.tsx?tsr-split=export~Card'",
    )
    expect(built.code).not.toContain('function Card()')
    const dev = await compile(code)
    expect(dev.chunks[b!.id]).toContain(
      'function Card() { return <b>card</b> }',
    )
    expect(dev.code).toContain('export function Card() { return <b>card</b> }')
    expect(dev.code).not.toContain('export~')
  })

  // A component holding a boundary is one instance its chunk imports (a copy
  // in the chunk would carry the boundary's region next to the chunk's own
  // declaration of it): the self-recursive tree of the page tests
  it('imports an exported component holding a boundary from its extracted module instead of copying it', async () => {
    const code = `${REACT}export function Tree({ node }) {
  return <li>{node.label}<Hydrate><ul>{node.children.map((child) => <Tree node={child} />)}</ul></Hydrate></li>
}
`
    const built = await compile(code, { env: buildClientEnv })
    const [b] = built.extracted
    expect(built.chunks[b!.id]).toContain(
      "import { Tree } from './page.tsx?tsr-split=export~Tree'",
    )
    expect(built.chunks[b!.id]).not.toContain('function Tree')
    expect(built.code).toContain(
      "export { Tree } from './page.tsx?tsr-split=export~Tree'",
    )
    const dev = await compile(code)
    expect(dev.chunks[b!.id]).toContain("import { Tree } from './page.tsx'")
    expect(dev.chunks[b!.id]).not.toContain('function Tree')
  })

  it('reads the classic JSX pragma’s factory in a fragment-wrapped chunk', async () => {
    const code = `/** @jsxRuntime classic */
/** @jsx h */
import { h } from './h'
${REACT}export const Page = () => <div><Hydrate>text only</Hydrate></div>
`
    const client = await compile(code)
    const [b] = client.extracted
    expect(client.chunks[b!.id]).toBe(
      `/** @jsxRuntime classic */
/** @jsx h */
import { h } from './h'
function TsrHydrate0() { return /* h */ <>text only</> }
export { TsrHydrate0 as H0 }
`,
    )
    expect(client.code).toContain("import { h } from './h'")
  })
})

describe('rejections (J5.5)', () => {
  const page = (
    children: string,
    split = '',
  ) => `${REACT}import * as React from 'react'
import { useThing, use3D, houseNumber } from './hooks'
export function Page({ flag }) {
  return <Hydrate when={1}${split}>${children}</Hydrate>
}
`
  it.each([
    ['an arrow child', '{() => <p />}', 'hydrate-function-children'],
    [
      'a parenthesized arrow child',
      '{(() => <p />)}',
      'hydrate-function-children',
    ],
    [
      'a function expression child',
      '{function () { return <p /> }}',
      'hydrate-function-children',
    ],
    ['a hook call', '<p>{useThing()}</p>', 'hydrate-hook'],
    ['a hook named use3D', '<p>{use3D()}</p>', 'hydrate-hook'],
    ['a parenthesized hook call', '<p>{(useThing)()}</p>', 'hydrate-hook'],
    ['a namespace hook call', '<p id={React.useId()} />', 'hydrate-hook'],
    [
      'a hook in a nested element’s props',
      '<div><p id={useThing()} /></div>',
      'hydrate-hook',
    ],
    ['this in an arrow', '<p>{(() => this)()}</p>', 'hydrate-this'],
    [
      'new.target of the component',
      '<p>{String(new.target === undefined)}</p>',
      'hydrate-this',
    ],
  ])(
    '%s is rejected at the boundary, in both envs',
    async (_, children, code) => {
      for (const split of ['', ' split={flag}']) {
        const source = page(children, split)
        const { client, server } = await both(source)
        const expected = [{ code, start: source.indexOf('<Hydrate') }]
        expect(client.errors).toEqual(expected)
        expect(server.errors).toEqual(expected)
        expect(client.chunks).toEqual({})
      }
    },
  )

  it('rejects await in the children of an async component', async () => {
    const code = `${REACT}export async function Page({ load }) {
  return <Hydrate><p>{await load()}</p></Hydrate>
}
`
    const { client, server } = await both(code)
    const expected = [
      { code: 'hydrate-await', start: code.indexOf('<Hydrate') },
    ]
    expect(client.errors).toEqual(expected)
    expect(server.errors).toEqual(expected)
    expect(client.chunks).toEqual({})
  })

  it.each([
    ['a hook in a callback', '<p onClick={() => useThing()} />'],
    ['a call that only contains use', '<p>{houseNumber()}</p>'],
    ['await in an async callback', '<p onClick={async () => await flag} />'],
  ])('%s is fine', async (_, children) => {
    const client = await compile(page(children))
    expect(client.errors).toEqual([])
    expect(Object.keys(client.chunks)).toHaveLength(1)
  })

  it('accepts a hook in the boundary’s own props', async () => {
    const client = await compile(
      `${REACT}import { useThing } from './hooks'\nexport const Page = () => <Hydrate when={useThing()}><p /></Hydrate>\n`,
    )
    expect(client.errors).toEqual([])
  })

  it('rejects children reading this or super of a class component, not with split={false}', async () => {
    for (const read of ['this.title', 'super.title']) {
      const body = (
        split: string,
      ) => `${REACT}class Base { get title() { return 'b' } }
export class Page extends Base {
  render() {
    return (
      <Hydrate${split}>
        <p>{${read}}</p>
      </Hydrate>
    )
  }
}
`
      const source = body('')
      const client = await compile(source)
      expect(client.errors).toEqual([
        {
          code: read.startsWith('this') ? 'hydrate-this' : 'hydrate-super',
          start: source.indexOf('<Hydrate'),
        },
      ])
      const opted = await both(body(' split={false}'))
      expect(opted.client.errors).toEqual([])
      expect(opted.server.errors).toEqual([])
    }
  })

  it('rejects children assigning a captured local (React and Solid)', async () => {
    for (const [head, env] of [
      [REACT, clientEnv],
      [SOLID, clientEnv],
    ] as const) {
      const code = `${head}export function Page() {
  let count = 0
  return <Hydrate><button onClick={() => count++}>{count}</button></Hydrate>
}
`
      const client = await compile(code, { env })
      expect(client.errors).toEqual([
        { code: 'hydrate-capture-write', start: code.indexOf('<Hydrate') },
      ])
    }
  })

  it('neither extracts nor rejects nor prefixes split={false}, split={(false)}', async () => {
    for (const split of ['split={false}', 'split={(false)}']) {
      const code = `${REACT}import { useThing } from './hooks'\nexport const Page = () => <Hydrate ${split}>{() => useThing()}</Hydrate>\n`
      const { client, server } = await both(code)
      expect(client.errors).toEqual([])
      expect(server.errors).toEqual([])
      expect(client.code).toBe(code)
      expect(server.code).toBe(code)
    }
  })

  it('validates a nested boundary on its own (the outer one renders its placeholder)', async () => {
    const code = `${REACT}import { useThing } from './hooks'
export const Page = () => <Hydrate><section><Hydrate><p>{useThing()}</p></Hydrate></section></Hydrate>
`
    const { client, server } = await both(code)
    const inner = code.indexOf('<Hydrate', code.indexOf('<section>'))
    expect(client.errors).toEqual([{ code: 'hydrate-hook', start: inner }])
    expect(server.errors).toEqual([{ code: 'hydrate-hook', start: inner }])
  })
})

describe('the server output (J5.3)', () => {
  it.each([
    [
      'a direct fallback',
      '<Hydrate when={w} fallback={<p>fallback-marker</p>}>',
    ],
    [
      'a direct fallback with split={false}',
      '<Hydrate when={w} split={false} fallback={<p>fallback-marker</p>}>',
    ],
    [
      'a fallback next to prefetch and onHydrated',
      '<Hydrate when={w} prefetch={() => {}} fallback={<p>fallback-marker</p>} onHydrated={() => 1}>',
    ],
    [
      'an inline spread',
      '<Hydrate {...{ when: w, fallback: <p>fallback-marker</p> }}>',
    ],
    [
      'a parenthesized inline spread',
      '<Hydrate {...({ when: w, fallback: <p>fallback-marker</p> })}>',
    ],
    [
      'a computed key',
      "<Hydrate {...{ when: w, ['fallback']: <p>fallback-marker</p> }}>",
    ],
    [
      'quoted keys',
      "<Hydrate {...{ 'when': w, 'fallback': <p>fallback-marker</p> }}>",
    ],
    [
      'a spread used once',
      '<Hydrate {...opts}>',
      'const opts = { when: 1, fallback: <p>fallback-marker</p> }\n',
    ],
    [
      'a spread used once, declared after',
      '<Hydrate {...opts}>',
      '',
      'const opts = { when: 1, fallback: <p>fallback-marker</p> }\n',
    ],
    [
      'a parenthesized spread used once',
      '<Hydrate {...(opts)}>',
      'const opts = ({ when: 1, fallback: <p>fallback-marker</p> })\n',
    ],
    [
      'a module-level element',
      '<Hydrate when={w} fallback={fallback}>',
      'const fallback = <p>fallback-marker</p>\n',
    ],
  ])('strips %s', async (_, open, before = '', after = '') => {
    const code = `${REACT}${before}export const Page = ({ w }) => ${open}<p>child</p></Hydrate>\n${after}`
    const { client, server } = await both(code)
    expect(server.code).not.toContain('fallback-marker')
    expect(server.code).toContain('<p>child</p></Hydrate>')
    expect(client.code).toContain('fallback-marker')
  })

  it('strips the fallback attribute with the whitespace before it', async () => {
    const code = `${REACT}export const Page = ({ w }) => <Hydrate when={w} fallback={<i />} key={1}><p /></Hydrate>\n`
    const server = await compile(code, { env: ssrEnv })
    expect(server.code).toContain(
      `<Hydrate when={w} key={1} h="${idAt(code)}"><p /></Hydrate>`,
    )
  })

  it.each([
    [
      'an imported component',
      `import { Spinner } from './client-spinner'\nexport const Page = () => <Hydrate fallback={<Spinner />}><p>child</p></Hydrate>\n`,
    ],
    [
      'a const component rendering an import',
      `import { Spinner } from './client-spinner'\nconst Fallback = () => <Spinner />\nexport const Page = () => <Hydrate fallback={<Fallback />}><p>child</p></Hydrate>\n`,
    ],
    [
      'a class rendering an import',
      `import { Spinner } from './client-spinner'\nclass Fallback { render() { return <Spinner /> } }\nexport const Page = () => <Hydrate fallback={new Fallback().render()}><p>child</p></Hydrate>\n`,
    ],
    [
      'a binding in an inline spread',
      `import { Spinner } from './client-spinner'\nconst spinner = <Spinner />\nexport const Page = () => <Hydrate {...{ fallback: spinner }}><p>child</p></Hydrate>\n`,
    ],
    [
      'a destructured namespace import',
      `import * as lib from './client-spinner'\nconst { Spinner } = lib\nexport const Page = () => <Hydrate fallback={<Spinner />}><p>child</p></Hydrate>\n`,
    ],
    [
      'a declarator next to one the children read',
      `import { Spinner } from './client-spinner'\nconst label = 'child', spinner = <Spinner />\nexport const Page = () => <Hydrate fallback={spinner}><p>{label}</p></Hydrate>\n`,
    ],
    [
      'a single-use spread with split={false}',
      `import { Spinner } from './client-spinner'\nconst opts = { fallback: <Spinner /> }\nexport const Page = () => <Hydrate split={false} {...opts}><p>child</p></Hydrate>\n`,
    ],
    [
      'a local of the component',
      `import { Spinner } from './client-spinner'\nexport function Page() {\n  const spinner = <Spinner />\n  return <Hydrate fallback={spinner}><p>child</p></Hydrate>\n}\n`,
    ],
  ])(
    'drops the client-only module a fallback reaches through %s',
    async (_, code) => {
      const server = await compile(`${REACT}${code}`, { env: ssrEnv })
      expect(server.code).not.toContain('client-spinner')
      expect(server.code).not.toContain('Spinner')
      expect(server.out.edges.map((e) => e.specifier)).not.toContain(
        './client-spinner',
      )
    },
  )

  it('keeps the effects of a local only the fallback read, and its other declarators', async () => {
    const code = `${REACT}import { useSpinner } from './spinner'
export function Page({ a, b }) {
  const s = useSpinner()
  const label = 'child', icon = <i />
  return <Hydrate fallback={<>{s}{icon}{a}</>}><p>{label}{b}</p></Hydrate>
}
`
    const server = await compile(code, { env: ssrEnv })
    // (Adjusted: the core's orphan cleanup keeps the call as `useSpinner();`
    // where the former Hydrate pass wrote `(useSpinner());`, and prunes the
    // `a` prop only the fallback read from the parameter pattern.)
    expect(server.code).toContain(`export function Page({ b }) {
  useSpinner();
  const label = 'child'
  return <Hydrate h="${idAt(code)}"><p>{label}{b}</p></Hydrate>`)
  })

  it.each([
    [
      'shared by two boundaries',
      `const opts = { fallback: <p>server-fallback</p> }\nexport const Page = () => <><Hydrate {...opts}><p>a</p></Hydrate><Hydrate {...opts}><p>b</p></Hydrate></>\n`,
    ],
    [
      'also rendered elsewhere',
      `const opts = { fallback: <p>server-fallback</p> }\nexport const Page = () => <><Hydrate {...opts}><p>a</p></Hydrate><aside>{opts.fallback}</aside></>\n`,
    ],
    [
      'returned by a call',
      `const make = () => ({ fallback: <p>server-fallback</p> })\nconst opts = make()\nexport const Page = () => <Hydrate {...opts}><p>a</p></Hydrate>\n`,
    ],
    [
      'exported',
      `export const opts = { fallback: <p>server-fallback</p> }\nexport const Page = () => <Hydrate {...opts}><p>a</p></Hydrate>\n`,
    ],
  ])('keeps the fallback of an object %s', async (_, code) => {
    const server = await compile(`${REACT}${code}`, { env: ssrEnv })
    expect(server.code).toContain('server-fallback')
  })

  it('serves no chunk on the server', async () => {
    const code = `${REACT}export const Page = () => <Hydrate><p>x</p></Hydrate>\n`
    const server = await compile(code, { env: ssrEnv })
    expect(server.extracted).toEqual([])
    const chunk = await server.host.compile(
      `${FILE}?tss-hydrate=${idAt(code)}`,
      [hydrate],
      {
        env: ssrEnv,
        config: { configKey: 'cfg', perPlanner: { hydrate: { root: ROOT } } },
      },
    )
    expect(chunk!.code).toBe('export {}\n')
  })
})

describe('hydration ids (J5.4)', () => {
  it('derives ids from the pristine offset and the root-relative path, identically in both envs', async () => {
    const code = `${REACT}export const Page = () => <>${Array.from(
      { length: 11 },
      (_, i) => `<Hydrate><p>${i}</p></Hydrate>`,
    ).join('')}</>\n`
    const { client, server } = await both(code)
    const ids = Array.from({ length: 11 }, (_, i) => idAt(code, '<Hydrate', i))
    expect(client.extracted.map((b) => b.id)).toEqual(ids)
    expect(prefixes(client.code)).toEqual(ids)
    expect(prefixes(server.code)).toEqual(ids)
    expect(new Set(ids).size).toBe(11)
    const other = await compile(code, { id: '/app/src/other.tsx' })
    expect(other.extracted[0]!.id).not.toBe(ids[0])
  })

  it('keeps ids past a nested split={false} boundary and a boundary inside a fallback', async () => {
    const code = `${REACT}export const Page = () => <div>
  <Hydrate><section><Hydrate split={false}><b>inline</b></Hydrate></section></Hydrate>
  <Hydrate fallback={<Hydrate><p>in-fallback</p></Hydrate>}><p>outer</p></Hydrate>
  <Hydrate><p>second</p></Hydrate>
</div>
`
    const { client, server } = await both(code)
    const first = idAt(code, '<Hydrate><section>')
    const inFallback = idAt(code, '<Hydrate><p>in-fallback')
    const outer = idAt(code, '<Hydrate fallback')
    const second = idAt(code, '<Hydrate><p>second')
    // (text order: the boundary in the fallback precedes the end of the outer opening tag)
    expect(prefixes(client.code)).toEqual([first, inFallback, outer, second])
    // the server strips the fallback, and the boundary in it
    expect(prefixes(server.code)).toEqual([first, outer, second])
    expect(client.chunks[first]).toContain(
      '<Hydrate split={false}><b>inline</b></Hydrate>',
    )
  })
})

/**
 * A toy start-env planner (runs before hydrate): `serverOnly(f)` keeps `f`
 * on the server and is a stub on the client; `<ClientOnly>` children are
 * erased on the server.
 */
function toyEnvPlanner(): Planner {
  return {
    name: 'start-env',
    tier: 1,
    gate: (t0) => t0.imports.some((i) => i.specifier === 'toy-start'),
    plan(ctx) {
      const { analysis, t1 } = ctx
      for (const imp of analysis.imports) {
        if (imp.specifier !== 'toy-start') {
          continue
        }
        for (const s of imp.specifiers) {
          for (const ref of t1.refs.refsOf(s.local)) {
            const node = t1.nodeAt(ref.range.start)
            const parent = node ? t1.parentOf(node) : null
            if (
              s.imported === 'serverOnly' &&
              parent?.type === 'CallExpression' &&
              ctx.env.type === 'client'
            ) {
              ctx.rewrites.add({
                range: { start: parent.start, end: parent.end },
                body: [{ k: 'text', parts: ['(() => { throw 0 })'] }],
                scope: 'all-outputs',
                by: 'start-env',
              })
            }
            const element = parent ? t1.parentOf(parent) : null
            if (
              s.imported === 'ClientOnly' &&
              ref.ctx === 'jsxOpen' &&
              element?.type === 'JSXElement' &&
              element.closingElement &&
              ctx.env.type === 'server'
            ) {
              ctx.rewrites.add({
                range: {
                  start: element.openingElement.end,
                  end: element.closingElement.start,
                },
                body: [],
                scope: 'all-outputs',
                by: 'start-env',
              })
            }
          }
        }
      }
    },
  }
}

describe('ancestor erasure', () => {
  it('a boundary inside code the client erases yields no chunk, edge, lazy const or rejection there', async () => {
    const code = `${REACT}import { serverOnly } from 'toy-start'
import { useThing } from './hooks'
import { Heavy } from './heavy'
export const panel = serverOnly(() => <Hydrate><Heavy />{useThing()}</Hydrate>)
export const Page = () => <div><Hydrate><p>b</p></Hydrate></div>
`
    const planners = [toyEnvPlanner(), hydrate]
    const { client, server } = await both(code, { planners })
    const removed = idAt(code)
    const later = idAt(code, '<Hydrate', 1)
    expect(client.errors).toEqual([])
    expect(client.extracted).toEqual([
      { id: later, chunk: `${FILE}?tss-hydrate=${later}` },
    ])
    expect(client.code).not.toContain(removed)
    expect(client.code).not.toContain('./heavy')
    expect(client.code).not.toContain('H0')
    expect(client.out.edges.map((e) => e.specifier)).not.toContain('./heavy')
    const dead = await client.host.compile(
      `${FILE}?tss-hydrate=${removed}`,
      planners,
      {
        env: clientEnv,
        config: { configKey: 'cfg', perPlanner: { hydrate: { root: ROOT } } },
      },
    )
    expect(dead!.code).toBe('export {}\n')
    expect(dead!.edges).toEqual([])
    // the later boundary keeps its id on both sides; the server rejects the hook it keeps
    expect(prefixes(client.code)).toEqual([later])
    expect(prefixes(server.code)).toEqual([removed, later])
    expect(server.errors).toEqual([
      { code: 'hydrate-hook', start: code.indexOf('<Hydrate') },
    ])
  })

  it('a boundary inside <ClientOnly> children gets its prefix on the client only', async () => {
    const code = `${REACT}import { ClientOnly } from 'toy-start'
export const Page = () => <div><ClientOnly fallback={<i />}><Hydrate><p>a</p></Hydrate></ClientOnly><Hydrate><p>b</p></Hydrate></div>
`
    const planners = [toyEnvPlanner(), hydrate]
    const { client, server } = await both(code, { planners })
    const a = idAt(code)
    const b = idAt(code, '<Hydrate', 1)
    expect(prefixes(client.code)).toEqual([a, b])
    expect(prefixes(server.code)).toEqual([b])
    expect(server.code).toContain('<ClientOnly fallback={<i />}></ClientOnly>')
  })

  it('a component only an erased handler renders loses its boundary on the client', async () => {
    const code = `${REACT}import { serverOnly } from 'toy-start'
function ServerPanel() { return <Hydrate><p>a</p></Hydrate> }
export const panel = serverOnly(() => <ServerPanel />)
export const Page = () => <Hydrate><p>b</p></Hydrate>
`
    const client = await compile(code, {
      planners: [toyEnvPlanner(), hydrate],
    })
    const later = idAt(code, '<Hydrate', 1)
    expect(client.code).not.toContain('ServerPanel')
    expect(client.code).not.toContain('H0')
    expect(prefixes(client.code)).toEqual([later])
    // nothing loads the orphaned boundary's chunk any more
    expect(client.code).not.toContain(`tss-hydrate=${idAt(code)}`)
  })
})

/**
 * A toy route splitter (runs after hydrate): the inline `component` of
 * `createFileRoute(...)({...})` moves into `?tsr-split=component`.
 */
function toySplitPlanner(): Planner {
  return {
    name: 'route-split',
    tier: 1,
    gate: (t0) =>
      t0.imports.some((i) => i.specifier === '@tanstack/react-router'),
    plan(ctx: PlanContext) {
      const { t1 } = ctx
      for (const ref of t1.refs.all) {
        if (
          ref.ctx !== 'callee' ||
          ctx.symbols.name(ref.sym) !== 'createFileRoute'
        ) {
          continue
        }
        const inner = t1.parentOf(t1.nodeAt(ref.range.start)!)
        const outer = inner ? t1.parentOf(inner) : null
        const options =
          outer?.type === 'CallExpression' ? outer.arguments[0] : undefined
        if (options?.type !== 'ObjectExpression') {
          continue
        }
        for (const p of options.properties) {
          if (
            p.type !== 'Property' ||
            p.key.type !== 'Identifier' ||
            p.key.name !== 'component'
          ) {
            continue
          }
          const value = { start: p.value.start, end: p.value.end }
          const region = ctx.region(value, 'option-value')
          const out = ctx.declareOutput({
            kind: 'split',
            key: 'component',
            derived: { kind: 'split', value: 'component' },
          })
          const split = ctx.names.alloc('TsrSplitComponent')
          const importer = ctx.names.alloc('tsrImportComponent')
          const lazy: SymbolId = ctx.names.alloc('lazyRouteComponent').sym
          ctx.rewrites.addGenerated({
            body: [
              {
                k: 'text',
                parts: ['const ', { sym: importer.sym }, ' = () => import('],
              },
              {
                k: 'spec',
                specifier: './page.tsx?tsr-split=component',
                edgeKey: ctx.edgeKey(
                  './page.tsx?tsr-split=component',
                  'dynamic',
                  'runtime',
                ),
                provenance: { origin: 'runtime' },
                form: 'dynamic',
              },
              { k: 'text', parts: [')\n'] },
            ],
            declares: [importer.sym],
            effectful: false,
            anchor: { k: 'after-header' },
            home: 'auto',
            by: 'route-split',
            imports: [
              {
                names: [{ imported: 'lazyRouteComponent', local: lazy }],
                spec: {
                  k: 'spec',
                  specifier: '@tanstack/react-router',
                  edgeKey: ctx.edgeKey(
                    '@tanstack/react-router',
                    'static',
                    'runtime',
                  ),
                },
              },
            ],
          })
          const owner = ctx.rewrites.addGenerated({
            body: [
              { k: 'text', parts: ['const ', { sym: split.sym }, ' = '] },
              { k: 'slice', range: value },
              {
                k: 'text',
                parts: [`\nexport { ${split.name} as component }\n`],
              },
            ],
            declares: [split.sym],
            effectful: false,
            anchor: { k: 'end' },
            home: out,
            by: 'route-split',
          })
          ctx.rewrites.claim({
            region,
            owner,
            placeholder: [
              {
                k: 'text',
                parts: [
                  { sym: lazy, ctx: 'callee' },
                  '(',
                  { sym: importer.sym },
                  ", 'component')",
                ],
              },
            ],
            by: 'route-split',
          })
        }
      }
    },
  }
}

describe('composition with the route splitter (J2.20)', () => {
  it('homes the lazy const with the split component; the Hydrate chunk imports from the parent', async () => {
    const code = `import { createFileRoute } from '@tanstack/react-router'
${REACT}import { Chart } from './chart'
export const Route = createFileRoute('/')({
  component: () => <div><Hydrate><Chart />{Route.id}</Hydrate></div>,
})
`
    const planners = [hydrate, toySplitPlanner()]
    const client = await compile(code, { planners })
    const id = idAt(code)
    expect(client.code).not.toContain('H0')
    expect(client.code).not.toContain('./chart')
    const options = {
      env: clientEnv,
      config: { configKey: 'cfg', perPlanner: { hydrate: { root: ROOT } } },
    }
    const component = await client.host.compile(
      `${FILE}?tsr-split=component`,
      planners,
      options,
    )
    expect(component!.code).toBe(
      `import { lazyRouteComponent as tsrLazy } from '@tanstack/react-router'
import { Hydrate } from '@tanstack/react-start'
const TsrHydrate0 = /* @__PURE__ */ tsrLazy(() => import('./page.tsx?tss-hydrate=${id}'), 'H0')
const TsrSplitComponent = () => <div><Hydrate h="${id}"><TsrHydrate0/></Hydrate></div>
export { TsrSplitComponent as component }
`,
    )
    const chunk = await client.host.compile(
      `${FILE}?tss-hydrate=${id}`,
      planners,
      options,
    )
    expect(chunk!.code).toBe(
      `import { Route } from './page.tsx'
import { Chart } from './chart'
function TsrHydrate0() { return <><Chart />{Route.id}</> }
export { TsrHydrate0 as H0 }
`,
    )
  })
})

describe('source maps (G6)', () => {
  it('maps the chunk’s tokens, text-only children included, and the parent’s, to the source', async () => {
    const code = `${REACT}export function Page() {
  const fail = () => {
    throw new Error('parent-throw')
  }
  return (
    <main onClick={fail}>
      <Hydrate>
        <button onClick={() => { throw new Error('child-throw') }}>x</button>
      </Hydrate>
      <Hydrate>MARK_TEXT</Hydrate>
    </main>
  )
}
`
    const client = await compile(code, { wantMap: true })
    const [first, second] = client.extracted
    const expectMapped = (
      output: CompileOutput,
      query: { string: string },
      original: number,
    ) => {
      const offsets = tokenOffsets(output.code, query)
      expect(offsets.length).toBeGreaterThan(0)
      for (const offset of offsets) {
        expectMapsTo(output.map as never, positionAt(output.code, offset), {
          file: FILE,
          ...positionAt(code, original),
        })
      }
    }
    expectMapped(
      client.chunkOutputs[first!.id]!,
      { string: 'child-throw' },
      code.indexOf("'child-throw'"),
    )
    expectMapped(
      client.chunkOutputs[second!.id]!,
      { string: 'MARK_TEXT' },
      code.indexOf('MARK_TEXT'),
    )
    expectMapped(
      client.out,
      { string: 'parent-throw' },
      code.indexOf("'parent-throw'"),
    )
  })
})

describe('placement and markup edge cases (J5.2)', () => {
  // A recursive component rendering itself inside its own boundary: the
  // unexported component moves into the chunk with the lazy const only it
  // reads, next to the chunk component. Their names differ (two
  // `TsrHydrate0` declarations were a SyntaxError).
  it('names the lazy const apart from the chunk component when the children reach the component holding the boundary', async () => {
    const code = `${REACT}export const depth = 2
function Tree({ n }) {
  return n > 0 ? <Hydrate><Tree n={n - 1} /></Hydrate> : null
}
`
    const client = await compile(code)
    // (no module output renders the boundary: the chunk is compiled on its own)
    const chunk = (await client.host.compile(
      `${FILE}?tss-hydrate=${idAt(code)}`,
      [hydrate],
      {
        env: clientEnv,
        config: { configKey: 'cfg', perPlanner: { hydrate: { root: ROOT } } },
      },
    ))!.code
    expect(client.code).not.toContain('function Tree')
    expect(chunk).toContain(
      'function Tree({ n }) {\n  return n > 0 ? <Hydrate h="',
    )
    expect(chunk).toContain('<TsrHydrate0$1 n={n}/>')
    expect(chunk).toContain('const TsrHydrate0$1 = /* @__PURE__ */ tsrLazy(')
    expect(chunk).toContain(
      'function TsrHydrate0({ n }) { return (<Tree n={n - 1} />) }',
    )
    expect(chunk.match(/\bTsrHydrate0\b(?!\$)/g)?.length).toBe(2)
  })

  // A mutually recursive pair: the component the children render renders
  // the boundary's component back.
  it('names the lazy const apart when the children reach the component through another declaration', async () => {
    const code = `${REACT}export const depth = 2
function Branch({ n }) { return <Tree n={n - 1} /> }
function Tree({ n }) {
  return n > 0 ? <Hydrate><Branch n={n} /></Hydrate> : null
}
`
    const client = await compile(code)
    // (no module output renders the boundary: the chunk is compiled on its own)
    const chunk = (await client.host.compile(
      `${FILE}?tss-hydrate=${idAt(code)}`,
      [hydrate],
      {
        env: clientEnv,
        config: { configKey: 'cfg', perPlanner: { hydrate: { root: ROOT } } },
      },
    ))!.code
    expect(chunk).toContain('function Tree({ n })')
    expect(chunk).toContain('function Branch({ n })')
    expect(chunk).toContain('const TsrHydrate0$1 = ')
  })

  it('keeps the same name for the lazy const and the chunk component otherwise', async () => {
    const code = `${REACT}export function Page() { return <Hydrate><p>x</p></Hydrate> }
`
    const client = await compile(code)
    expect(client.code).toContain(
      'const TsrHydrate0 = /* @__PURE__ */ tsrLazy(',
    )
    expect(client.code).toContain('<TsrHydrate0/>')
  })

  // The inserted `h`/`p` attributes go right after the last attribute or
  // the tag name, never inside a comment written before `>`.
  it('inserts the hydration attributes before a comment in the opening tag', async () => {
    const code = `${REACT}export function Page() {
  return (
    <Hydrate // deferred
    >
      <p>x</p>
    </Hydrate>
  )
}
`
    const { client, server } = await both(code)
    const [b] = client.extracted
    expect(client.code).toContain(
      `<Hydrate h="${b!.id}" // deferred\n    >\n      <TsrHydrate0/>`,
    )
    expect(server.code).toContain(`<Hydrate h="${b!.id}" // deferred\n    >`)
  })

  it('inserts the hydration attributes after the last attribute when a comment follows it', async () => {
    const code = `${REACT}export function Page() {
  return (
    <Hydrate when={w} /* soon */>
      <p>x</p>
    </Hydrate>
  )
}
`
    const client = await compile(code)
    const [b] = client.extracted
    expect(client.code).toContain(
      `<Hydrate when={w} h="${b!.id}" /* soon */>\n      <TsrHydrate0/>`,
    )
  })

  // React development with route HMR: the chunk component carries the
  // identity marker the route-HMR runtime compares, as split
  // component chunks do, so an update of the chunk is kept, not swapped.
  it('marks the chunk component with its refresh identity when the host asks for markers', async () => {
    const code = `${REACT}export function Page() { return <Hydrate><p>x</p></Hydrate> }
`
    const marked = await compile(code, { config: { refreshMarkers: true } })
    const [b] = marked.extracted
    expect(marked.chunks[b!.id]).toBe(
      `function TsrHydrate0() { return (<p>x</p>) }\nTsrHydrate0.$$tsrRefreshId = ${JSON.stringify(`${b!.chunk} TsrHydrate0`)}\nexport { TsrHydrate0 as H0 }\n`,
    )
    const plain = await compile(code)
    expect(plain.chunks[b!.id]).not.toContain('$$tsrRefreshId')
    const solid = await compile(code.replace(REACT, SOLID), {
      env: clientEnv,
      config: { refreshMarkers: true },
    })
    expect(solid.chunks[b!.id]).not.toContain('$$tsrRefreshId')
  })

  // Solid passes a bare identifier prop by value: a binding `ref={el}`
  // assigns later (or a let the parent reassigns) is read through a getter,
  // so the chunk reads its current value (`props.el?.focus()` saw
  // `undefined` forever).
  it('passes a Solid capture that a ref or a reassignment writes through a getter', async () => {
    const code = `${SOLID}export function Page() {
  let el
  let count = 0
  const bump = () => { count++ }
  const label = 'x'
  return <Hydrate><input ref={el} onClick={() => el?.focus()} />{count}{label}</Hydrate>
}
`
    const client = await compile(code, { env: clientEnv })
    const [b] = client.extracted
    expect(client.code).toContain(
      "<TsrHydrate0 el={(() => el)()} count={(() => count)()} label={label} tsrRef$el={(el$1) => typeof el === 'function' ? el(el$1) : (el = el$1)}/>",
    )
    expect(client.chunks[b!.id]).toContain(
      'return <><input ref={props.tsrRef$el} onClick={() => props.el?.focus()} />{props.count}{props.label}</> }',
    )
  })
})
