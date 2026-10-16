import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  expectValidModules,
  head,
  importSources,
  loadRoute,
} from './regression-helpers'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'

const pageRoute = (body: string) => `${head}${body}
export const Route = createFileRoute('/')({ component: Page })
`

describe('a split component keeps the module bindings it reads', () => {
  it.each([
    {
      // Source: @vitejs/plugin-rsc hoist/function-hoist-block.js
      name: 'past a function declared in a nested block',
      body: `const value = 'outer'
function Page() {
  const seen = value
  {
    function value() {}
  }
  return seen
}`,
      expected: 'outer',
    },
    {
      // Source: @vitejs/plugin-rsc scope/param-default-var-hoisting.js
      name: 'from a parameter default next to a var of the same name',
      body: `const value = 'outer'
function Page(props, seen = value) {
  var value = 'inner'
  return seen + ':' + value
}`,
      expected: 'outer:inner',
    },
    {
      // Source: @vitejs/plugin-rsc scope/label.js
      name: 'next to a label of the same name',
      body: `const value = 'outer'
function Page() {
  value: for (const item of [1]) {
    if (item) {
      break value
    }
  }
  return value
}`,
      expected: 'outer',
    },
    {
      // Source: @vitejs/plugin-rsc hoist/catch-binding-shadow.js; React Compiler try-catch-* fixtures
      name: 'next to a catch parameter of the same name',
      body: `const err = { message: 'outer' }
function Page() {
  const readOuter = () => err.message
  try {
    throw new Error('inner')
  } catch (err) {
    return err.message + ':' + readOuter()
  }
}`,
      expected: 'inner:outer',
    },
    {
      // Source: @vitejs/plugin-rsc hoist/computed-destructuring-key-captures-outer-binding.js
      name: 'through a computed destructuring key',
      body: `const key = 'value'
function Page() {
  const { [key]: picked } = { value: 'picked' }
  return picked
}`,
      expected: 'picked',
    },
    {
      // Source: React Compiler destructure-*-default fixtures
      name: 'from parameter destructuring defaults',
      body: `const fallback = 'fb'
function Page({ title = fallback, items: [first = fallback.toUpperCase()] = [] }) {
  return <p>{title}{first}</p>
}`,
      expected: '<p>fbFB</p>',
    },
    {
      // Source: React Compiler optional-call-chain-*.js
      name: 'through optional call chains',
      body: `const helpers = { format: (v) => '[' + v + ']' }
function Page() {
  return <p>{helpers?.format?.('a')}{helpers.missing?.(1) ?? '-'}</p>
}`,
      expected: '<p>[a]-</p>',
    },
    {
      // Source: React Compiler tagged-template-literal.js
      name: 'as a template tag',
      body: `const tag = (strings, ...values) => strings.raw.join('|') + values.join(',')
function Page() {
  return <p>{tag\`a\${1}b\${2}c\`}</p>
}`,
      expected: '<p>a|b|c1,2</p>',
    },
    {
      // Source: React Compiler class fixtures; @vitejs/plugin-rsc hoist/class-declaration-in-body.js
      name: 'from the static block of a local class',
      body: `const base = 2
function Page() {
  class Counter {
    static start
    static {
      Counter.start = base * 2
    }
    #n = Counter.start
    get n() {
      return this.#n
    }
  }
  return <p>{new Counter().n}</p>
}`,
      expected: '<p>4</p>',
    },
    {
      // Shape of the deleted code-splitter snapshot fixture circular-reference-function
      name: 'when it reads itself through an object shorthand',
      body: `function getComponentName(obj: Record<string, unknown>) {
  return Object.keys(obj)[0]
}
function Page() {
  return <p>{getComponentName({ Page })}</p>
}`,
      expected: '<p>Page</p>',
    },
    {
      // Shape of the deleted code-splitter snapshot fixture circular-reference-arrow-function
      name: 'when an arrow component reads itself through an object shorthand',
      body: `function getComponentName(obj: Record<string, unknown>) {
  return Object.keys(obj)[0]
}
const Page = () => <p>{getComponentName({ Page })}</p>`,
      expected: '<p>Page</p>',
    },
  ])('$name', async ({ body, expected }) => {
    const route = await loadRoute(pageRoute(body))
    await expectValidModules(route.modules)
    expect(route.isLazy('component')).toBe(true)
    expect((await route.load('component'))({})).toBe(expected)
  })
})

