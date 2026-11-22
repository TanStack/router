/**
 * Failing regression tests for Critical & High bugs found during review of PR #8817
 * in the Yuku compiler core's `babel-dead-code-elimination` replacement (`orphans.ts`,
 * `placement.ts`, `units.ts`, `reads.ts`, `identity.ts`).
 */
import { describe, expect, it } from 'vitest'
import { MemoryHost, dedent, toyEnvPlanner } from './helpers'

async function compileClient(
  code: string,
  file = '/app/m.ts',
  extraFiles: Record<string, string> = {},
) {
  const host = new MemoryHost({
    files: {
      '/app/db.server.ts': `export const getServerDefault = () => 's'
export const getServerDb = () => ({ query: () => 's' })
export const createServerClient = () => ({ query: () => 's' })
export const getServerKey = () => 'k'
export const getServerObj = () => ({ unused: 1, secret: 's' })
export const getServerVal = () => 1
export const secret = () => 's'
export const db = { query: () => 's' }
`,
      ...extraFiles,
      [file]: dedent(code),
    },
  })
  const result = await host.compile(file, [toyEnvPlanner()])
  return { code: result?.code ?? '' }
}

describe('phase-ordering leaks between orphans.ts and placement.ts', () => {
  it('prunes a module-level destructuring default read only through a top-level server-only helper', async () => {
    const { code } = await compileClient(`
      import { wrapServer } from 'toy-start'
      import { getServerDefault } from './db.server'

      const { clientKey, serverKey = getServerDefault() } = getSharedConfig()
      function serverOnlyHelper() {
        return serverKey
      }

      export const clientValue = clientKey
      export const fn = wrapServer(() => serverOnlyHelper())
    `)
    expect(code).not.toContain('db.server')
    expect(code).not.toContain('getServerDefault')
    expect(code).not.toContain('serverOnlyHelper')
  })

  it('prunes a hoisted var inside a top-level statement read only through a top-level server-only helper', async () => {
    const { code } = await compileClient(`
      import { wrapServer } from 'toy-start'
      import { getServerDb } from './db.server'

      if (typeof globalThis !== 'undefined') {
        var db = getServerDb()
      }
      function serverOnlyHelper() {
        return db.query()
      }

      export const fn = wrapServer(() => serverOnlyHelper())
    `)
    expect(code).not.toContain('db.server')
    expect(code).not.toContain('getServerDb')
    expect(code).not.toContain('serverOnlyHelper')
  })
})

describe('top-level DCE gaps in units.ts / reads.ts / placement.ts', () => {
  it('removes a TSImportEqualsDeclaration used only by erased server code', async () => {
    const { code } = await compileClient(`
      import { wrapServer } from 'toy-start'
      import * as ServerNS from './db.server'
      import db = ServerNS.db

      export const fn = wrapServer(() => db.query())
    `)
    expect(code).not.toContain('db.server')
    expect(code).not.toContain('ServerNS')
  })

  it('propagates type provenance through local type aliases referencing server declarations', async () => {
    const { code } = await compileClient(`
      import { wrapServer } from 'toy-start'
      import { createServerClient } from './db.server'

      const serverClient = createServerClient()
      type Client = typeof serverClient

      export const fn = wrapServer((c: Client) => c)
    `)
    expect(code).not.toContain('db.server')
    expect(code).not.toContain('createServerClient')
    expect(code).not.toContain('serverClient')
  })
})

describe('intra-function DCE leaks in orphans.ts', () => {
  it('prunes a self-recursive local helper referenced only by erased server code', async () => {
    const { code } = await compileClient(`
      import { wrapServer } from 'toy-start'
      import { secret } from './db.server'

      export function makeFetcher() {
        function retry(n: number): string {
          return n <= 0 ? secret() : retry(n - 1)
        }
        return wrapServer(() => retry(3))
      }
    `)
    expect(code).not.toContain('db.server')
    expect(code).not.toContain('function retry')
  })

  it('prunes an overloaded local function referenced only by erased server code', async () => {
    const { code } = await compileClient(`
      import { wrapServer } from 'toy-start'
      import { secret } from './db.server'

      export function Comp() {
        function helper(x: string): string
        function helper(x: any) {
          return secret() + x
        }
        return wrapServer(() => helper('a'))
      }
    `)
    expect(code).not.toContain('db.server')
    expect(code).not.toContain('function helper')
  })

  it('prunes nested destructuring defaults and computed keys whose leaves are all erased', async () => {
    const { code } = await compileClient(`
      import { wrapServer } from 'toy-start'
      import { getServerDefault, getServerKey } from './db.server'

      export function Comp(cfg: any) {
        const { ok, nested: { s1 } = getServerDefault() } = cfg
        const { ok2, [getServerKey()]: { s2 } } = cfg
        const fn = wrapServer(() => [s1, s2])
        return [ok, ok2, fn]
      }
    `)
    expect(code).not.toContain('db.server')
    expect(code).not.toContain('getServerDefault')
    expect(code).not.toContain('getServerKey')
  })

  it('prunes a non-destructured parameter default read only by erased server code', async () => {
    const { code } = await compileClient(`
      import { wrapServer } from 'toy-start'
      import { getServerDb } from './db.server'

      export function Comp(db = getServerDb()) {
        return wrapServer(() => db.query())
      }
    `)
    expect(code).not.toContain('db.server')
    expect(code).not.toContain('getServerDb')
  })

  it('prunes a local let initialized via separate assignment read only by erased server code', async () => {
    const { code } = await compileClient(`
      import { wrapServer } from 'toy-start'
      import { getServerDb } from './db.server'

      export function Comp() {
        let db: any
        db = getServerDb()
        return wrapServer(() => db.query())
      }
    `)
    expect(code).not.toContain('db.server')
    expect(code).not.toContain('getServerDb')
  })

  it('prunes a local destructuring with a pre-existing unused sibling when its only used leaf is erased', async () => {
    const { code } = await compileClient(`
      import { wrapServer } from 'toy-start'
      import { getServerObj } from './db.server'

      export function Comp() {
        const { unused, secret } = getServerObj()
        return wrapServer(() => secret)
      }
    `)
    expect(code).not.toContain('db.server')
    expect(code).not.toContain('getServerObj')
  })

  it('prunes a local enum referenced only by erased server code', async () => {
    const { code } = await compileClient(`
      import { wrapServer } from 'toy-start'
      import { getServerVal } from './db.server'

      export function Comp() {
        enum E {
          A = getServerVal(),
        }
        return wrapServer(() => E.A)
      }
    `)
    expect(code).not.toContain('db.server')
    expect(code).not.toContain('getServerVal')
  })

  it('keeps multi-declarator and destructured exported members of a TS namespace', async () => {
    const { code } = await compileClient(`
      import { wrapServer } from 'toy-start'

      export namespace Config {
        export const a = 1, b = computeB()
        export const { c, d } = makePair()
        export const fn = wrapServer(() => [b, d])
      }
    `)
    expect(code).toContain('computeB()')
    expect(code).toMatch(/\{\s*c\s*,\s*d\s*\}/)
  })
})
