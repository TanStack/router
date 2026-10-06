/**
 * Scenarios ported from babel-dead-code-elimination's tests
 * (pcattori/babel-dead-code-elimination `src/dead-code-elimination.test.ts`,
 * `src/find-referenced-identifiers.test.ts` and
 * `src/find-removable-bindings.test.ts`, MIT). The code splitter removes the
 * split route options from the reference module and everything only they
 * used; these tests check which bindings that removal prunes and which it
 * keeps.
 */
import { describe, expect, it } from 'vitest'
import {
  buildAndRun,
  compileRouteModules,
  expectValidModules,
} from './regression-helpers'
import { declarationOf } from './validate-module'

const head = `import { createFileRoute } from '@tanstack/react-router'\n`

/**
 * Compiles every module the code splitter emits, plus the reference module
 * compiled with React route HMR (`reference with HMR`).
 */
function compileWithHmrReference(code: string) {
  const { modules, sharedBindings } = compileRouteModules(code)
  modules['reference with HMR'] = compileRouteModules(code, {
    hmr: true,
  }).modules.reference!
  return { modules, sharedBindings }
}

/** Import statements of `code` that load `source`. */
function importsOf(code: string, source: string) {
  return code
    .split('\n')
    .filter((line) => /^import\b/.test(line) && line.includes(`'${source}'`))
}

