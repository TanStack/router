/**
 * The `start-env` planner (J4, DESIGN §3.10) on the compiler core, through
 * `compileModule` and an in-memory host: what each env serves for a module
 * whose removals leave function-local declarations orphaned, and what the
 * separate provider env (Vite RSC) serves for nested server functions.
 */
import { describe, expect, it } from 'vitest'
import { parseSync } from 'vite'
import { startRecognizer } from '../../src/compiler/recognizer'
import { START_ENV, startEnvPlanner } from '../../src/planners'
import { MemoryHost, clientEnv, envInfo } from './memory-host'
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

describe('function-local declarators only removed code read (J4.12, R17)', () => {
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

describe('a separate provider env with derived provider modules (Vite RSC, R50)', () => {
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
})