describe('names a route option declares itself do not reference module bindings', () => {
  it.each([
    {
      // Source: Next.js ssg/getStaticProps/should-not-mix-up-bindings
      name: 'locals and a named function expression in the split component',
      options: `loader: () => [label, format()],
  component: () => {
    const label = 'local'
    const obj = { a: function format(x: number) { return x } }
    return <div>{label}{obj.a(1)}</div>
  },`,
      unread: 'component',
    },
    {
      // Source: Next.js ssg/getServerSideProps/query-usage
      name: 'a local in the loader',
      options: `loader: () => {
    const label = 'local'
    return label
  },
  component: () => <div>{label}{format()}</div>,`,
    },
    {
      // Source: Next.js ssg/getServerSideProps/query-usage
      name: 'destructured parameters',
      options: `loader: ({ label }: any) => [label, format()],
  component: ({ format }: any) => <div>{format}{label}</div>,`,
    },
    {
      // Source: Qwik optimizer test.rs should_not_auto_export_var_shadowed_in_{catch,do_while,switch,labeled_block}
      name: 'block-scoped names in the split component',
      options: `loader: () => [label, format()],
  component: ({ kind }: any) => {
    try { JSON.parse(kind) } catch (label) { console.log(label) }
    let i = 0
    do { const label = i; i += label + 1 } while (i < 3)
    switch (kind) { case 'a': { const label = 'case'; console.log(label) } }
    block: { const format = 'labeled'; if (format) break block }
    return <p>{i}</p>
  },`,
      unread: 'component',
    },
  ])('$name', async ({ options, unread }) => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    onTestFinished(() => {
      vi.restoreAllMocks()
    })
    let loads = 0
    const route = await loadRoute(
      `${head}import { load } from './load'
const label = load()
function format() { return 'format' }
export const Route = createFileRoute('/')({
  ${options}
})
`,
      {
        stubs: {
          './load': {
            load: () => {
              loads++
              return 'module'
            },
          },
        },
      },
    )
    await expectValidModules(route.modules)
    // The option's own names do not make the split component's module load
    // the module-level `label`, which only the loader reads. (When only the
    // split component reads it, when its initializer runs is free.)
    if (unread) {
      expect(importSources(route.chunkOf(unread))).not.toContain('./load')
    }
    route.options.loader({})
    expect(typeof (await route.load('component'))({})).toBe('string')
    expect(loads).toBe(1)
  })

  // Source: Next.js ssg/getStaticProps/should-not-remove-import-used-in-render
  it('neither do intrinsic tag and attribute names, unlike component tags and JSX expressions', async () => {
    let loads = 0
    const route = await loadRoute(
      `${head}import { A, B } from './ui'
import { load } from './load'
const a = load()
const p = load()
const label = load()
export const Route = createFileRoute('/')({
  loader: () => [a, p, label],
  component: () => (
    <p label="x" title={<A />}>
      <a href="/">home</a>
      <B.Deep.C />
    </p>
  ),
})
`,
      {
        stubs: {
          './ui': {
            A: () => 'A',
            B: { Deep: { C: () => '<c>' } },
          },
          './load': {
            load: () => {
              loads++
              return 'loaded'
            },
          },
        },
      },
    )
    expect(importSources(route.modules.reference!)).not.toContain('./ui')
    expect(importSources(route.chunkOf('component'))).not.toContain('./load')
    await expectValidModules(route.modules)
    expect([
      route.options.loader(),
      (await route.load('component'))(),
      loads,
    ]).toEqual([['loaded', 'loaded', 'loaded'], '<p><a>home</a><c></p>', 3])
  })

  // Source: React Router route-chunks-test.ts "computed object property"
  it('neither do object keys, unlike computed keys', async () => {
    const route = await loadRoute(
      `${head}import { load } from './load'
const label = load()
const kind = 'kind'
export const Route = createFileRoute('/')({
  loader: () => [label, kind],
  component: () => {
    const obj = { label: 1, [kind]: 2 }
    return <div>{obj.label}{obj[kind]}</div>
  },
})
`,
      { stubs: { './load': { load: () => 'loaded' } } },
    )
    await expectValidModules(route.modules)
    expect(importSources(route.chunkOf('component'))).not.toContain('./load')
    expect([route.options.loader(), (await route.load('component'))()]).toEqual(
      [['loaded', 'kind'], '<div>12</div>'],
    )
  })

  it('neither do declarations in helpers that move into the chunk, named like a shared binding', async () => {
    const route = await loadRoute(
      `${head}import { createStore } from './store'
const store = createStore()
function readVar() {
  const store = 'var,'
  return store
}
function readFunction() {
  function store() { return 'function,' }
  return store()
}
function readClass() {
  class store { static value = 'class,' }
  return store.value
}
function readEnum() {
  enum store { Value = 'enum,' }
  return store.Value
}
export const Route = createFileRoute('/')({
  loader: () => store.get(),
  component: () => <p>{readVar()}{readFunction()}{readClass()}{readEnum()}{store.get()}</p>,
})
`,
      {
        stubs: { './store': { createStore: () => ({ get: () => 'shared' }) } },
      },
    )
    await expectValidModules(route.modules)
    expect([route.options.loader(), (await route.load('component'))()]).toEqual(
      ['shared', '<p>var,function,class,enum,shared</p>'],
    )
  })
})

