/**
 * The `start-env` planner (J4) on the compiler core, through
 * `compileModule` and an in-memory host: what each env serves for a module
 * whose removals leave function-local declarations orphaned, and what the
 * separate provider env (Vite RSC) serves for nested server functions.
 */
import { describe, expect, it } from 'vitest'
import { parseSync } from 'vite'
import { startRecognizer } from '../../src/compiler/recognizer'
import { START_ENV, startEnvPlanner } from '../../src/planners'
import { MemoryHost, clientEnv, envInfo, ssrEnv } from './memory-host'
import type { StartEnvConfig } from '../../src/planners'
import type { CompileOutput, EnvInfo } from '@tanstack/router-utils/compiler'

const ROOT = '/app'
const FILE = '/app/src/module.tsx'

const planners = [startEnvPlanner()]

function configOf(partial: Partial<StartEnvConfig> = {}) {
  const config: StartEnvConfig = {
    framework: 'react',
    root: ROOT,
    providerSeparate: false,
    idMode: 'dev',
    ...partial,
  }
  return {
    configKey: `cfg-${JSON.stringify(partial)}`,
    perPlanner: { [START_ENV]: config },
  }
}

async function compile(
  code: string,
  opts: {
    env?: EnvInfo
    config?: Partial<StartEnvConfig>
    files?: Record<string, string>
    id?: string
  } = {},
): Promise<{
  out: CompileOutput
  code: string
  host: MemoryHost
  derived: (id: string) => Promise<string>
}> {
  const id = opts.id ?? FILE
  const host = new MemoryHost(
    { [FILE]: code, ...opts.files },
    { recognizer: startRecognizer() },
  )
  const config = configOf(opts.config)
  const env = opts.env ?? clientEnv
  const out = await host.compile(id, planners, { env, config })
  if (!out) {
    throw new Error('the module was not compiled')
  }
  return {
    out,
    code: out.code,
    host,
    derived: async (derivedId) => {
      const d = await host.compile(derivedId, planners, {
        env,
        config,
        code,
      })
      return d?.code ?? ''
    },
  }
}

/** The module parses as TSX (no partial removal left broken syntax). */
function expectValid(code: string): void {
  const { errors } = parseSync('module.tsx', code, { sourceType: 'module' })
  expect(errors.map((e) => e.message)).toEqual([])
}

