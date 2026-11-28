/**
 * Env-only fns whose replacement lands in a grammar slot with rules of its
 * own, in real builds whose output runs: a namespace body's statement list,
 * a decorated class at statement start, a classic `for` initialiser. The
 * source's values are the expectation. Split from
 * start-build-top-level-env-calls.test.ts (per-file budget).
 */
import ts from 'typescript'
import { parseSync } from 'vite'
import { describe, expect, test } from 'vitest'
import { startBundlers } from '../build-harness'
import { buildStart } from '../build-start'
import { nestedUnderWrappers } from '../compiler-inputs'
import type { ESTree } from 'vite'

/**
 * The wrappers a lowering may erase, leaving their operand: TypeScript's,
 * and a group (TypeScript's transpiler drops the parentheses around a
 * wrapper it erases, esbuild reads `('use strict');` as a directive).
 */
const erasedWrappers = new Set([
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'TSInstantiationExpression',
])

/**
 * The string statements of a module's or a function body's statement list
 * once the wrappers above are erased (`('use strict' as any);` is
 * `'use strict';`): directives, or strings a lowering makes ones. An
 * independent parse of a TypeScript module.
 */
function directivesOnceErased(code: string): Array<string> {
  const { program } = parseSync('module.ts', code, {
    lang: 'ts',
    sourceType: 'module',
  })
  const found: Array<string> = []
  const list = (statements: ReadonlyArray<ESTree.Node>) => {
    for (const statement of statements) {
      if (statement.type !== 'ExpressionStatement') {
        continue
      }
      let expression = statement.expression as ESTree.Node
      while (erasedWrappers.has(expression.type)) {
        expression = (expression as { expression: ESTree.Node }).expression
      }
      if (
        expression.type === 'Literal' &&
        typeof expression.value === 'string'
      ) {
        found.push(expression.value)
      }
    }
  }
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (node === null || typeof node !== 'object') {
      return
    }
    const n = node as ESTree.Node & Record<string, unknown>
    if (
      (n.type === 'FunctionDeclaration' ||
        n.type === 'FunctionExpression' ||
        n.type === 'ArrowFunctionExpression') &&
      (n.body as ESTree.Node | null)?.type === 'BlockStatement'
    ) {
      list((n.body as ESTree.BlockStatement).body)
    }
    for (const [key, value] of Object.entries(n)) {
      if (key !== 'parent') {
        visit(value)
      }
    }
  }
  list(program.body)
  visit(program.body)
  return found
}

