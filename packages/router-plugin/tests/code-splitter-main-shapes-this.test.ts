/**
 * Route splitting does what main's splitter does wherever main's output works
 * (R153), and better (#8623, #8688): methods, and functions reading their
 * own `this` or `super`.
 * Loaded the way an app loads it (`route-app.ts`), and asserted on what the
 * page shows: rendered output, which options load lazily, init counts and
 * identity. The cases follow main's code-splitter fixtures; the file is one
 * of four (code-splitter-main-shapes*.test.ts).
 */
import { describe, expect, it } from 'vitest'
import {
  diagnosticPosition,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { expectNoProblems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { expectValidModules, head, loadRoute } from './route-app'

// Better than `main` (#8623, #8688): a method is split as a function
// expression with the same body is; a function value whose own `this` or
// `super` its body uses stays in the route module as written (splitting can
// change what they refer to), and the build warns at the option (its
// wording: code-splitter-guide.test.ts). "Own" is the language's scoping.
describe('method shorthand and `this` (#8623, #8688)', () => {
  it('splits a component written as a method and renders it', async () => {
    const route = await loadRoute(
      `${head}export const Route = createFileRoute('/')({
  component() {
    return <p>page</p>
  },
})
`,
    )
    await expectValidModules(route)
    expect(await route.renderLazy('component')).toEqual({
      lazy: true,
      html: '<p>page</p>',
    })
    expectNoProblems(await route.diagnostics())
  })

  const loaded = 'return await options.loader()'
  it.each([
    { name: 'a method', loader: 'loader() { return 1 }', value: 1 },
    {
      name: 'an async method',
      loader: 'async loader() { return 2 }',
      value: 2,
    },
    {
      name: 'a generator method',
      loader: '*loader() { yield 3 }',
      call: 'return [...(await options.loader())]',
      value: [3],
    },
    {
      name: 'an async generator method',
      loader: 'async *loader() { yield 4 }',
      call: `const out = []
for await (const v of await options.loader()) out.push(v)
return out`,
      value: [4],
    },
    {
      name: 'a method whose nested function has its own `this`',
      loader: 'loader() { return [1].map(function () { return typeof this }) }',
      value: ['undefined'],
    },
    {
      name: 'a method whose nested function renders `<this.Foo />`',
      loader: 'loader() { return typeof function () { return <this.Foo /> } }',
      value: 'function',
    },
    {
      name: 'a method whose nested class method has its own `this`',
      loader:
        'loader() { class A { m() { return this } } const a = new A(); return a.m() === a }',
      value: true,
    },
    {
      name: "a method whose nested class field initialiser has the instance's `this`",
      loader:
        'loader() { class A { x = this } const a = new A(); return a.x === a }',
      value: true,
    },
    {
      name: "a method whose nested static block has the class's `this`",
      loader:
        'loader() { let s: unknown; class A { static { s = this } } return s === A }',
      value: true,
    },
    {
      name: 'a method naming `this` in a type only',
      loader:
        'loader() { const x: typeof this | undefined = undefined; return String(x) }',
      value: 'undefined',
    },
  ])(
    'splits a loader written as $name and runs it',
    async ({ loader, call = loaded, value }) => {
      const route = await loadRoute(
        `${head}export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader']],
  ${loader},
})
`,
      )
      await expectValidModules(route)
      expect(await route.isLazy('loader')).toBe(true)
      expect(await route.run(call)).toEqual(value)
      expectNoProblems(await route.diagnostics())
    },
  )

  // The router calls the loader as a plain function (`this` is
  // `undefined`); a split one would get the chunk's own `this`. Rendered
  // through the router: what the loader returned.
  it.each([
    {
      name: 'a method reading `this`',
      loader: 'loader() { return typeof this }',
      value: 'undefined',
    },
    {
      name: 'a method whose arrow function reads its `this`',
      loader: 'loader() { return typeof (() => this)() }',
      value: 'undefined',
    },
    {
      name: 'a method reading `this` in a parameter default',
      loader: 'loader(_ctx: unknown, t = typeof this) { return t }',
      value: 'undefined',
    },
    {
      name: 'a method reading `this` in a nested class `extends`',
      loader:
        'loader() { class A extends (this ?? Object) {} return typeof A }',
      value: 'function',
    },
    {
      name: "a method reading `this` in a nested class's computed key",
      loader: 'loader() { class A { [String(this)]() {} } return typeof A }',
      value: 'function',
    },
    {
      name: 'a method whose arrow function renders `<this.Foo />`',
      loader: 'loader() { return typeof (() => <this.Foo />) }',
      value: 'function',
    },
    {
      name: 'a method whose arrow function renders `<this.a.Foo>`',
      loader: 'loader() { return typeof (() => <this.a.Foo>x</this.a.Foo>) }',
      value: 'function',
    },
    {
      name: 'a method reading `super`',
      loader: 'loader() { return typeof super.toString }',
      value: 'function',
    },
    {
      name: 'a function expression reading `this`',
      loader: 'loader: function () { return typeof this }',
      value: 'undefined',
    },
  ])(
    'keeps a loader written as $name in the route module, as the router runs it, and warns once at it',
    async ({ loader, value }) => {
      const code = `${head}export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader']],
  ${loader},
  component: () => <p>{String(Route.useLoaderData())}</p>,
})
`
      // (a host of its own: the plugin reports a warning once per file
      // and run, and the rows share file and message)
      const route = await loadRoute(code, { fresh: true })
      await expectValidModules(route)
      expect(await route.isLazy('loader')).toBe(false)
      expect(await route.run('return renderRoute()')).toBe(`<p>${value}</p>`)
      expectDiagnostic(await route.diagnostics(), {
        severity: 'warning',
        file: route.url.slice(1),
        root: route.host.root,
        position: diagnosticPosition(code, loader),
        times: 1,
      })
    },
  )

  // A parameter's decorator (TypeScript `experimentalDecorators`) runs when
  // its class is defined, with the `this` of the code around the class: the
  // loader's, though the decorator is written inside a method. Source: Astra
  // review of the hotspot 5 design (split, the loader returned `V bound`).
  it("keeps a loader whose nested class has a parameter decorator reading the loader's `this` in the route module, and warns once at it", async () => {
    const loader = `loader: function () {
    let label = 'unset'
    const capture = (v: unknown) => {
      label = v === undefined ? 'plain' : 'bound'
      return () => {}
    }
    class V {
      m(@(capture(this)) _x: string) {}
    }
    return V.name + ' ' + label
  }`
    const code = `${head}export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader']],
  ${loader},
  component: () => <p>{String(Route.useLoaderData())}</p>,
})
`
    const route = await loadRoute(code, {
      fresh: true,
      tsconfig: { experimentalDecorators: true },
    })
    await expectValidModules(route)
    expect(await route.isLazy('loader')).toBe(false)
    expect(await route.run('return renderRoute()')).toBe('<p>V plain</p>')
    expectDiagnostic(await route.diagnostics(), {
      severity: 'warning',
      file: route.url.slice(1),
      root: route.host.root,
      position: diagnosticPosition(code, loader),
      times: 1,
    })
  })

  it.each([
    {
      name: 'reading `this`',
      body: '<p>{typeof this}</p>',
      html: '<p>undefined</p>',
    },
    {
      name: 'rendering `<this.Foo />` in an arrow function',
      body: '<p>{typeof (() => <this.Foo />)}</p>',
      html: '<p>function</p>',
    },
  ])(
    'keeps a component function expression $name in the route module, and warns once at it',
    async ({ body, html }) => {
      const code = `${head}export const Route = createFileRoute('/')({
  component: function () {
    return ${body}
  },
})
`
      // (a host of its own: the plugin reports a warning once per file
      // and run, and the rows share file and message)
      const route = await loadRoute(code, { fresh: true })
      await expectValidModules(route)
      expect(await route.isLazy('component')).toBe(false)
      expect(await route.run('return renderRoute()')).toBe(html)
      expectDiagnostic(await route.diagnostics(), {
        severity: 'warning',
        file: route.url.slice(1),
        root: route.host.root,
        position: diagnosticPosition(code, 'component: function'),
        times: 1,
      })
    },
  )

  it('splits a component and an errorComponent written as methods into one group', async () => {
    const route = await loadRoute(
      `${head}export const Route = createFileRoute('/')({
  codeSplitGroupings: [['component', 'errorComponent']],
  component() {
    return <p>page</p>
  },
  errorComponent() {
    return <p>error</p>
  },
})
`,
    )
    await expectValidModules(route)
    expect(await route.groups()).toEqual([['component', 'errorComponent']])
    expect(
      await route.run(
        `return [await render('component'), await render('errorComponent')]`,
      ),
    ).toEqual(['<p>page</p>', '<p>error</p>'])
  })
})

// Solid lowers `ref={box}` on a reassignable binding holding no callback to
// "call it if it holds a function, else assign it": an assignment of `box`.
// A split component would assign its chunk's copy, or a binding it imports,
// while `beforeLoad` reads the route module's: the component stays in the
// route module, as with an explicit `box = el`, and `beforeLoad` sees the
// element (on `main`, `undefined`). Source: Astra review of the hotspot 5
// design.
describe('a Solid ref naming a module let', () => {
  it("keeps beforeLoad reading the element the component's ref binds", async () => {
    const route = await loadRoute(
      `import { createFileRoute } from '@tanstack/solid-router'
let box: HTMLElement | undefined
export const Route = createFileRoute('/')({
  beforeLoad: () => box?.tagName ?? 'none',
  component: Form,
})
function Form() {
  return <div ref={box}>form</div>
}
`,
      { targetFramework: 'solid' },
    )
    await expectValidModules(route)
    expect(
      await route.run(`await render('component')
return options.beforeLoad()`),
    ).toBe('DIV')
  })
})
