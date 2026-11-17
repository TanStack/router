/**
 * Kept (R169 gate, 2026-11-17): the sole coverage of what an erasure inside a
 * function leaves (Start's server-fn erasure: function-local declarations,
 * declarators of one statement, a loop head, parameter patterns, an array
 * rest element), which no oracle test reaches yet; to become
 * start-plugin-core behaviour tests.
 */
import { describe, expect, it } from 'vitest'
import { MemoryHost, dedent, toyEnvPlanner } from './helpers'

// The core cleans up after every planner's erasures (the toy env planner:
// client `wrapServer(arg)` → `tsrStub()`, in every output).
async function client(code: string) {
  const host = new MemoryHost({
    files: {
      '/app/m.ts': dedent(code),
      '/app/db.ts': `export const secret = () => 's'\n`,
    },
  })
  return (await host.compile('/app/m.ts', [toyEnvPlanner()]))!.code
}

describe('destructured bindings only erased code read', () => {
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

describe('parameter patterns only erased code read', () => {
  // Source: real app tanstack.com (`({ onNavigate, tabIndex, }: Props)` with
  // `<ClientOnly>` children on the server): a pattern losing every property
  // keeps its braces and its type annotation, trailing comma and all.
  it.each([['defaults', "{ a = 'x', b = 'y', }: Props", '{ }: Props']])(
    'empties a pattern with %s, keeping its annotation',
    async (_, pattern, after) => {
      const names = pattern.includes('...') ? 'a' : 'a, b'
      expect(
        await client(`
          import { wrapServer } from 'toy-start'
          export function f(${pattern}) {
            return wrapServer(() => [${names}])
          }
        `),
      ).toBe(`export function f(${after}) {\n  return tsrStub()\n}\n`)
    },
  )
})

describe('function-local declarations only erased code read', () => {
  // a class goes like any declaration: what its evaluation does is no
  // question (review-kept-analyses 3.1), and so does the import only it read
  it('drops a function and class declarations only erased code reads, whatever their evaluation does', async () => {
    const out = await client(`
      import { wrapServer } from 'toy-start'
      import { secret } from './db.server'
      export function Comp() {
        function helper() {
          return 1
        }
        class Pure {}
        class Impure extends make() {}
        class WithStatic { static x = secret() }
        const fn = wrapServer(
          () => helper() + new Pure() + new Impure() + new WithStatic(),
        )
        return fn
      }
    `)
    expect(out).not.toMatch(/function helper|class /)
    expect(out).not.toContain('db.server')
    expect(out).toContain('const fn = tsrStub(')
  })

  it('prunes the orphaned declarators of one statement as runs, keeping the rest', async () => {
    expect(
      await client(`
        import { wrapServer } from 'toy-start'
        export function Comp() {
          const a = 1, b = 2, c = 3
          const d = 4, e = 5
          const fn = wrapServer(() => [a, b, e])
          return [fn, c, d]
        }
      `),
    ).toBe(
      dedent(`
        export function Comp() {
          const c = 3
          const d = 4
          const fn = tsrStub()
          return [fn, c, d]
        }
      `),
    )
  })

  it('keeps the last declarator of a loop head so the syntax stays', async () => {
    expect(
      await client(`
        import { wrapServer } from 'toy-start'
        export function Comp() {
          for (let i = 0, j = 0; ; ) {
            wrapServer(() => [i, j])
            break
          }
        }
      `),
    ).toBe(
      dedent(`
        export function Comp() {
          for (let j = 0; ; ) {
            tsrStub()
            break
          }
        }
      `),
    )
  })
})
