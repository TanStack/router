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

void envInfo
