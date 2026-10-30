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

  // the key stays out of the rest element; the default, evaluated only
  // when the key is missing, goes with what only it reads
  it('drops the default of a sibling kept while kept code reads the rest element', async () => {
    expect(
      await client(`
        import { wrapServer } from 'toy-start'
        import { secret } from './db'
        const { picked = secret(), ...others } = source
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

  it('keeps an exported binding (importers of the module read it)', async () => {
    expect(
      await client(`
        import { wrapServer } from 'toy-start'
        export const { picked, kept } = source
        export const fn = wrapServer(() => picked)
      `),
    ).toBe(
      dedent(`
        export const { picked, kept } = source
        export const fn = tsrStub()
      `),
    )
  })

  // The initialiser stays as written: the elements keep their order and
  // effects, so `kept` gets the value the source gives it.
  it('leaves the array literal an array pattern with a removed element destructures', async () => {
    expect(
      await client(`
        import { wrapServer } from 'toy-start'
        const [picked, kept] = [next(), next()]
        export const k = kept
        export const fn = wrapServer(() => picked)
      `),
    ).toBe(
      dedent(`
        const [, kept] = [next(), next()]
        export const k = kept
        export const fn = tsrStub()
      `),
    )
  })

  it('leaves the object literal an object pattern with a removed property destructures', async () => {
    expect(
      await client(`
        import { wrapServer } from 'toy-start'
        const { picked, kept } = { picked: next(), kept: next() }
        export const k = kept
        export const fn = wrapServer(() => picked)
      `),
    ).toBe(
      dedent(`
        const { kept } = { picked: next(), kept: next() }
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
  it.each([
    ['a trailing comma', '{ a, b, }: Props', '{ }: Props'],
    ['no trailing comma', '{ a, b }: Props', '{ }: Props'],
    ['defaults', "{ a = 'x', b = 'y', }: Props", '{ }: Props'],
    ['a rest element alone', '{ ...a }: Props', '{ }: Props'],
    ['a nested pattern', '{ p: { a, b, }, }: Props', '{ p: { }, }: Props'],
    ['an array pattern', '[a, b,]: Props', '[, ,]: Props'],
  ])(
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

  it('removes a run up to the next kept property, or from the previous one', async () => {
    expect(
      await client(`
        import { wrapServer } from 'toy-start'
        export function f({ a, b, c, }: Props, { d, e, f: g }: Props) {
          return [a, wrapServer(() => [b, c, d, e]), g]
        }
      `),
    ).toBe(
      'export function f({ a, }: Props, { f: g }: Props) {\n  return [a, tsrStub(), g]\n}\n',
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

  // (a statement after a rendered `;` needs no `;` of its own)
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
          (function () { return g() }());
          [g()];
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

describe('function-local declarations only erased code read', () => {
  it('drops a pure function and class declaration, keeps a class whose evaluation has effects', async () => {
    expect(
      await client(`
        import { wrapServer } from 'toy-start'
        export function Comp() {
          function helper() {
            return 1
          }
          class Pure {}
          class Impure extends make() {}
          const fn = wrapServer(() => helper() + new Pure() + new Impure())
          return fn
        }
      `),
    ).toBe(
      // the removed declarations' indentation stays (whitespace is free)
      'export function Comp() {\n      class Impure extends make() {}\n  const fn = tsrStub()\n  return fn\n}\n',
    )
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

  it('drops a statement whose every declarator is orphaned, with its line', async () => {
    expect(
      await client(`
        import { wrapServer } from 'toy-start'
        export function Comp() {
          const a = 1, b = 2
          const fn = wrapServer(() => [a, b])
          return fn
        }
      `),
    ).toBe(
      // the removed statement's indentation stays (whitespace is free)
      'export function Comp() {\n    const fn = tsrStub()\n  return fn\n}\n',
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

  it('keeps the effects of an impure declarator pruned from a multi-declarator statement', async () => {
    expect(
      await client(`
        import { wrapServer } from 'toy-start'
        export function Comp() {
          const a = useThing(), b = 2
          const fn = wrapServer(() => [a])
          return [fn, b]
        }
      `),
    ).toBe(
      dedent(`
        export function Comp() {
          const a = useThing(), b = 2
          const fn = tsrStub()
          return [fn, b]
        }
      `),
    )
  })
})