describe('imports read in nested positions follow the code that reads them', () => {
  // Source: React Router route-chunks-test.ts "default argument", "destructured
  // argument with default value", "for...of with destructuring and default
  // value", "try catch" and "generator function"; Turbopack tree-shaker analyzer/typeof-1
  it.each([
    {
      name: 'a default parameter',
      helper: 'const read = (value = x) => value',
      rendered: 'x',
    },
    {
      name: 'a destructuring default',
      helper: 'const read = ([{ value }] = [{ value: x }]) => value',
      rendered: 'x',
    },
    {
      name: 'a for-of destructuring default',
      helper: `const read = () => {
  for (const { value = x } of [{}]) {
    return value
  }
}`,
      rendered: 'x',
    },
    {
      name: 'a catch clause',
      helper: `const read = () => {
  try {
    throw 0
  } catch {
    return x
  }
}`,
      rendered: 'x',
    },
    {
      name: 'a generator',
      helper: 'const read = function* () { yield x }',
      call: 'read().next().value',
      rendered: 'x',
    },
    {
      name: 'a typeof operand',
      helper: 'const read = () => typeof x',
      rendered: 'string',
    },
  ])('$name', async ({ helper, call = 'read()', rendered }) => {
    const route = await loadRoute(
      `${head}import { x } from './x'
${helper}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{String(${call})}</p>,
})
`,
      { stubs: { './x': { x: 'x' } } },
    )
    expect(importSources(route.modules.reference!)).not.toContain('./x')
    await expectValidModules(route.modules)
    expect((await route.load('component'))()).toBe(`<p>${rendered}</p>`)
  })

  it.each([
    {
      // Source: @vitejs/plugin-rsc hoist/function-hoist-block.js
      name: 'past a function declared in a nested block',
      loader: `() => {
  {
    function store() {}
  }
  return store.value
}`,
    },
    {
      // Source: @vitejs/plugin-rsc scope/param-default-var-hoisting.js
      name: 'from a parameter default next to a var of the same name',
      loader: `(ctx, value = store.value) => {
  var store = 'local'
  return value
}`,
    },
    {
      // Source: @vitejs/plugin-rsc hoist/catch-binding-shadow.js
      name: 'in a try block whose catch parameter shadows it',
      loader: `() => {
  try {
    return store.value
  } catch (store) {
    return store
  }
}`,
    },
  ])('keeps an import the loader reads $name', async ({ loader }) => {
    const route = await loadRoute(
      `${head}import { store } from './store'
function Page() {
  return 'page'
}
export const Route = createFileRoute('/')({ loader: ${loader}, component: Page })
`,
      { stubs: { './store': { store: { value: 'stored' } } } },
    )
    await expectValidModules(route.modules)
    expect([
      route.options.loader({}),
      (await route.load('component'))(),
    ]).toEqual(['stored', 'page'])
  })
})