describe('ported babel-dead-code-elimination: imports', () => {
  // Source: dead-code-elimination.test.ts "import" > "mixed default and named:
  // only named used" and "mixed default and named: only default used"
  it('gives the reference module and the chunk only the specifiers each one reads', async () => {
    const { modules } =
      compileWithHmrReference(`${head}import def, { named } from './lib'
import other, * as ns from './other'
export const Route = createFileRoute('/')({
  loader: () => [named, other],
  component: () => <p>{def}{ns.x}</p>,
})
`)
    expect(importsOf(modules.reference!, './lib')).toEqual([
      expect.stringMatching(/^import \{ named \} from/),
    ])
    expect(importsOf(modules.reference!, './other')).toEqual([
      expect.stringMatching(/^import other from/),
    ])
    const component = modules['virtual component']!
    expect(importsOf(component, './lib')).toEqual([
      expect.stringMatching(/^import def from/),
    ])
    expect(importsOf(component, './other')).toEqual([
      expect.stringMatching(/^import \* as ns from/),
    ])
    await expectValidModules(modules)
  })

  // Source: dead-code-elimination.test.ts "import" > "mixed default and named:
  // none used", "namespace" and "side-effect"
  it('drops an import whose every specifier moved instead of leaving a side-effect import', async () => {
    const { modules } =
      compileWithHmrReference(`${head}import a, { b } from 'pkg'
import * as ns from 'ns-pkg'
import './styles.css'
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{a}{b}{ns.x}</p>,
})
`)
    for (const name of ['reference', 'reference with HMR']) {
      expect(modules[name]).not.toMatch(/['"](?:pkg|ns-pkg)['"]/)
      // An import that never had specifiers is a side effect and stays
      expect(modules[name]).toMatch(/^import ['"]\.\/styles\.css['"]/m)
    }
    expect(importsOf(modules['virtual component']!, 'pkg')).toEqual([
      expect.stringMatching(/^import a, \{ b \} from/),
    ])
    await expectValidModules(modules)
  })
})

describe('ported babel-dead-code-elimination: declarations', () => {
  // Source: dead-code-elimination.test.ts "only eliminates newly unreferenced
  // identifiers", "everything is unreferenced, nothing is removed",
  // "unexported circular references" and find-removable-bindings.test.ts
  // "single unreferenced binding without self-ref -> not removable by SCC"
  it('keeps declarations that nothing used before splitting in the reference module', async () => {
    const { modules } =
      compileWithHmrReference(`${head}function unusedFunction() { return 1 }
const unusedExpression = function () {}
const unusedArrow = () => {}
function y(): number { return x() }
function x(): number { return y() }
function selfOnly(): number { return selfOnly() }
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>component</p>,
})
`)
    for (const name of ['reference', 'reference with HMR']) {
      for (const declared of [
        'unusedFunction',
        'unusedExpression',
        'unusedArrow',
        'y',
        'x',
        'selfOnly',
      ]) {
        expect(modules[name]).toMatch(declarationOf(declared))
      }
    }
    await expectValidModules(modules)
  })

  // Source: dead-code-elimination.test.ts "SCC dead code elimination" >
  // "arrow functions in mutual recursion -> removed", "mixed function types in
  // cycle -> removed" and "self-recursive function used -> preserved"
  it('moves component-only mutually recursive and self-recursive helpers out of the reference module', async () => {
    const { modules, sharedBindings } =
      compileWithHmrReference(`${head}import { dep } from './dep'
const ping = (n: number): number => (n > 0 ? pong(n - 1) : 0)
const pong = function (n: number): number { return n > 0 ? ping(n - 1) : dep }
function self(n: number): number { return n > 0 ? self(n - 1) : 2 }
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{ping(3)}{self(2)}</p>,
})
`)
    expect(sharedBindings).toEqual([])
    for (const name of ['reference', 'reference with HMR']) {
      for (const declared of ['ping', 'pong', 'self']) {
        expect(modules[name]).not.toMatch(declarationOf(declared))
      }
      expect(modules[name]).not.toContain('./dep')
    }
    for (const declared of ['ping', 'pong', 'self']) {
      expect(modules['virtual component']).toMatch(declarationOf(declared))
    }
    await expectValidModules(modules)
  })

  // Source: dead-code-elimination.test.ts "SCC dead code elimination" > "SCC
  // with external caller used -> all preserved" and
  // find-removable-bindings.test.ts "SCC with incoming from another candidate
  // -> not removable"
  it('keeps a cycle the component reads in the reference module while an unused caller still reaches it', async () => {
    const { modules } =
      compileWithHmrReference(`${head}function a(): number { return b() }
function b(): number { return a() }
function c() { return a() }
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{typeof a}</p>,
})
`)
    for (const declared of ['a', 'b', 'c']) {
      expect(modules.reference).toMatch(declarationOf(declared))
    }
    expect(modules['virtual component']).toMatch(declarationOf('a'))
    await expectValidModules(modules)
  })

  // Source: find-removable-bindings.test.ts "constant violations mark as
  // external" and dead-code-elimination.test.ts "assignment"
  it('declares a binding the split component only writes in its chunk', async () => {
    const { modules } = compileWithHmrReference(`${head}let lastRender = 0
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => {
    lastRender = Date.now()
    return <p>component</p>
  },
})
`)
    expect(modules['virtual component']).toMatch(/let lastRender = 0/)
    await expectValidModules(modules)
  })
})

describe('ported babel-dead-code-elimination: patterns', () => {
  // Source: dead-code-elimination.test.ts "object pattern" > "within
  // assignment pattern" and "array pattern" > "within object property"
  it('shares a nested destructuring with default values whose bindings the loader and the component split', async () => {
    const { modules, sharedBindings } =
      compileWithHmrReference(`${head}import { x } from './x'
let { a: { aa, bb } = { aa: 1, bb: 2 }, c: [c0, c1] = [] } = x
export const Route = createFileRoute('/')({
  loader: () => [bb, c1],
  component: () => <p>{aa}{c0}</p>,
})
`)
    expect(sharedBindings).toEqual(['aa', 'bb', 'c0', 'c1'])
    expect(modules.shared).toMatch(/aa: 1,\s*bb: 2/)
    expect(modules.shared).toMatch(/c: \[c0, c1\] = \[\]/)
    for (const name of ['reference', 'virtual component']) {
      expect(modules[name]).not.toContain('./x')
    }
    await expectValidModules(modules)
  })

  // Source: dead-code-elimination.test.ts "object pattern" > "within function
  // param" (function declaration, function expression, object method, arrow,
  // class method and class private method)
  it('keeps empty destructuring parameters of helpers moved into the chunk', async () => {
    const { modules } =
      compileWithHmrReference(`${head}function f(a: any, {}: any) { return a }
const g = (a: any, []: any) => a
const o = { m(a: any, {}: any) { return a } }
class K {
  m(a: any, {}: any) { return a }
  #p(a: any, {}: any) { return a }
  q(a: any) { return this.#p(a, {}) }
}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{f(1, {})}{g(2, [])}{o.m(3, {})}{new K().q(4)}</p>,
})
`)
    const component = modules['virtual component']!
    expect(component).toContain('function f(a: any, {}: any)')
    expect(component).toContain('const g = (a: any, []: any) => a')
    expect(component).toContain('m(a: any, {}: any)')
    expect(component).toContain('#p(a: any, {}: any)')
    await expectValidModules(modules)
  })
})

describe('ported babel-dead-code-elimination: var declarations nested in statements', () => {
  // Source: dead-code-elimination.test.ts "variable" > "within for...in" and
  // "within for...of" (var bindings declared inside nested statements).
  // Main removes the var declarators that only the split component reads from
  // the reference module, so their initializers run once, in the chunk.
  it('moves component-only vars declared in top-level blocks out of the reference module', async () => {
    const { modules } =
      compileWithHmrReference(`${head}import { compute, connect } from './lib'
if (typeof window !== 'undefined') {
  var flag = compute()
}
try {
  var conn = connect()
} catch {}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{String(flag)}{String(conn)}</p>,
})
`)
    for (const name of ['reference', 'reference with HMR']) {
      expect(modules[name]).not.toContain('compute()')
      expect(modules[name]).not.toContain('connect()')
      expect(modules[name]).not.toContain('./lib')
    }
    expect(modules['virtual component']).toContain('var flag = compute()')
    expect(modules['virtual component']).toContain('var conn = connect()')
    await expectValidModules(modules)
  })

  // Source: dead-code-elimination.test.ts "variable" > "within for...in"
  it('keeps a loader-only var declared in a top-level block out of the component chunk', async () => {
    const { modules } =
      compileWithHmrReference(`${head}import { compute } from './lib'
{
  var block = compute()
}
export const Route = createFileRoute('/')({
  loader: () => block,
  component: () => <p>component</p>,
})
`)
    expect(modules.reference).toContain('var block = compute()')
    expect(modules['virtual component']).not.toContain('compute()')
    expect(modules['virtual component']).not.toContain('./lib')
    await expectValidModules(modules)
  })

  // Source: dead-code-elimination.test.ts "variable" > "within for...in"
  it('runs the initializer of a component-only var declared in a top-level block once', async () => {
    const result = await buildAndRun({
      files: {
        'counter.ts': `export function compute() {
  ;(globalThis as any).computeCalls = ((globalThis as any).computeCalls ?? 0) + 1
  return 'computed'
}`,
        'routes/index.tsx': `${head}import { compute } from '../counter'
if (typeof globalThis === 'object') {
  var flag = compute()
}
export const Route = createFileRoute('/')({
  component: () => <p>{flag}</p>,
})`,
      },
      script: `const html = await entry.render(entry.Route.options.component)
return [html, globalThis.computeCalls]`,
    })
    expect(result).toEqual(['<p>computed</p>', 1])
  }, 30_000)
})
