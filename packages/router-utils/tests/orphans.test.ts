import { describe, expect, it } from 'vitest'
import { cleanOrphanedDeclarations } from '../src/compiler'
import { MemoryHost, dedent, toyEnvPlanner } from './helpers'
import type { Planner } from '../src/compiler'

/** The toy env planner (client: `wrapServer(arg)` → `tsrStub()`), cleaning up after its erasures. */
function erasingPlanner(): Planner {
  const env = toyEnvPlanner()
  return {
    ...env,
    plan(ctx) {
      env.plan(ctx)
      cleanOrphanedDeclarations(ctx, 'all-outputs', env.name)
    },
  }
}

async function client(code: string) {
  const host = new MemoryHost({
    files: {
      '/app/m.ts': dedent(code),
      '/app/db.ts': `export const secret = () => 's'\n`,
    },
  })
  return (await host.compile('/app/m.ts', [erasingPlanner()]))!.code
}

describe('destructured bindings only erased code read', () => {
  it('drops an object rest element, then the sibling it kept', async () => {
    expect(
      await client(`
        import { wrapServer } from 'toy-start'
        import { secret } from './db'
        const { picked = secret(), kept, ...others } = source
        export const k = kept
        export const fn = wrapServer(() => [picked, others])
      `),
    ).toBe(
      dedent(`
        const { kept } = source
        export const k = kept
        export const fn = tsrStub()
      `),
    )
  })

  it('keeps a sibling while kept code reads the rest element', async () => {
    expect(
      await client(`
        import { wrapServer } from 'toy-start'
        const { picked, ...others } = source
        export const o = others
        export const fn = wrapServer(() => picked)
      `),
    ).toBe(
      dedent(`
        const { picked, ...others } = source
        export const o = others
        export const fn = tsrStub()
      `),
    )
  })

  it('leaves a hole for an array element, also the last one', async () => {
    expect(
      await client(`
        import { wrapServer } from 'toy-start'
        const [first, kept, last] = source
        export const k = kept
        export const fn = wrapServer(() => [first, last])
      `),
    ).toBe(
      dedent(`
        const [, kept, ,] = source
        export const k = kept
        export const fn = tsrStub()
      `),
    )
  })

  it('keeps an array rest element (it exhausts the iterator)', async () => {
    expect(
      await client(`
        import { wrapServer } from 'toy-start'
        const [kept, ...rest] = source
        export const k = kept
        export const fn = wrapServer(() => rest)
      `),
    ).toBe(
      dedent(`
        const [kept, ...rest] = source
        export const k = kept
        export const fn = tsrStub()
      `),
    )
  })
})

describe('function-local declarators only erased code read', () => {
  it('removes a pattern whose every binding is orphaned, with the import it read', async () => {
    expect(
      await client(`
        import { wrapServer } from 'toy-start'
        import { secret } from './db'
        export function f() {
          const { a, b: [c], ...d } = secret
          return wrapServer(() => [a, c, d])
        }
      `),
    ).toBe(
      // the removed statement's indentation stays (whitespace is free)
      'export function f() {\n    return tsrStub()\n}\n',
    )
  })

  it('keeps an impure initialiser as a statement that parses and stands alone', async () => {
    expect(
      await client(`
        import { wrapServer } from 'toy-start'
        export function f() {
          before()
          const a = { x: g() }
          const b = function () { return g() }()
          const c = [g()]
          const d = g()
          return wrapServer(() => [a, b, c, d])
        }
      `),
    ).toBe(
      dedent(`
        export function f() {
          before()
          ;({ x: g() });
          ;(function () { return g() }());
          ;[g()];
          g();
          return tsrStub()
        }
      `),
    )
  })
})

describe('function-level call initialisers (hook calls)', () => {
  // A plain call reading only imports nothing else reads is server-only
  // code: it leaves with its import (J4.12).
  it('drops a server call whose imports only it reads, with the import', async () => {
    expect(
      await client(`
        import { wrapServer } from 'toy-start'
        import { connect } from './db'
        export function f() {
          const conn = connect()
          return wrapServer(() => conn)
        }
      `),
    ).toBe('export function f() {\n    return tsrStub()\n}\n')
  })

  // A hook call must keep running (hook order is the same on both sides)
  // even when the import it reads has no other live reference: the call
  // and its import stay.
  it('keeps an orphaned hook call and the import it reads', async () => {
    expect(
      await client(`
        import { wrapServer } from 'toy-start'
        import { useRef, useState } from 'react'
        import { secret } from './db'
        export function Comp() {
          const r = useRef(null)
          const [s] = useState(0)
          const run = wrapServer(() => secret() + r.current + s)
          return run()
        }
      `),
    ).toBe(
      dedent(`
        import { useRef, useState } from 'react'
        export function Comp() {
          useRef(null);
          useState(0);
          const run = tsrStub()
          return run()
        }
      `),
    )
  })
})