describe('plain JavaScript route files', () => {
  // In JavaScript, `a < b > (c)` is two comparisons, not a call with a type
  // argument, so `b` is a value the expression reads.
  // Source: #8504 router-utils source-language.test.ts (the other JavaScript
  // extensions).
  it.each(['route.js', 'route.jsx', 'route.mjs'])(
    'reads every operand of a chained comparison (%s)',
    async (filename) => {
      const route = await loadRoute(
        `${head}const a = 1, b = 2, c = 3
const r = a < b > (c)
export const Route = createFileRoute('/compare')({
  loader: () => r,
  component: () => <p>{String(r)}</p>,
})
`,
        { filename },
      )
      await expectValidModules(route.modules)
      expect([
        route.options.loader(),
        (await route.load('component'))(),
      ]).toEqual([false, '<p>false</p>'])
    },
  )

  // Source: @babel/generator using-declarations/using-and-await-using
  it('keeps the using declarations of a split component', async () => {
    const route = await loadRoute(
      pageRoute(`const log = []
const resource = (name) => ({ [Symbol.dispose]: () => log.push(name) })
function Page() {
  {
    using first = resource('first'), second = resource('second')
    log.push('body')
  }
  return log.join()
}`),
      { filename: 'route.js' },
    )
    await expectValidModules(route.modules)
    expect(route.isLazy('component')).toBe(true)
    expect((await route.load('component'))()).toBe('body,second,first')
  })
})

// Guards against codegen and parser bugs of the Yuku migration (#8504):
// each split component keeps its meaning in plain JavaScript.
describe('split components in plain JavaScript keep the syntax they were written with', () => {
  it.each([
    {
      // yuku-toolchain/yuku#255; source: @babel/generator
      // edgecase/postfix-update-comments
      name: 'a postfix update whose operand is followed by a comment',
      body: `let count = 0
function Page() {
  (
    count // the render count
  )++
  return count
}`,
      expected: 1,
    },
    {
      // yuku-toolchain/yuku#256; source: Oxc codegen esbuild.rs (ported
      // from esbuild's printer tests)
      name: 'the operands of `in` inside a parenthesized for-loop head',
      body: `function Page() {
  const a = true, b = 'b', c = 'x', d = { x: 1 }
  let result = 'unset'
  for (result = (a ? b : c in d).toString(); ; ) break
  return result
}`,
      expected: 'b',
    },
    {
      // yuku-toolchain/yuku#259; shape adapted from
      // @babel/plugin-proposal-decorators
      // 2023-11-misc/initField-existing-derived-constructor
      name: 'a super() call in the computed key of a class field in a derived constructor',
      body: `class Base {
  toString() {
    return 'key'
  }
}
class Derived extends Base {
  constructor() {
    class Field {
      [super()] = 'field'
    }
    this.field = new Field()
  }
}
function Page() {
  return new Derived().field.key
}`,
      expected: 'field',
    },
  ])('$name', async ({ body, expected }) => {
    const route = await loadRoute(pageRoute(body), { filename: 'route.js' })
    await expectValidModules(route.modules)
    expect(route.isLazy('component')).toBe(true)
    expect((await route.load('component'))()).toBe(expected)
  })
})

describe('plain TypeScript route files', () => {
  // Source: TanStack/router#7341. In a `.ts` file, `<T>value` is a type
  // assertion and `<T>(value: T) => value` a generic arrow function, not JSX.
  it('keeps angle-bracket type assertions in every module', async () => {
    const route = await loadRoute(
      `${head}const identity = <T>(value: T) => value
export const Route = createFileRoute('/')({
  loader: () => <number>identity(<unknown>1),
  component: () => <string>identity(<unknown>'page'),
})
`,
      { filename: 'route.ts' },
    )
    for (const [name, code] of Object.entries(route.modules)) {
      expect(await getModuleErrors(code, 'module.ts'), name).toEqual([])
    }
    expect([route.options.loader(), (await route.load('component'))()]).toEqual(
      [1, 'page'],
    )
  })
})
