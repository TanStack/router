/**
 * Env-only fns whose replacement lands in a grammar slot with rules of its
 * own, in real builds whose output runs: a namespace body's statement list,
 * a decorated class at statement start, a classic `for` initialiser. The
 * source's values are the expectation. Split from
 * start-build-top-level-env-calls.test.ts (per-file budget).
 */
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../build-harness'
import { nestedUnderWrappers } from '../compiler-inputs'

const timeout = 60_000

describe.each(startBundlers)('%s build', (bundler) => {
  // a replacement starting with `(` at the start of a statement of a
  // namespace body, after a statement without `;`: it starts a statement of
  // its own, as in a function's body. Source: Astra review 5 (core B1)
  test(
    'an env-only fn called or written as a statement of a namespace body: each statement runs on its own',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        entry: { client: 'client.ts', ssr: 'ssr.ts' },
        files: {
          // the other environment's replacement, in both builds
          'src/both.ts': `import { createClientOnlyFn, createServerOnlyFn } from '@tanstack/react-start'
export namespace Setup {
  export const events: Array<number> = []
  const box = { run: () => events.push(0) }
  events.push(1)
  createServerOnlyFn(box.run)
  events.push(2)
  createClientOnlyFn(box.run)
  events.push(3)
}
`,
          // the implementation kept and called in place, in the server build
          'src/server-calls.ts': `import { createServerOnlyFn } from '@tanstack/react-start'
export namespace Setup {
  export const events: Array<number> = []
  const box = { run: () => events.push(2) }
  events.push(1)
  createServerOnlyFn(box.run)()
  events.push(3)
  createServerOnlyFn(function () { events.push(4) })()
}
`,
          'client.ts': `export { Setup as both } from './src/both'
`,
          'ssr.ts': `export { Setup as both } from './src/both'
export { Setup as server } from './src/server-calls'
`,
        },
      })
      expect((await client.run(`return entry.both.events`)).result).toEqual([
        1, 2, 3,
      ])
      expect(
        (await ssr.run(`return [entry.both.events, entry.server.events]`))
          .result,
      ).toEqual([
        [1, 2, 3],
        [1, 2, 3, 4],
      ])
    },
    timeout,
  )

  // a kept class expression with a decorator at the left edge of a
  // statement: `@dec class {}.f.bind(null)()` would open a declaration.
  // Vite (Oxc) leaves standard decorators to the runtime, which Node does
  // not run yet: there the build is the outcome. Source: Astra review 5
  // (core B4)
  test(
    'a server-only fn whose implementation is a decorated class expression starting its statement: the server runs it',
    async () => {
      const { ssr } = await buildStart({
        bundler,
        files: {
          'entry.ts': `import { createServerOnlyFn } from '@tanstack/react-start'
function dec<T extends new (...args: Array<any>) => any>(ctor: T) {
  return ctor
}
export function anonymous() {
  let count = 0
  createServerOnlyFn(@dec class { static f() { count++ } }.f.bind(null))()
  return count
}
export function named() {
  let count = 0
  createServerOnlyFn(@dec class Named { static f() { count++ } }.f.bind(null))()
  return count
}
`,
        },
      })
      if (bundler === 'rsbuild') {
        expect(
          (await ssr.run(`return [entry.anonymous(), entry.named()]`)).result,
        ).toEqual([1, 1])
      }
    },
    timeout,
  )

  // a kept expression holding `in` in a classic `for` initialiser, where the
  // factory call's parentheses delimited it: `for (let cb = 'a' in cfg ? …;;)`
  // would read as a `for…in`. Source: Astra review 5 (core B2)
  test(
    'a server-only fn whose implementation reads `in`, in a classic `for` initialiser: the server runs the loop',
    async () => {
      const { ssr } = await buildStart({
        bundler,
        files: {
          'entry.ts': `import { createServerOnlyFn } from '@tanstack/react-start'
const cfg = { a: 1 }
export function declared() {
  for (let cb = createServerOnlyFn('a' in cfg ? () => 42 : () => 0); ; ) {
    return cb()
  }
}
export function assigned() {
  let cb: () => number
  for (cb = createServerOnlyFn('a' in cfg ? () => 42 : () => 0); ; ) {
    return cb()
  }
}
export function arrowBody() {
  for (let cb = createServerOnlyFn(() => 'a' in cfg); ; ) {
    return cb()
  }
}
export function nestedArrow() {
  for (let cb = () => createServerOnlyFn('a' in cfg ? () => 42 : () => 0); ; ) {
    return cb()()
  }
}
`,
        },
      })
      expect(
        (
          await ssr.run(
            `return [entry.declared(), entry.assigned(), entry.arrowBody(), entry.nestedArrow()]`,
          )
        ).result,
      ).toEqual([42, 42, true, 42])
    },
    timeout,
  )

  // a kept optional chain continued by what follows the call: unparenthesised,
  // `cfg?.impl.name` would read `undefined` where the source throws, and
  // `box?.f.tag = 1` does not parse. Source: Astra review of the splicing
  // design (class A1)
  test(
    'a server-only fn kept as an optional chain the call site continues: a failed read throws, an assignment builds',
    async () => {
      const { ssr } = await buildStart({
        bundler,
        files: {
          'entry.ts': `import { createServerOnlyFn } from '@tanstack/react-start'
const cfg: any = undefined
export function read() {
  try { return createServerOnlyFn(cfg?.impl).name } catch { return 'threw' }
}
export function readNonNull() {
  try { return createServerOnlyFn(cfg?.impl)!.name } catch { return 'threw' }
}
const box: any = { f() {} }
createServerOnlyFn(box?.f).tag = 1
export const tag = box.f.tag
`,
        },
      })
      expect(
        (await ssr.run(`return [entry.read(), entry.readNonNull(), entry.tag]`))
          .result,
      ).toEqual(['threw', 'threw', 1])
    },
    timeout,
  )

  // a factory call kept as another's implementation renders as its own
  // rewrite, whose text may open a block or a declaration where the outer
  // call stood: `() => {}` returns nothing, `function () {}` at a
  // statement's start is a declaration without a name. Source: Astra
  // review of the splicing design (class A3)
  test(
    'nested env-only and isomorphic fns kept in an arrow body and at a statement start: the server runs them',
    async () => {
      const { ssr } = await buildStart({
        bundler,
        files: {
          'entry.ts': `import { createIsomorphicFn, createServerOnlyFn } from '@tanstack/react-start'
export const value = (() => createServerOnlyFn(createIsomorphicFn().server({} as any)))()
export const log: Array<number> = []
createServerOnlyFn(createServerOnlyFn(function () { log.push(1) }))
createServerOnlyFn(createServerOnlyFn(function () { log.push(2) }))()
`,
        },
      })
      expect((await ssr.run(`return [entry.value, entry.log]`)).result).toEqual(
        [{}, [2]],
      )
    },
    timeout,
  )

  // a factory call under `as`, `satisfies` or `!` as another's
  // implementation (`nestedUnderWrappers`): the wrapper renders between the
  // two, around the inner implementation, also where that is the generated
  // stub of the other environment. Source: Astra review of the splicing
  // implementation (§1)
  test(
    'nested env-only and isomorphic fns under a TypeScript wrapper: each build runs what it keeps',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        entry: { client: 'client.ts', ssr: 'ssr.ts' },
        files: {
          'src/nested.ts': nestedUnderWrappers('@tanstack/react-start'),
          'client.ts': `export * from './src/nested'\n`,
          'ssr.ts': `export * from './src/nested'\n`,
        },
      })
      const thrown = (call: string) =>
        `try { ${call}; return 'returned' } catch (error) { return error.message }`
      expect(
        (
          await ssr.run(
            `return [entry.asserted(), entry.satisfying(), entry.nonNull(), await entry.generic(), (() => { ${thrown('entry.clientOnly()')} })()]`,
          )
        ).result,
      ).toEqual([
        7,
        7,
        7,
        7,
        'createClientOnlyFn() functions can only be called on the client!',
      ])
      expect(
        (
          await client.run(
            `return [(() => { ${thrown('entry.clientOnly()')} })(), (() => { ${thrown('entry.asserted()')} })()]`,
          )
        ).result,
      ).toEqual([
        'createServerOnlyFn() functions can only be called on the server!',
        'createServerOnlyFn() functions can only be called on the server!',
      ])
    },
    timeout,
  )

  // a string kept as a statement where the removed factory import stood
  // before it: as the module's first statement it would be the module's
  // directive, which Rolldown reports (and a directive-aware plugin reads:
  // `'use client'` marks a client module). React's plugin filters these
  // reports: a Solid app shows them. Source: Astra review of the splicing
  // implementation (G8)
  test(
    'a string kept as the first statement after the removed factory import: no directive in either build',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        framework: 'solid',
        entry: { client: 'client.ts', ssr: 'ssr.ts' },
        files: {
          'src/server.ts': `import { createServerOnlyFn } from '@tanstack/solid-start'
createServerOnlyFn('use client')
export const value = 1
`,
          'src/client.ts': `import { createClientOnlyFn } from '@tanstack/solid-start'
createClientOnlyFn('use client')
export const value = 2
`,
          'client.ts': `export { value } from './src/client'\n`,
          'ssr.ts': `export { value } from './src/server'\n`,
        },
      })
      const directives = (build: typeof client) =>
        [...build.warnings, ...build.consoleMessages]
          .map((diagnostic) => JSON.stringify(diagnostic))
          .filter((reported) => reported.includes('use client'))
      expect({ client: directives(client), ssr: directives(ssr) }).toEqual({
        client: [],
        ssr: [],
      })
    },
    timeout,
  )

  // the kept text's last character beside the source's next token: `impl`
  // then `in` would be one identifier. Source: Astra review of the
  // splicing design (class A2)
  test(
    'a server-only fn followed by an operator written without a space: the server evaluates the operator',
    async () => {
      const { ssr } = await buildStart({
        bundler,
        files: {
          'entry.ts': `import { createServerOnlyFn } from '@tanstack/react-start'
const impl = () => 1
const o = { x: 1 }
export const r = createServerOnlyFn(impl)in o
`,
        },
      })
      expect((await ssr.run(`return entry.r`)).result).toBe(false)
    },
    timeout,
  )
})