describe.each(startBundlers)('%s build', (bundler) => {
  // a replacement starting with `(` at the start of a statement of a
  // namespace body, after a statement without `;`: it starts a statement of
  // its own, as in a function's body. Source: Astra review 5 (core B1)
  test('an env-only fn called or written as a statement of a namespace body: each statement runs on its own', async () => {
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
      (await ssr.run(`return [entry.both.events, entry.server.events]`)).result,
    ).toEqual([
      [1, 2, 3],
      [1, 2, 3, 4],
    ])
  })

  // a kept class expression with a decorator at the left edge of a
  // statement: `@dec class {}.f.bind(null)()` would open a declaration.
  // Vite (Oxc) leaves standard decorators to the runtime, which Node does
  // not run yet: there the build is the outcome. Source: Astra review 5
  // (core B4)
  test('a server-only fn whose implementation is a decorated class expression starting its statement: the server runs it', async () => {
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
  })

  // a kept expression holding `in` in a classic `for` initialiser, where the
  // factory call's parentheses delimited it: `for (let cb = 'a' in cfg ? …;;)`
  // would read as a `for…in`. Source: Astra review 5 (core B2)
  test('a server-only fn whose implementation reads `in`, in a classic `for` initialiser: the server runs the loop', async () => {
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
  })

  // a kept optional chain continued by what follows the call: unparenthesised,
  // `cfg?.impl.name` would read `undefined` where the source throws, and
  // `box?.f.tag = 1` does not parse. Source: Astra review of the splicing
  // design (class A1)
  test('a server-only fn kept as an optional chain the call site continues: a failed read throws, an assignment builds', async () => {
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
  })

  // a factory call kept as another's implementation renders as its own
  // rewrite, whose text may open a block or a declaration where the outer
  // call stood: `() => {}` returns nothing, `function () {}` at a
  // statement's start is a declaration without a name. Source: Astra
  // review of the splicing design (class A3)
  test('nested env-only and isomorphic fns kept in an arrow body and at a statement start: the server runs them', async () => {
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
    expect((await ssr.run(`return [entry.value, entry.log]`)).result).toEqual([
      {},
      [2],
    ])
  })

  // a factory call under `as`, `satisfies` or `!` as another's
  // implementation (`nestedUnderWrappers`): the wrapper renders between the
  // two, around the inner implementation, also where that is the generated
  // stub of the other environment. Source: Astra review of the splicing
  // implementation (§1)
  test('nested env-only and isomorphic fns under a TypeScript wrapper: each build runs what it keeps', async () => {
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
  })

  // a string kept as a statement where the removed factory import stood
  // before it: as the module's first statement it would be the module's
  // directive, which Rolldown reports (and a directive-aware plugin reads:
  // `'use client'` marks a client module). React's plugin filters these
  // reports: a Solid app shows them. Source: Astra review of the splicing
  // implementation (G8)
  test('a string kept as the first statement after the removed factory import: no directive in either build', async () => {
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
  })

  // the same string under TypeScript wrappers only (`as`, `satisfies`, `!`,
  // `<T>`), inside the call or around it, the call in a group or not: once the lowering erases them the
  // statement is the string alone, a directive (`'use strict'` is a syntax
  // error in a function with a default, rest or destructured parameter;
  // Rsbuild's SWC erases the wrappers after the compiler ran). Vite's Oxc
  // parenthesises such a string itself, so on Vite the compiler's own output
  // is checked too, as the next `pre` plugin receives it, and as TypeScript's
  // transpiler lowers it: it drops the parentheses around a wrapper it
  // erases (`('use strict' as any)` is `'use strict'`). Source: Astra
  // re-check of the splicing implementation (§2), Astra pile-of-cases
  // audit (item 6)
  test('a string kept under TypeScript wrappers as a statement of a function or a module: no directive once they are erased, by the host or by TypeScript', async () => {
    const compiled: Array<string> = []
    const { ssr } = await buildStart({
      bundler,
      entry: { client: 'client.ts', ssr: 'ssr.ts' },
      files: {
        'src/strict.ts': `import { createServerOnlyFn } from '@tanstack/react-start'
createServerOnlyFn('use client' as const)
export function asserted(x = 1) {
  type T = number
  createServerOnlyFn('use strict' as any)
  return x
}
export function satisfying(...xs: Array<number>) {
  createServerOnlyFn('use strict' satisfies string)
  return xs.length
}
export function nonNull({ x } = { x: 3 }) {
  createServerOnlyFn('use strict'!)
  return x
}
export function angle(x = 4) {
  createServerOnlyFn(<any>'use strict')
  return x
}
export const arrow = (x = 5) => {
  createServerOnlyFn('use strict' as unknown as string)
  return x
}
export function around(x = 6) {
  createServerOnlyFn('use strict') as any
  return x
}
export function angleAround(x = 7) {
  <any>createServerOnlyFn('use strict')
  return x
}
export function nonNullAround(x = 8) {
  createServerOnlyFn('use strict')!
  return x
}
export function grouped(x = 9) {
  (createServerOnlyFn('use strict'))
  return x
}
export function groupedAsserted(x = 10) {
  (createServerOnlyFn('use strict' as any))
  return x
}
`,
        'client.ts': `export * from './src/strict'\n`,
        'ssr.ts': `export * from './src/strict'\n`,
      },
      viteConfig: {
        plugins: [
          {
            name: 'test:compiled-strict',
            enforce: 'pre',
            applyToEnvironment: (environment) => environment.name === 'ssr',
            transform(code, id) {
              if (id.endsWith('/src/strict.ts')) {
                compiled.push(code)
              }
            },
          },
        ],
      },
    })
    expect(
      (
        await ssr.run(
          `return [entry.asserted(), entry.satisfying(1, 2), entry.nonNull(), entry.angle(), entry.arrow(), entry.around(), entry.angleAround(), entry.nonNullAround(), entry.grouped(), entry.groupedAsserted()]`,
        )
      ).result,
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    if (bundler === 'vite') {
      expect(compiled.map(directivesOnceErased)).toEqual([[]])
      const lowered = compiled.map(
        (code) =>
          ts.transpileModule(code, {
            compilerOptions: {
              target: ts.ScriptTarget.ESNext,
              module: ts.ModuleKind.ESNext,
            },
          }).outputText,
      )
      expect(lowered.map(directivesOnceErased)).toEqual([[]])
    }
  })

  // Source text the compiler copies after what it removed or rewrote keeps
  // its meaning and its place: a string after a hashbang and a removed
  // import stays an expression (a hashbang is no statement of the prologue;
  // Astra), and a trailing comment after a rewritten statement's end stays
  // on that statement's line (Fable). Source: emit prototype review
  test('source after a removed import or a rewritten statement end: no directive after a hashbang, a trailing comment on its line', async () => {
    const compiled = new Map<string, string>()
    const files = {
      'src/bang.ts': `#!/usr/bin/env node
import { createServerOnlyFn } from '@tanstack/react-start'
'use client'
export const bang = createServerOnlyFn(() => 123)
`,
      'src/trailing.ts': `import { createServerOnlyFn } from '@tanstack/react-start'
const label = 1
export const trailing = createServerOnlyFn(() => label) // the server's
export const after = 2
`,
    }
    const { ssr } = await buildStart({
      bundler,
      entry: { client: 'client.ts', ssr: 'ssr.ts' },
      files: {
        ...files,
        'client.ts': `export * from './src/bang'\nexport * from './src/trailing'\n`,
        'ssr.ts': `export * from './src/bang'\nexport * from './src/trailing'\n`,
      },
      viteConfig: {
        plugins: [
          {
            name: 'test:compiled-copies',
            enforce: 'pre',
            applyToEnvironment: (environment) => environment.name === 'ssr',
            transform(code, id) {
              const file = Object.keys(files).find((f) => id.endsWith(`/${f}`))
              if (file !== undefined) {
                compiled.set(file, code)
              }
            },
          },
        ],
      },
    })
    expect(
      (await ssr.run('return [entry.bang(), entry.trailing(), entry.after]'))
        .result,
    ).toEqual([123, 1, 2])
    if (bundler === 'vite') {
      const { program } = parseSync('bang.ts', compiled.get('src/bang.ts')!, {
        lang: 'ts',
        sourceType: 'module',
      })
      expect({
        directives: program.body
          .filter(
            (statement) => 'directive' in statement && statement.directive,
          )
          .map((statement) => (statement as { directive: string }).directive),
        trailingOnItsLine: compiled
          .get('src/trailing.ts')!
          .split(/\r\n|[\n\r\u2028\u2029]/)
          .find((line) => line.includes("// the server's"))
          ?.includes('export const trailing'),
      }).toEqual({ directives: [], trailingOnItsLine: true })
    }
  })

  // the kept text's last character beside the source's next token: `impl`
  // then `in` would be one identifier. Source: Astra review of the
  // splicing design (class A2)
  test('a server-only fn followed by an operator written without a space: the server evaluates the operator', async () => {
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
  })
})
