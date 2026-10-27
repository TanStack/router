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
    conditions: ['react-server'],
    routerSplit: false,
  })
  const config: Partial<StartEnvConfig> = {
    providerSeparate: true,
    alwaysDeriveProvider: true,
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
      /export default createServerFn\(\)\.handler\(tsrSsrRpc\(['"][^'"]+['"]\)\)/,
    ],
    [
      'an object property',
      `export const api = { get: createServerFn().handler(() => db.q()) }\n`,
      /get: createServerFn\(\)\.handler\(tsrSsrRpc\(['"][^'"]+['"]\)\)/,
    ],
    [
      'a class static field',
      `export class Api { static get = createServerFn().handler(() => db.q()) }\n`,
      /static get = createServerFn\(\)\.handler\(tsrSsrRpc\(['"][^'"]+['"]\)\)/,
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
      expect(provider).toMatch(/createServerRpc|tsrServerRpc/)
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
        /createServerFn\(\{ method: METHOD \}\)\.middleware\(\[mw\]\)\.handler\(tsrSsrRpc\(['"][^'"]+['"]\)\)/,
      )
      expect(r.code).toContain('tsrSsrRpc } from')
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
      /export const fn = createServerFn\(\)\.handler\(tsrSsrRpc\(['"][^'"]+['"]\)\)/,
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
})

describe('a server fn nested in a function (J4.6): hoisted when it captures nothing', () => {
  const rsc = envInfo({
    name: 'rsc',
    type: 'server',
    isProvider: true,
    conditions: ['react-server'],
    routerSplit: false,
  })
  const rscConfig: Partial<StartEnvConfig> = {
    providerSeparate: true,
    alwaysDeriveProvider: true,
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
        expect(r.code).toContain('tsrClientRpc')
        expect(r.code).not.toContain('db.q(1)')
        expect(r.code).not.toContain('./db.server')
      } else if (env.isProvider) {
        expect(r.code).toContain('tsrSsrRpc')
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
})

// In-place provider (SSR = provider): handlers move to one lazy handler
// module the defining module imports on the first call; what only they read
// moves with them, what the defining module also reads stays and is
// imported back (nothing evaluates twice).
describe('lazy handler module of the in-place provider', () => {
  const FNS = `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'\n`
  const files = {
    '/app/src/db.server.ts': `export const db = { get: (x: unknown) => x }\n`,
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
    // module state the defining module also reads is imported from it, not copied
    expect(h).not.toMatch(/let count/)
    expect(h).toMatch(/import \{[^}]*\bcount\b[^}]*\} from '\.\/module\.tsx'/)
  })

  it('keeps a handler that writes module state the module also reads in place', async () => {
    const r = await compile(
      `${FNS}let count = 0
export const fn = createServerFn().handler(async () => count++)
export function read() { return count }
`,
      { env: ssrEnv },
    )
    expectValid(r.code)
    expect(r.code).toContain('count++')
    expect(r.code).not.toContain('?tss-serverfn-handler')
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
      `import('./module.tsx?vue&type=script&tss-serverfn-handler&lang.ts')`,
    )
    const h = await r.derived(
      `${FILE}?vue&type=script&tss-serverfn-handler&lang.ts`,
    )
    expect(h).toContain('db.get(<number>4)')
  })
})