describe('a separate provider env with derived provider modules (Vite RSC)', () => {
  const rsc = envInfo({
    name: 'rsc',
    type: 'server',
    isProvider: true,
  })
  const config: Partial<StartEnvConfig> = {
    providerSeparate: true,
  }
  const files = {
    '/app/src/db.server.ts': 'export const db = { q: () => 1 }\n',
  }
  const PROVIDER = `${FILE}?tss-serverfn-split`

  // A nested site (export default, an object property, a class field) is
  // hoisted into the provider module; the env module kept importing the
  // hoisted binding from it, which evaluated the provider module (and what
  // its handlers import) in this env and called in-process. Like a
  // top-level site, the env module keeps the chain with its SSR RPC stub.
  it.each([
    [
      'export default',
      `export default createServerFn().handler(() => db.q())\n`,
      /export default createServerFn\(\)\.handler\([\w$]+\(['"][^'"]+['"]\)\)/,
    ],
    [
      'an object property',
      `export const api = { get: createServerFn().handler(() => db.q()) }\n`,
      /get: createServerFn\(\)\.handler\([\w$]+\(['"][^'"]+['"]\)\)/,
    ],
    [
      'a class static field',
      `export class Api { static get = createServerFn().handler(() => db.q()) }\n`,
      /static get = createServerFn\(\)\.handler\([\w$]+\(['"][^'"]+['"]\)\)/,
    ],
  ])(
    'stubs a server fn declared by %s in the env module',
    async (_name, body, stub) => {
      const r = await compile(
        `import { createServerFn } from '@tanstack/react-start'\nimport { db } from './db.server'\n${body}`,
        { env: rsc, config, files },
      )
      expectValid(r.code)
      expect(r.code).toMatch(stub)
      expect(r.code).not.toContain('tss-serverfn-split')
      expect(r.code).not.toContain('db.q()')
      expect(r.code).not.toContain('./db.server')
      const provider = await r.derived(PROVIDER)
      expectValid(provider)
      expect(provider).toContain('db.q()')
      expect(provider).toContain("from './db.server'")
      expect(provider).toContain('createServerRpc')
    },
  )

  // The hoist claims the chain for the provider output; the env module keeps
  // the chain in place with its stub, so everything the chain reads outside
  // the handler (the factory, its options, the middleware) stays with it.
  it.each([
    [
      'an object literal',
      `export const api = {
  fn: createServerFn({ method: METHOD }).middleware([mw]).handler(() => db.q()),
}
`,
    ],
    [
      'an assignment',
      `export let fn
fn = createServerFn({ method: METHOD }).middleware([mw]).handler(() => db.q())
`,
    ],
    [
      'a class static field',
      `export class Api {
  static fn = createServerFn({ method: METHOD }).middleware([mw]).handler(() => db.q())
}
`,
    ],
  ])(
    'keeps what a server fn hoisted from %s reads in the env module',
    async (_name, body) => {
      const code = `import { createServerFn, createMiddleware } from '@tanstack/react-start'
import { db } from './db.server'
const METHOD = 'POST'
const mw = createMiddleware().server(({ next }) => next())
${body}`
      const r = await compile(code, { env: rsc, config, files })
      expectValid(r.code)
      expect(r.out.diagnostics).toEqual([])
      expect(r.code).toContain(
        "import { createServerFn, createMiddleware } from '@tanstack/react-start'",
      )
      expect(r.code).toContain("const METHOD = 'POST'")
      expect(r.code).toContain(
        'const mw = createMiddleware().server(({ next }) => next())',
      )
      expect(r.code).toMatch(
        /createServerFn\(\{ method: METHOD \}\)\.middleware\(\[mw\]\)\.handler\([\w$]+\(['"][^'"]+['"]\)\)/,
      )
      expect(r.code).toMatch(/createSsrRpc as [\w$]+ \} from/)
      expect(r.code).not.toContain('db.q()')
      expect(r.code).not.toContain('./db.server')
      const provider = await r.derived(PROVIDER)
      expectValid(provider)
      expect(provider).toContain('db.q()')
      expect(provider).toContain("from './db.server'")
    },
  )

  // The types allow one argument; with a cast a second one is code of the
  // same call: the stub replaces the whole argument list wherever the
  // handler is replaced (client, SSR caller, env module), and the provider
  // keeps the list as written (coverage review B, F1)
  it.each([
    ['a second argument', `async () => 'first', async () => db.q()`],
    ['a spread and a trailing comma', `async () => 'first', other, ...[db.q],`],
    [
      'an env-only call as the second argument',
      `async () => 'first', createServerOnlyFn(() => db.q())`,
    ],
    [
      'an env-only call as the first argument',
      `createServerOnlyFn(async () => 'first'), () => db.q()`,
    ],
  ])(
    'stubs the whole argument list of a handler called with %s',
    async (_name, args) => {
      const code = `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
const other = 1
export const fn = (createServerFn() as any).handler(${args})
`
      const results = await Promise.all([
        compile(code, { files }),
        compile(code, {
          env: envInfo({ name: 'ssr', type: 'server', isProvider: false }),
          config,
          files,
        }),
        compile(code, { env: rsc, config, files }),
      ])
      for (const r of results) {
        expectValid(r.code)
        expect(r.code).toMatch(/\.handler\([\w$]+\([^()]*\),?\)/)
        expect(r.code).not.toContain('db.q')
        expect(r.code).not.toContain('./db.server')
        expect(r.code).not.toContain("'first'")
      }
      const provider = await results[2].derived(PROVIDER)
      expectValid(provider)
      // (the provider's list, after the wrapper it passes first)
      expect(provider).toMatch(/\.handler\([\w$]+, /)
      expect(provider).toContain("'first'")
      expect(provider).toContain('db.q')
    },
  )

  // A Flight render serialises `<ClientOnly>`'s props for the browser: the
  // env rendering server components keeps the children written in a server
  // fn's handler (coverage review C, finding 1) and erases the others, as
  // `main` (the env only evaluates them, and they may read browser-only
  // code); the env rendering HTML erases them all
  it('keeps <ClientOnly> children in a handler where server components render, erases the rest', async () => {
    const code = `import { ClientOnly } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { Widget } from './widget'
export function Panel() {
  return <div><ClientOnly fallback={<i>fb</i>}><Widget label="panel" /></ClientOnly></div>
}
export const getPanel = createServerFn().handler(async () =>
  renderServerComponent(<div><ClientOnly fallback={<i>fb</i>}><Widget label="handler" /></ClientOnly><Panel /></div>),
)
`
    const widget = {
      '/app/src/widget.tsx': `'use client'\nexport function Widget(props: { label: string }) { return <b>{props.label}</b> }\n`,
    }
    const env = await compile(code, { env: rsc, config, files: widget })
    expectValid(env.code)
    expect(env.code).toContain('<ClientOnly fallback={<i>fb</i>}/>')
    expect(env.code).not.toContain('<Widget label="panel" />')
    const provider = await env.derived(PROVIDER)
    expectValid(provider)
    expect(provider).toContain('<Widget label="handler" />')
    expect(provider).toContain("import { Widget } from './widget'")
    const ssr = await compile(code, {
      env: envInfo({ name: 'ssr', type: 'server', isProvider: false }),
      config,
      files: widget,
    })
    expectValid(ssr.code)
    expect(ssr.code).toContain('<ClientOnly fallback={<i>fb</i>}/>')
    expect(ssr.code).not.toContain('<Widget')
    expect(ssr.code).not.toContain('./widget')
  })

  it('stubs a top-level server fn in the env module (control)', async () => {
    const r = await compile(
      `import { createServerFn } from '@tanstack/react-start'\nimport { db } from './db.server'\nexport const fn = createServerFn().handler(() => db.q())\n`,
      { env: rsc, config, files },
    )
    expect(r.code).toMatch(
      /export const fn = createServerFn\(\)\.handler\([\w$]+\(['"][^'"]+['"]\)\)/,
    )
    expect(r.code).not.toContain('tss-serverfn-split')
  })

  // The provider module copies every declaration its handlers reach; the
  // env module, where the handlers are stubs, keeps nothing only they read,
  // whether or not a later effect keeps the initialiser eager.
  it('drops an initialiser only a handler reads from the env module, before a later effect', async () => {
    const r = await compile(
      `import { createServerFn } from '@tanstack/react-start'
import { connect, register } from './db.server'
const db = connect()
export const fn = createServerFn().handler(() => db.q())
register('fn')
`,
      {
        env: rsc,
        config,
        files: {
          '/app/src/db.server.ts': `export const connect = () => ({ q: () => 1 })
export const register = (name: string) => name
`,
        },
      },
    )
    expectValid(r.code)
    expect(r.code).not.toContain('connect()')
    expect(r.code).toContain("register('fn')")
    const provider = await r.derived(PROVIDER)
    expectValid(provider)
    expect(provider).toContain('const db = connect()')
    expect(provider).toContain('db.q()')
  })

  // A top-level write to a binding only a handler reads is a statement:
  // the env module, where the handler is a stub, keeps it and the binding
  // (as main does); the provider module holds them with its handler.
  it.each([
    ['a method call', `cache.set('warm', 1)`],
    ['an assignment', `cache.warm = 1`],
    ['the server fn stored', `cache.set('warm', fn)`],
  ])(
    'keeps a write to state only a handler reads with %s, in both modules',
    async (_name, write) => {
      const r = await compile(
        `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
const cache = new Map() as any
export const fn = createServerFn().handler(() => cache.get('a') ?? db.q())
${write}
`,
        { env: rsc, config, files },
      )
      expectValid(r.code)
      expect(r.out.diagnostics).toEqual([])
      expect(r.code).toContain('const cache = new Map()')
      expect(r.code).toContain(write)
      expect(r.code).not.toContain('db')
      const provider = await r.derived(PROVIDER)
      expectValid(provider)
      expect(provider).toContain('const cache = new Map()')
      expect(provider).toContain(write)
    },
  )

  // J4.9, J4.10: a handler that is itself an env-only or isomorphic call is
  // compiled for the server in the provider module, as every other env-only
  // or isomorphic call there: the client-only fn throws, the isomorphic one
  // is its server implementation. The env module keeps its SSR RPC stub.
  it.each([
    [
      'a client-only fn',
      `createClientOnlyFn(() => 'MARK_CLIENT_IMPL')`,
      'createClientOnlyFn() functions can only be called on the client!',
      'MARK_CLIENT_IMPL',
    ],
    [
      'an isomorphic fn',
      `createIsomorphicFn().server(() => db.q()).client(() => 'MARK_CLIENT_IMPL')`,
      '() => db.q()',
      'MARK_CLIENT_IMPL',
    ],
  ])(
    'compiles a handler that is %s for the server in the provider module',
    async (_name, handler, provided, client) => {
      const r = await compile(
        `import { createServerFn, createClientOnlyFn, createIsomorphicFn } from '@tanstack/react-start'
import { db } from './db.server'
export const fn = createServerFn().handler(${handler})
`,
        { env: rsc, config, files },
      )
      expectValid(r.code)
      expect(r.code).toMatch(
        /export const fn = createServerFn\(\)\.handler\([\w$]+\(['"][^'"]+['"]\)\)/,
      )
      const provider = await r.derived(PROVIDER)
      expectValid(provider)
      expect(provider).toContain(provided)
      expect(provider).not.toContain(client)
      expect(provider).not.toMatch(
        /createClientOnlyFn\(\(|createIsomorphicFn\(\)\./,
      )
    },
  )

  // J4.10, J4.12: in the env module the chain of a nested server fn stays in
  // place, and an env-only call outside its handler is compiled there: the
  // imports only the client implementation read go, as in the provider.
  it.each([
    [
      'its validator',
      `.validator((d) => createClientOnlyFn(() => clientThing())(d))`,
    ],
    [
      'its middleware',
      `.middleware([{ f: (d) => createClientOnlyFn(() => clientThing())(d) }])`,
    ],
  ])(
    'drops the imports only a client-only fn in %s reads from a nested chain',
    async (_name, link) => {
      const r = await compile(
        `import { createServerFn, createClientOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
import { clientThing } from './client-thing'
export const api = { get: createServerFn()${link}.handler(() => db.q()) }
`,
        {
          env: rsc,
          config,
          files: {
            ...files,
            '/app/src/client-thing.ts': 'export const clientThing = () => 1\n',
          },
        },
      )
      expectValid(r.code)
      expect(r.out.diagnostics).toEqual([])
      expect(r.code).toContain(
        'createClientOnlyFn() functions can only be called on the client!',
      )
      expect(r.code).not.toContain('./client-thing')
      expect(r.code).not.toMatch(/import \{[^}]*createClientOnlyFn/)
      const provider = await r.derived(PROVIDER)
      expectValid(provider)
      expect(provider).not.toContain('./client-thing')
    },
  )

  // spec-phase1 8.2 (RSC, kind B): the three roles of a module whose
  // handlers read state the module keeps. The SSR caller's module and the
  // provider env's module stub the handlers and keep the state other code
  // reads, without the server-only import; the provider copy holds what its
  // handlers reach (its own copy of the state, as main's), with the
  // top-level code reaching that state (R1); an export reading it is not
  // copied (main's copy strips its exports and deletes what only they read).
  const roles = (code: string) =>
    Promise.all([
      compile(code, {
        env: envInfo({ name: 'ssr', type: 'server', isProvider: false }),
        config,
        files,
      }),
      compile(code, { env: rsc, config, files }),
    ])
  it('s1: a cache a handler fills and an export reads, in the three roles', async () => {
    const [caller, providerEnv] =
      await roles(`import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
const cache = new Map<string, number>()
export const save = createServerFn().handler(async () => { cache.set('k', db.q()) })
export function getCached() { return cache.get('k') }
`)
    for (const r of [caller, providerEnv]) {
      expectValid(r.code)
      expect(r.code).not.toContain('./db.server')
      expect(r.code).toContain('const cache = new Map')
      expect(r.code).toContain('function getCached()')
    }
    const copy = await providerEnv.derived(PROVIDER)
    expectValid(copy)
    expect(copy).toContain(`from './db.server'`)
    expect(copy).toContain('const cache = new Map')
    expect(copy).not.toContain('getCached')
  })

  // R1 (review-phase1 3.1) in the provider copy: it copies, with what its
  // handlers reach, the top-level code reaching it through other names, as
  // main's copy of the whole file runs it. Kind A: the copy held the state
  // without that code (gate probes r2, r5, r6, x3 under RSC).
  it.each([
    [
      'a registry filled through a helper',
      `const registry = new Map<string, number>()
function register(k: string, v: number) { registry.set(k, v) }
register('a', 1)
export const f = createServerFn().handler(async () => registry.get('a'))
`,
      ["register('a', 1)", 'function register'],
    ],
    [
      'a class static block',
      `const routes: Array<string> = []
class Boot { static { routes.push('boot') } }
export const f = createServerFn().handler(async () => routes.length)
`,
      ["routes.push('boot')"],
    ],
    [
      'a never-read declaration',
      `const registry = new Map<string, number>()
const _boot = registry.set('a', 1)
export const f = createServerFn().handler(async () => registry.get('a'))
`,
      ["registry.set('a', 1)"],
    ],
    [
      'a default-export expression',
      `let ready = false
export default (ready = true)
export const f = createServerFn().handler(async () => ready)
`,
      ['ready = true'],
    ],
  ])('copies %s into the provider copy (R1)', async (_name, body, expected) => {
    const r = await compile(
      `import { createServerFn } from '@tanstack/react-start'\n${body}`,
      { env: rsc, config, files },
    )
    const copy = await r.derived(PROVIDER)
    expectValid(copy)
    for (const text of expected) {
      expect(copy).toContain(text)
    }
  })

  it('l1: a function only the handler calls, assigning a kept `let`, in the three roles', async () => {
    const [caller, providerEnv] =
      await roles(`import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
let cache: Map<string, number> | null = null
function clear() { cache = null }
export function getCache() { return (cache ??= new Map()) }
export const reset = createServerFn().handler(async () => { clear(); return db.q() })
`)
    for (const r of [caller, providerEnv]) {
      expectValid(r.code)
      expect(r.code).not.toContain('./db.server')
      expect(r.code).toContain('function getCache()')
    }
    const copy = await providerEnv.derived(PROVIDER)
    expectValid(copy)
    expect(copy).toContain(`from './db.server'`)
    expect(copy).toContain('function clear()')
    // kind A (R155 phase 1): `clear` leaves the modules where the handler is
    // a stub; the copy holds what its handlers reach and the code reaching
    // it (R1), not `getCache`, which only an export reads (main's copy
    // deletes it)
    for (const r of [caller, providerEnv]) {
      expect(r.code).not.toContain('function clear()')
    }
    expect(copy).not.toContain('getCache')
  })
})

// A refused server fn names its real position (R162; F4, review-phase3):
// an `if` or a loop holds its body in a block, the message names the `if` or
// the loop; a function around it is the reason, whatever is inside it
describe('a refused server fn: the message names its position', () => {
  const head = `import { createServerFn } from '@tanstack/react-start'
export const api: Record<string, unknown> = {}
const flag = Math.random() >= 0
`
  const fn = `createServerFn().handler(async () => 1)`
  const envs: Array<[string, EnvInfo]> = [
    ['client', clientEnv],
    ['ssr', ssrEnv],
  ]

  // F6: decorators are evaluated once, with the class: the hoisted `const`
  // goes above the class
  it('hoists a decorator argument above its class', async () => {
    const code = `${head}const dec = (_f: unknown) => (c: unknown) => c
@dec(${fn})
export class Decorated {}
`
    for (const [envName, env] of envs) {
      const r = await compile(code, { env })
      expect(
        r.out.diagnostics.filter((d) => d.severity === 'error'),
        envName,
      ).toEqual([])
      expectValid(r.code)
      expect(r.code.indexOf('@dec('), envName).toBeGreaterThan(-1)
    }
  })
})

describe('the JavaScript another plugin compiled from a file that is no JavaScript (late)', () => {
  const PAGE = '/app/src/page.mdx'
  const page = `import { createServerFn, createIsomorphicFn } from '@tanstack/react-start'
import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.x())
export const iso = createIsomorphicFn().server(() => db.x()).client(() => 'client')
`
  async function late(env: EnvInfo, partial: Partial<StartEnvConfig> = {}) {
    const host = new MemoryHost(
      {
        [PAGE]: page,
        '/app/src/db.server.ts': `export const db = { x: () => 'secret' }\n`,
      },
      { recognizer: startRecognizer() },
    )
    const out = await host.compile(PAGE, planners, {
      env,
      config: configOf({ late: true, ...partial }),
      lang: 'jsx',
      inPlace: true,
    })
    return {
      code: out!.code,
      errors: out!.diagnostics.filter((d) => d.severity === 'error'),
    }
  }

  it('refuses a server fn where the provider is a module derived from the file (RSC)', async () => {
    const { errors } = await late(clientEnv, {
      providerSeparate: true,
    })
    expect(errors.map((e) => page.slice(e.range!.start, e.range!.end))).toEqual(
      ['createServerFn()'],
    )
  })
})
