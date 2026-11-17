/**
 * The `<Hydrate>` planner (J5) on the compiler core, through
 * `compileModule` and an in-memory host: what each env serves for a module
 * and for its `?tss-hydrate=<id>` chunks.
 */
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { invalidate } from '@tanstack/router-utils/compiler'
import {
  ROUTER_PLANNER,
  routerPlanner,
  routerPlannerConfigFrom,
} from '@tanstack/router-plugin/planners'
import { startRecognizer } from '../../src/compiler/recognizer'
import { createHydratePlanner } from '../../src/planners/hydrate'
import { START_ENV, startPlanners } from '../../src/planners'
import {
  MemoryHost,
  clientEnv,
  envInfo,
  ssrEnv,
  takeStale,
} from './memory-host'
import type {
  CompileConfig,
  CompileOutput,
  EnvInfo,
  Planner,
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
    /**
     * Start's planners (`startPlanners`, the Start recognizer); `'route'`
     * also the router planner, with the file a route file of the registry.
     */
    start?: true | 'route'
  } = {},
): Promise<Compiled> {
  const id = opts.id ?? FILE
  const path = id.split('?')[0]!
  const env = opts.env ?? clientEnv
  const route = opts.start === 'route'
  const host = new MemoryHost(
    { [path]: code, ...opts.files },
    opts.start
      ? {
          recognizer: startRecognizer(),
          routes: route
            ? {
                lookup: (p) =>
                  p === path
                    ? { routeId: '/', kind: 'file', routerConstructor: true }
                    : null,
                digestFor: (p) => (p === path ? 'route' : null),
              }
            : undefined,
        }
      : {},
  )
  const planners =
    opts.planners ??
    (opts.start
      ? startPlanners({ hydrate, router: route ? routerPlanner() : null })
      : [hydrate])
  const config: CompileConfig = {
    configKey: 'cfg',
    perPlanner: {
      hydrate: { root: ROOT, ...opts.config },
      ...(opts.start && {
        [START_ENV]: {
          framework: 'react',
          root: ROOT,
          providerSeparate: false,
          idMode: 'default',
        },
      }),
      ...(route && {
        [ROUTER_PLANNER]: routerPlannerConfigFrom(undefined, {
          framework: 'react',
          envType: env.type === 'client' ? 'client' : 'server',
          mode: env.mode === 'dev' ? 'dev' : 'build',
          hmrStyle: 'vite',
          start: true,
        }),
      }),
    },
  }
  const out = await host.compile(id, planners, {
    env,
    config,
    wantMap: opts.wantMap,
  })
  if (!out) {
    throw new Error('the module was not compiled')
  }
  // the chunks the output imports, directly or through the module's other
  // outputs (a boundary in a component a shared module holds)
  const extracted: Compiled['extracted'] = []
  const chunks: Record<string, string> = {}
  const chunkOutputs: Record<string, CompileOutput> = {}
  const seen = new Set<string>()
  const ownOutput = `${path}?`
  const visit = async (output: CompileOutput): Promise<void> => {
    for (const e of host.edgesOf(output, env)) {
      if (!e.specifier.startsWith(ownOutput) || seen.has(e.specifier)) {
        continue
      }
      seen.add(e.specifier)
      const derived = e.specifier
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
  // (an id's ordinal counts the candidate elements before it: `idAt`)
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
  // A dev edit of the barrel reaches its importers: the summaries the
  // prefetch read are dependencies of the plan, both ways.
  it('an edit of an app module that starts or stops re-exporting the Start Hydrate recompiles its importers', async () => {
    const code = `import { Hydrate } from './ui'
export const Page = () => <Hydrate><p>child</p></Hydrate>
`
    const UI = '/app/src/ui.tsx'
    const local = `export const Hydrate = (props) => props.children\n`
    const host = new MemoryHost(
      { [FILE]: code, [UI]: local },
      { recognizer: startRecognizer() },
    )
    const config = { configKey: 'c', perPlanner: { hydrate: { root: ROOT } } }
    const boundaries = async () =>
      prefixes(
        (await host.compile(FILE, [hydrate], { env: clientEnv, config }))
          ?.code ?? code,
      )
    expect(await boundaries()).toEqual([])
    for (const [text, expected] of [
      [`export { Hydrate } from '@tanstack/react-start'\n`, [idAt(code)]],
      [local, []],
    ] as const) {
      host.files[UI] = text
      takeStale(host.caches)
      await invalidate(host.caches, { path: UI, kind: 'change' }, host)
      expect(takeStale(host.caches)).toContain(FILE)
      expect(await boundaries()).toEqual(expected)
    }
  })
})

describe('Solid (J5.2)', () => {
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
})

describe('module-level code the children use', () => {
  // H2 (b), H4: a name a top-level statement declares cannot be copied; the
  // chunk imports it, so children assigning it are reported (a4)
  it('rejects children that assign a var a top-level statement declares', async () => {
    const code = `${REACT}import { detect } from './detect'
if (typeof window !== 'undefined') { var flag = detect() }
export const Page = () => <Hydrate><button onClick={() => { flag = 1 }}>{String(flag)}</button></Hydrate>
`
    for (const env of [clientEnv, buildClientEnv]) {
      const client = await compile(code, { env })
      expect(client.errors).toEqual([
        { code: 'hydrate-module-write', start: code.indexOf('<Hydrate') },
      ])
      expect(client.chunks).toEqual({})
    }
  })
})

describe('rejections (J5.5)', () => {
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
              ctx.rewrites.edit({
                range: { start: parent.start, end: parent.end },
                body: [{ k: 'text', parts: ['(() => { throw 0 })'] }],
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
              ctx.rewrites.edit({
                range: {
                  start: element.openingElement.end,
                  end: element.closingElement.start,
                },
                body: [],
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
    expect(
      client.host.edgesOf(client.out).map((e) => e.specifier),
    ).not.toContain('./heavy')
    const dead = await client.host.compile(
      `${FILE}?tss-hydrate=${removed}`,
      planners,
      {
        env: clientEnv,
        config: { configKey: 'cfg', perPlanner: { hydrate: { root: ROOT } } },
      },
    )
    expect(dead!.code).toBe('export {}\n')
    expect(client.host.edgesOf(dead!)).toEqual([])
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

  // spec-phase2-hydrate 3.1 (L1, L4): a function only an erased handler
  // calls, which assigns state a kept function reads, goes with its import
  // (the removal rule), from the file and from the chunk
  it.each([
    [
      'an export reads the state',
      'export function getCache() { return (cache ??= new Map()) }\nexport function Page() { return <Hydrate><Chart /></Hydrate> }',
    ],
    [
      'the children read the state',
      'function getCache() { return (cache ??= new Map()) }\nexport function Page() { return <Hydrate><Chart c={getCache()} /></Hydrate> }',
    ],
  ])(
    'the client keeps nothing only an erased handler reaches, in the module or the chunk (%s)',
    async (_, rest) => {
      const code = `import { createServerFn } from '@tanstack/react-start'
${REACT}import { db } from './db.server'
import { Chart } from './chart'
let cache: Map<string, number> | null = null
function clear() { cache = null; return db.ok('SECRET') }
export const reset = createServerFn().handler(async () => clear())
${rest}
`
      for (const env of [clientEnv, buildClientEnv]) {
        const client = await compile(code, { env, start: true })
        expect(client.errors).toEqual([])
        expect(client.extracted).toHaveLength(1)
        for (const out of [client.code, ...Object.values(client.chunks)]) {
          expect(out).not.toContain('db.server')
          expect(out).not.toContain('function clear')
          expect(out).not.toContain('SECRET')
        }
      }
    },
  )

  // A boundary inside a route option the router planner erases on the
  // client (`server`, `headers`), after the Hydrate planner made its chunk:
  // the chunk component is unused (review-phase2-stops 1, k1 and k2). The
  // route builds, as on main: no chunk, nothing of the option.
  it.each([
    [
      'server',
      '',
      `server: { handlers: { GET: async () => new Response(render(<Hydrate><Heavy /></Hydrate>)) } },`,
    ],
    [
      'headers',
      `const title = 'SECRET'\nfunction Mail() { return <h1>{title}</h1> }\n`,
      `headers: () => ({ 'x-preview': render(<Hydrate><Mail /><Heavy /></Hydrate>) }),`,
    ],
  ])(
    'a route file: a boundary inside the %s option the client deletes yields no chunk',
    async (_, decls, option) => {
      const code = `import { createFileRoute } from '@tanstack/react-router'
${REACT}import { Heavy } from './heavy.server'
import { render } from './render.server'
${decls}function Page() { return <p>page</p> }
export const Route = createFileRoute('/')({
  ${option}
  component: Page,
})
`
      const client = await compile(code, {
        env: buildClientEnv,
        start: 'route',
      })
      expect(client.errors).toEqual([])
      expect(client.extracted).toEqual([])
      expect(client.code).not.toContain('heavy.server')
      expect(client.code).not.toContain('render.server')
      expect(client.code).not.toContain('tss-hydrate')
      expect(client.code).not.toContain('SECRET')
    },
  )
})

// A boundary inside a top-level statement (a member assignment, a call
// argument): the chunk holds the children, the file keeps the statement
// once, and the compiler's self-checks pass (spec-phase3 4.3 V1: the
// chunk's wrapper text, mapped to the boundary, is the generated unit's own,
// not the statement's). Source: the Hydrate gate's probes f_b01, f_b04, f_a03.
describe('a boundary inside a top-level statement', () => {
  const files = {
    '/app/src/chart.tsx': 'export const Chart = (p: { t: string }) => p.t\n',
    '/app/src/register.ts':
      'export const register = (..._: Array<unknown>) => {}\n',
  }
  const head = `${REACT}import { Chart } from './chart'
const tone = 'x'
function Heavy() { return <Chart t={tone} /> }
`
  it.each([
    {
      name: 'a member assignment',
      code: `${head}function Tabs() { return <div /> }
Tabs.Panel = function Panel() { return <Hydrate when="visible"><Heavy /></Hydrate> }
export { Tabs }
`,
      statement: 'Tabs.Panel = function Panel()',
    },
    {
      name: 'a call argument',
      code: `${head}import { register } from './register'
register('panel', () => <Hydrate when="visible"><Heavy /></Hydrate>)
`,
      statement: "register('panel',",
    },
    {
      name: 'a member assignment next to a default export',
      code: `import { memo } from 'react'
${head}function Tabs() { return <div /> }
Tabs.Panel = function Panel() { return <Hydrate when="visible"><Heavy /></Hydrate> }
export default memo(() => <Hydrate when="idle"><Heavy /></Hydrate>)
export { Tabs }
`,
      statement: 'Tabs.Panel = function Panel()',
    },
  ])('compiles in $name', async ({ code, statement }) => {
    const r = await compile(code, { env: buildClientEnv, files })
    expect(r.errors).toEqual([])
    expect(r.code.split(statement)).toHaveLength(2)
    expect(r.extracted.length).toBeGreaterThan(0)
    for (const { id } of r.extracted) {
      expect(r.chunks[id]).toContain('<Heavy')
    }
  })
})
