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

const HEAD = `import { createServerOnlyFn, createIsomorphicFn } from '@tanstack/react-start'\n`

describe('function-local declarators only removed code read (J4.12)', () => {
  // Two neighbouring declarators of one statement orphaned by one erasure
  // were two overlapping removal ranges (the compile threw "partially
  // overlaps"); one statement gets one removal edit from its final kept set.
  it('drops two pure declarators of one statement together', async () => {
    const r = await compile(`${HEAD}export function Comp() {
  const a = 1, b = 2
  const run = createServerOnlyFn(() => a + b)
  return run()
}
`)
    expectValid(r.code)
    expect(r.code).not.toMatch(/\bconst a\b|\bb = 2\b/)
    expect(r.code).toContain('const run = () => { throw new Error(')
  })

  it('drops a run of three declarators, and keeps a middle one kept code reads', async () => {
    const three = await compile(`${HEAD}export function Comp() {
  const a = 1, b = 2, c = 3
  const run = createServerOnlyFn(() => a + b + c)
  return run()
}
`)
    expectValid(three.code)
    expect(three.code).not.toMatch(/\ba = 1|b = 2|c = 3\b/)
    const middle = await compile(`${HEAD}export function Comp() {
  const a = 1, b = 2, c = 3
  const run = createServerOnlyFn(() => a + c)
  return run() + b
}
`)
    expectValid(middle.code)
    expect(middle.code).toContain('const b = 2\n')
    expect(middle.code).not.toMatch(/\ba = 1|c = 3\b/)
  })

  it('drops declarators without initialisers (`let a, b`)', async () => {
    const r = await compile(`${HEAD}export function Comp() {
  let a, b
  const run = createServerOnlyFn(() => { a = 1; b = 2 })
  return run()
}
`)
    expectValid(r.code)
    expect(r.code).not.toMatch(/\blet a\b/)
  })

  it('drops a module-level block declaration with every declarator orphaned', async () => {
    const r = await compile(`${HEAD}if (globalThis.flag) {
  const a = 1, b = 2
  createServerOnlyFn(() => a + b)
}
export {}
`)
    expectValid(r.code)
    expect(r.code).not.toMatch(/\bconst a\b/)
  })

  it('keeps impure initialisers of a function (hook calls) as declarators', async () => {
    const r = await compile(`${HEAD}const useX = () => 1, useY = () => 2
export function useThing() {
  const x = useX(), y = useY()
  return createIsomorphicFn().server(() => x + y).client(() => 0)
}
`)
    expectValid(r.code)
    expect(r.code).toContain('const x = useX(), y = useY()')
  })

  // Hook calls are never dropped: the call stays as a statement with the
  // import it reads, even when nothing else reads that import, so the hook
  // order stays equal between the server and the client.
  it('keeps orphaned hook calls and their imports (client)', async () => {
    const r = await compile(`${HEAD}import { useRef, useState } from 'react'
import { secret } from './db.server'
export function Comp() {
  const r = useRef(null)
  const [s] = useState(0)
  const run = createServerOnlyFn(() => secret() + r.current + s)
  return run()
}
`)
    expectValid(r.code)
    expect(r.code).toContain("import { useRef, useState } from 'react'")
    expect(r.code).toContain('  useRef(null);\n  useState(0);\n')
    expect(r.code).not.toContain('./db.server')
    expect(r.code).not.toContain('secret')
  })

  it('keeps an orphaned hook call only <ClientOnly> children read (server)', async () => {
    const r = await compile(
      `import { ClientOnly } from '@tanstack/react-router'
import { useId } from 'react'
import { useChartData, Chart } from './chart'
export function Comp() {
  const id = useId()
  const chart = useChartData()
  return <div id={id}><ClientOnly><Chart data={chart} /></ClientOnly></div>
}
`,
      { env: ssrEnv },
    )
    expectValid(r.code)
    expect(r.code).toContain('const id = useId()\n  useChartData();\n')
    expect(r.code).toContain("import { useChartData } from './chart'")
    expect(r.code).toContain('<ClientOnly/>')
  })

  it('cascades: a declarator read only by an orphaned sibling goes with it', async () => {
    const r = await compile(`${HEAD}export function Comp() {
  const a = 1, b = a + 1, c = 3
  const run = createServerOnlyFn(() => b + c)
  return run()
}
`)
    expectValid(r.code)
    expect(r.code).not.toMatch(/\ba = 1|b = a|c = 3\b/)
  })
})

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
      'a function',
      `export function make() {
  const fn = createServerFn({ method: METHOD }).middleware([mw]).handler(() => db.q())
  return fn
}
`,
    ],
    [
      'a top-level block',
      `export let fn
if (globalThis.flag) {
  fn = createServerFn({ method: METHOD }).middleware([mw]).handler(() => db.q())
}
`,
    ],
    [
      'a class method',
      `export class Api {
  make() {
    return createServerFn({ method: METHOD }).middleware([mw]).handler(() => db.q())
  }
}
`,
    ],
  ])(
    'keeps what a server fn nested in %s reads in the env module',
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

describe('a server fn nested in a function (J4.6): hoisted when it captures nothing', () => {
  const rsc = envInfo({
    name: 'rsc',
    type: 'server',
    isProvider: true,
  })
  const rscConfig: Partial<StartEnvConfig> = {
    providerSeparate: true,
  }
  const files = {
    '/app/src/db.server.ts': 'export const db = { q: (x) => x }\n',
  }
  const envs: Array<[string, EnvInfo, Partial<StartEnvConfig>]> = [
    ['client', clientEnv, {}],
    ['ssr', ssrEnv, {}],
    ['rsc', rsc, rscConfig],
  ]
  const head = `import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { db } from './db.server'
`

  // Every binding of the enclosing function the chain reads (in the
  // handler, the middleware, the validator, the options, the factory
  // arguments) is a positioned compile error naming it, in every env.
  it.each([
    [
      'a parameter',
      `export function make(id: string) {
  const fn = createServerFn().handler(() => db.q(id))
  return fn
}
`,
      'id))',
      'id',
    ],
    [
      'a local const',
      `export function make() {
  const scope = 'x'
  const fn = createServerFn().handler(() => db.q(scope))
  return fn
}
`,
      'scope))',
      'scope',
    ],
    [
      'a hook result',
      `export function Comp() {
  const [count] = useState(0)
  const fn = createServerFn().handler(() => db.q(count))
  return fn
}
`,
      'count))',
      'count',
    ],
    [
      'a local read by the options',
      `export function make(method: 'GET' | 'POST') {
  const fn = createServerFn({ method }).handler(() => db.q(1))
  return fn
}
`,
      'method }',
      'method',
    ],
  ])(
    'refuses a nested server fn capturing %s in every env',
    async (_name, body, at, name) => {
      const code = `${head}${body}`
      for (const [envName, env, config] of envs) {
        const r = await compile(code, { env, config, files })
        const errors = r.out.diagnostics.filter((d) => d.severity === 'error')
        expect(
          errors.map((d) => d.range?.start),
          envName,
        ).toEqual([code.indexOf(at)])
        expect(errors[0]!.message, envName).toContain(`\`${name}\``)
      }
    },
  )

  it('hoists a nested server fn capturing nothing in every env', async () => {
    const code = `${head}export function make() {
  const fn = createServerFn().handler(() => db.q(1))
  return fn
}
`
    for (const [envName, env, config] of envs) {
      const r = await compile(code, { env, config, files })
      expectValid(r.code)
      expect(r.out.diagnostics, envName).toEqual([])
      expect(r.code, envName).toContain('export function make()')
      if (env.type === 'client') {
        expect(r.code).toContain('createClientRpc')
        expect(r.code).not.toContain('db.q(1)')
        expect(r.code).not.toContain('./db.server')
      } else if (env.isProvider) {
        expect(r.code).toContain('createSsrRpc')
        expect(r.code).not.toContain('db.q(1)')
      } else {
        // the in-place provider's handlers live in its handler module
        expect(r.code).not.toContain('db.q(1)')
        expect(await r.derived(`${FILE}?tss-serverfn-handler`)).toContain(
          'db.q(1)',
        )
      }
    }
  })

  // the nested chain goes with the handler stubbed on the client, whichever
  // import binding of the factory each chain is written with (the nested
  // chain's binding is declared first: its site is enumerated first)
  it('registers a server fn nested in a handler on the server envs only', async () => {
    const code = `import { createServerFn as innerFn } from '@tanstack/react-start'
import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
export const outer = createServerFn().handler(async () => {
  const nested = innerFn().handler(() => db.q(1))
  return nested()
})
`
    for (const [envName, env, config] of envs) {
      const r = await compile(code, { env, config, files })
      const facts = r.out.facts.planners[START_ENV] as {
        serverFns: Array<{ name: string }>
      }
      expectValid(r.code)
      expect(r.out.diagnostics, envName).toEqual([])
      expect(
        facts.serverFns.map((f) => f.name),
        envName,
      ).toEqual(env.type === 'client' ? ['outer'] : ['outer', 'nested'])
      if (env.type === 'client') {
        expect(r.code).not.toContain('db.q(1)')
      }
    }
  })
})

// In-place provider (SSR = provider): handlers move to one lazy handler
// module the defining module imports on the first call; what only they read
// moves with them, what the defining module also reads is copied there
// with the statements naming it, as main's provider copy of the module
// (R156).
describe('lazy handler module of the in-place provider', () => {
  const FNS = `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'\n`
  const files = {
    '/app/src/db.server.ts': `export const db = { get: (x: unknown) => x }\nexport const load = (x: unknown) => x\n`,
  }
  const HANDLER_ID = `${FILE}?tss-serverfn-handler`

  it('moves a handler and the imports only it reads', async () => {
    const r = await compile(
      `${FNS}import { db } from './db.server'
let count = 0
export const fn = createServerFn().handler(async () => db.get(count))
export function read() { return count }
`,
      { env: ssrEnv, files },
    )
    expectValid(r.code)
    expect(r.code).not.toContain('./db.server')
    expect(r.code).toContain('?tss-serverfn-handler')
    const h = await r.derived(HANDLER_ID)
    expectValid(h)
    expect(h).toContain(`from './db.server'`)
    // module state the defining module also reads is copied, as in main's
    // provider copy of the file, which imports nothing of it (R156)
    expect(h).toMatch(/let count = 0/)
    expect(h).not.toContain('/app/src/module.tsx')
  })

  // (R156: the handler writes its module's own copy, as the copy's in main's
  // provider; main's second instance)
  it('moves a handler that writes module state the module also reads, with its own copy of it', async () => {
    const r = await compile(
      `${FNS}let count = 0
export const fn = createServerFn().handler(async () => count++)
export function read() { return count }
`,
      { env: ssrEnv },
    )
    expectValid(r.code)
    expect(r.code).not.toContain('count++')
    expect(r.code).toContain('?tss-serverfn-handler')
    const h = await r.derived(HANDLER_ID)
    expectValid(h)
    expect(h).toMatch(/let count = 0/)
    expect(h).toContain('count++')
  })

  it('keeps the handlers of a module that awaits at its top level in place', async () => {
    const r = await compile(
      `${FNS}import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.get(1))
export const first = await Promise.resolve(1)
`,
      { env: ssrEnv, files },
    )
    expectValid(r.code)
    expect(r.code).toContain('./db.server')
    expect(r.code).not.toContain('?tss-serverfn-handler')
  })

  it('moves a handler that is itself a createServerOnlyFn call, rewritten', async () => {
    const r = await compile(
      `${FNS}import { db } from './db.server'
export const fn = createServerFn().handler(createServerOnlyFn(async () => db.get(2)))
`,
      { env: ssrEnv, files },
    )
    expectValid(r.code)
    expect(r.code).not.toContain('createServerOnlyFn(')
    const h = await r.derived(HANDLER_ID)
    expectValid(h)
    expect(h).not.toContain('createServerOnlyFn')
    expect(h).toContain('db.get(2)')
  })

  it('moves the handler of a hoisted nested server fn', async () => {
    const r = await compile(
      `${FNS}import { db } from './db.server'
export function makeFns() {
  const inner = createServerFn().handler(async () => db.get(3))
  return { inner }
}
`,
      { env: ssrEnv, files },
    )
    expectValid(r.code)
    expect(r.code).not.toContain('./db.server')
    expect(r.code).toContain('?tss-serverfn-handler')
    const h = await r.derived(HANDLER_ID)
    expectValid(h)
    expect(h).toContain(`from './db.server'`)
    expect(h).toContain('db.get(3)')
  })

  // the assignment is a statement: it stays in the defining module with the
  // binding it writes and its import, and runs when the module loads (R154);
  // the handler module has its own copy of both, as main's provider copy
  // (R156)
  it('keeps module state and the statement assigning it in the module, and copies both where a hoisted handler reads it', async () => {
    const r = await compile(
      `${FNS}import { load } from './db.server'
let label: unknown = 'initial'
label = load(label)
export function makeFn() {
  return createServerFn().handler(async () => label)
}
`,
      { env: ssrEnv, files },
    )
    expectValid(r.code)
    expect(r.code).toContain(`let label: unknown = 'initial'`)
    expect(r.code.match(/label = load\(label\)/g)).toHaveLength(1)
    expect(r.code).toContain(`import { load } from './db.server'`)
    const h = await r.derived(HANDLER_ID)
    expectValid(h)
    expect(h).toContain(`let label: unknown = 'initial'`)
    expect(h.match(/label = load\(label\)/g)).toHaveLength(1)
    expect(h).not.toContain('/app/src/module.tsx')
  })

  // a const the module keeps is copied into the handler module, as into
  // main's provider copy (R156)
  it('copies a const the module keeps into the handler module', async () => {
    const r = await compile(
      `${FNS}import { db } from './db.server'
const prefix = 'p:'
export const fn = createServerFn().handler(async () => prefix + String(db.get(1)))
export function show(x: string) { return prefix + x }
`,
      { env: ssrEnv, files },
    )
    expectValid(r.code)
    expect(r.code).toContain(`const prefix = 'p:'`)
    const h = await r.derived(HANDLER_ID)
    expectValid(h)
    expect(h).toContain(`const prefix = 'p:'`)
    expect(h).not.toContain('/app/src/module.tsx')
  })

  // A name a top-level statement declares (`if (…) { var conn = … }`) is
  // the one thing the handler module imports from the module (main deletes
  // the declarator and runs the statement once; a copy would run it again).
  // A handler assigning it would assign an import: it stays in place (the
  // `shared-writer` fallback, review-phase1 3.4, probe f1).
  it('keeps a handler in place that assigns a `var` a top-level statement declares', async () => {
    const r = await compile(
      `${FNS}import { load } from './db.server'
if (typeof window === 'undefined') { var conn: unknown = load(1) }
export const f = createServerFn().handler(async () => { conn = null; return 1 })
`,
      { env: ssrEnv, files },
    )
    expectValid(r.code)
    expect(r.code).toContain('conn = null')
    expect(r.code).not.toContain('?tss-serverfn-handler')
  })

  // Z1 (review-phase1 3.2, accepted): such a `var` only a handler reads
  // stays with its statement and the import it reads, at load (R154); the
  // handler module imports it. main deletes the declarator, and its copy
  // loads `./db.server` on the first call; values are equal.
  it('keeps a `var` a top-level statement declares, only a handler reads, with its statement (Z1)', async () => {
    const r = await compile(
      `${FNS}import { load } from './db.server'
if (typeof window === 'undefined') { var conn = load(1) }
export const f = createServerFn().handler(async () => conn)
`,
      { env: ssrEnv, files },
    )
    expectValid(r.code)
    expect(r.code).toContain(`from './db.server'`)
    expect(r.code).toContain('var conn = load(1)')
    const h = await r.derived(HANDLER_ID)
    expectValid(h)
    expect(h).toMatch(
      /import \{[^}]*\bconn\b[^}]*\} from '\/app\/src\/module\.tsx'/,
    )
  })

  it('derives the handler module of an SFC block before its language key', async () => {
    const id = `${FILE}?vue&type=script&lang.ts`
    const r = await compile(
      `${FNS}import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.get(<number>4))
`,
      { env: ssrEnv, files, id },
    )
    expectValid(r.code)
    expect(r.code).toContain(
      `import('${FILE}?vue&type=script&tss-serverfn-handler&lang.ts')`,
    )
    const h = await r.derived(
      `${FILE}?vue&type=script&tss-serverfn-handler&lang.ts`,
    )
    expect(h).toContain('db.get(<number>4)')
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

  it('compiles in place: the client stubs, the provider keeps its handler in the module', async () => {
    const client = await late(clientEnv)
    expect(client.errors).toEqual([])
    expect(client.code).not.toContain('db.x()')
    expectValid(client.code)
    const provider = await late(ssrEnv)
    expect(provider.errors).toEqual([])
    expect(provider.code).toContain('createServerRpc')
    expect(provider.code).toContain('db.x()')
    expect(provider.code).not.toContain('import(')
  })

  it('names a builder the file re-exports and the module to import it from', async () => {
    const reExports = `export { base } from './b'
export * from './c'
export * as d from './c'
`
    const host = new MemoryHost(
      {
        [PAGE]: reExports,
        '/app/src/b.ts': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`,
        '/app/src/c.ts': `import { createMiddleware } from '@tanstack/react-start'
export const open = createMiddleware({ type: 'function' })
`,
      },
      { recognizer: startRecognizer() },
    )
    // (the late pass's planner: it judges the module's exports)
    const out = await host.compile(PAGE, [startEnvPlanner({ late: true })], {
      env: clientEnv,
      config: configOf({ late: true }),
      lang: 'jsx',
      inPlace: true,
    })
    const late =
      'and another plugin compiles this module from a file that is not JavaScript (`.mdx`, `.vue`, `.svelte`, …), so the TanStack Start compiler cannot follow it through this module, and server code attached to it would ship to the client.'
    expect(
      out!.diagnostics.map((d) => ({
        severity: d.severity,
        text: reExports.slice(d.range!.start, d.range!.end),
        message: d.message,
      })),
    ).toEqual([
      {
        severity: 'error',
        text: 'base',
        message: `This module re-exports \`base\`, a TanStack Start builder or factory, from \`./b\`, ${late} Import \`base\` from \`./b\` where you use it, and remove the re-export from this file.`,
      },
      {
        severity: 'error',
        text: "export * from './c'",
        message: `This module re-exports what \`./c\` exports, among it \`open\`, a TanStack Start builder or factory, ${late} Import \`open\` from \`./c\` where you use it, and remove the re-export from this file.`,
      },
      {
        severity: 'error',
        text: "export * as d from './c'",
        message: `This module re-exports what \`./c\` exports, among it \`open\`, a TanStack Start builder or factory, ${late} Import \`open\` from \`./c\` where you use it, and remove the re-export from this file.`,
      },
    ])
  })

  it('refuses a server fn where the provider is a module derived from the file (RSC)', async () => {
    const { errors } = await late(clientEnv, {
      providerSeparate: true,
    })
    expect(errors.map((e) => page.slice(e.range!.start, e.range!.end))).toEqual(
      ['createServerFn()'],
    )
  })
})
