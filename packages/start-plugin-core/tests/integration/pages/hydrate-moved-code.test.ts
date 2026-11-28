/**
 * What `<Hydrate>` children take from the component around them without a
 * name (`this`, `super`, `new.target`, `arguments`, `await`, `yield`, a
 * private name), and when their parts run, as the language scopes them
 * (SPEC J5.5): the children render in another component, so each such use
 * is a compile error, in the client and the server compile alike, and code
 * that owns what it uses (a function's own `this`, a class's own private
 * name, an async arrow's own `await`) splits and renders like the source.
 * A hook call is refused where it may run while the children render. On
 * React, children with a function reading a local the component
 * reassigns, or writing a captured local, stay in place with one warning
 * (decision 12). Through the public Start plugin on a dev server
 * (`render.ts`); errors and warnings by severity and position.
 */
import { beforeAll, describe, expect, test } from 'vitest'
import { closeAfterAll } from '../../file-end'
import {
  compileError,
  expectCompileError,
  expectNotSplit,
} from '../../regression-helpers'
import {
  createHydrateHost,
  createSolidHost,
  expectRendersLikeSource,
} from '../../render'
import type { HydrateHost, SolidHost } from '../../render'

let hosts: HydrateHost
const openHosts = closeAfterAll()
beforeAll(async () => {
  hosts = await openHosts(() => createHydrateHost())
}, 60_000)
let solidHost: SolidHost
const openSolidHost = closeAfterAll()
beforeAll(async () => {
  solidHost = await openSolidHost(() => createSolidHost())
}, 60_000)

const head = `import { Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
import { Component, useId } from 'react'
`
const solidHead = `import { Hydrate } from '@tanstack/solid-start'
import { load } from '@tanstack/solid-start/hydration'
`

/** A class component rendering `children` in a boundary, with `own` as its members. */
const classPage = (
  children: string,
  own = '',
) => `${head}class Base extends Component {
  label() {
    return 'base'
  }
}
export class Page extends Base {
  #x = 1
  k = 'k'
  B = class {}
  Body = () => <b>body</b>
${own}  render() {
    const o = this
    return <Hydrate when={load()}>${children}</Hydrate>
  }
}`

/** A function component rendering `children` in a boundary, after `before`. */
const fnPage = (
  children: string,
  before = '',
) => `${head}export function Page(..._args: Array<unknown>) {
${before}  return <Hydrate when={load()}>${children}</Hydrate>
}`

/**
 * `environments` reject `code` with an error at `at` (its line and column;
 * `<Hydrate` is the boundary's own position).
 */
async function expectRejected(
  code: string,
  at: string,
  {
    framework = 'react',
    environments = ['client', 'ssr'],
  }: {
    framework?: 'react' | 'solid'
    environments?: ReadonlyArray<'client' | 'ssr'>
  } = {},
) {
  const host = framework === 'solid' ? solidHost : hosts
  const startCase = await host.start.case({ 'module.tsx': code })
  for (const environment of environments) {
    const failure = await compileError(startCase, environment)
    expect(failure, `${environment} serves the module`).toBeDefined()
    expectCompileError(failure, { source: code, at, column: true })
  }
}

describe('a context the children take from around them is a compile error', () => {
  test.each([
    // the class's `this` in code of the children that is no function of
    // their own: a JSX member tag, a nested class's computed key, a
    // parameter decorator of a nested class's method (it runs when the
    // class is defined, with the `this` around the class), a cast
    {
      name: '<this.Body />',
      code: classPage('<this.Body />'),
      at: 'this.Body />',
    },
    {
      name: "`this` in a nested class's computed key",
      code: classPage('<p>{String(new (class { [this.k]() {} })())}</p>'),
      at: 'this.k]',
    },
    {
      name: "`this` in a parameter decorator of a nested class's method",
      code: classPage(
        '<p>{(() => { class C { m(@((this as any).dec) _x: string) {} } return C.name })()}</p>',
        '  dec = () => {}\n',
      ),
      at: 'this as any).dec',
    },
    {
      name: '`this` through a cast',
      code: classPage('<p>{(this as any).k}</p>'),
      at: 'this as any).k',
    },
    // first in the children's order: `this` before a later hook, the
    // private name of `this.#x` before its `this`
    {
      name: '`this` before a hook call',
      code: classPage('<p>{[this.k, useId()]}</p>'),
      at: 'this.k, useId',
    },
    { name: 'this.#x', code: classPage('<p>{this.#x}</p>'), at: '#x}</p>' },
    // (as before)
    { name: '`this`', code: classPage('<p>{this.k}</p>'), at: 'this.k}' },
    {
      name: "`this` in a nested class's extends",
      code: classPage('<p>{String(new (class extends this.B {})())}</p>'),
      at: 'this.B {}',
    },
    {
      name: '`super`',
      code: classPage('<p>{super.label()}</p>'),
      at: 'super.label()}',
    },
    { name: 'o.#x', code: classPage('<p>{o.#x}</p>'), at: '#x}</p>' },
    {
      name: '#x in o',
      code: classPage('<p>{String(#x in o)}</p>'),
      at: '#x in o',
    },
    {
      name: 'the outer #x, in a nested class with a private name of its own',
      code: classPage(
        '<p>{String(new (class { #y = 2; m() { return o.#x + this.#y } })().m())}</p>',
      ),
      at: '#x + this',
    },
    {
      name: '`new.target`',
      code: fnPage('<p>{String(new.target)}</p>'),
      at: 'new.target)',
    },
    {
      name: '`await`',
      code: `${head}export async function Page() {
  return <Hydrate when={load()}><p>{await Promise.resolve(1)}</p></Hydrate>
}`,
      at: 'await Promise',
    },
    {
      name: '`yield`',
      code: `${head}export function* Page() {
  yield <Hydrate when={load()}><p>{yield 1}</p></Hydrate>
}`,
      at: 'yield 1',
    },
    {
      name: 'a top-level `await`',
      code: `${head}export const el = <Hydrate when={load()}><p>{await Promise.resolve(1)}</p></Hydrate>
export const Page = () => el`,
      at: 'await Promise',
    },
    // (at the use: the edit acts there. Source: diagnostics spike
    // (2026-11-24), inventory flag 5, agreed change A6)
  ])('$name: at the use', async ({ code, at }) => {
    await expectRejected(code, at)
  })

  // React's rules of hooks: a call that may run while the children render
  // (in a class's computed key, at render, before a later `this`, in a
  // function called in place, also an async one: it runs up to its first
  // `await`), at the call
  test.each([
    {
      name: "in a nested class's computed key",
      code: fnPage('<p>{String(new (class { [useId()]() {} })())}</p>'),
      at: 'useId()]',
    },
    {
      name: 'before a later `this`',
      code: classPage('<p>{[useId(), this.k]}</p>'),
      at: 'useId(),',
    },
    {
      name: 'at render',
      code: fnPage('<p>{useId()}</p>'),
      at: 'useId()}',
    },
    {
      name: 'in a function called in place',
      code: fnPage('<p>{(() => useId())()}</p>'),
      at: 'useId())()',
    },
    {
      name: 'in an async function called in place',
      code: fnPage('<p>{String((async () => useId())())}</p>'),
      at: 'useId())()',
    },
    // (a generator's parameters run at the call; its body waits for
    // `.next()`: Astra review of the hotspot 5 implementation, 3)
    {
      name: 'in a default parameter of a generator called in place',
      code: fnPage('<p>{String((function* (arg = useId()) {})())}</p>'),
      at: 'useId()) {',
    },
  ])('a hook call $name: at the call', async ({ code, at }) => {
    await expectRejected(code, at)
  })

  // `arguments` of the component: the children cannot read it (the fix:
  // a local before the boundary, or `split={false}`), at the `arguments`,
  // also as a shorthand property, a JSX member tag, and in a nested
  // boundary in a `function` callback (the callback's)
  test.each([
    {
      name: 'a read',
      code: fnPage('<p>{arguments.length}</p>'),
      at: 'arguments.length',
    },
    {
      name: 'a shorthand property',
      code: fnPage('<p>{JSON.stringify({ arguments })}</p>'),
      at: 'arguments })',
    },
    {
      name: 'a JSX member tag',
      code: fnPage('<arguments.X />'),
      at: 'arguments.X',
    },
    {
      name: 'a read in a nested boundary in a function callback',
      code: `${head}export function Page(props: { tag: string }) {
  return <Hydrate when={load()}><section>{['row'].map(function (row) { return <Hydrate key={row} when={load()}><b>{String(arguments[0]?.tag ?? arguments[0])}</b></Hydrate> })}</section></Hydrate>
}`,
      at: 'arguments[0]?.tag',
    },
  ])('`arguments` in $name: at the `arguments`', async ({ code, at }) => {
    await expectRejected(code, at)
  })

  test('Solid: `arguments` as a shorthand property: at the `arguments`', async () => {
    await expectRejected(
      `${solidHead}export function Page() {
  return <Hydrate when={load()}><p>{JSON.stringify({ arguments })}</p></Hydrate>
}`,
      'arguments })',
      { framework: 'solid' },
    )
  })
})

describe('what the children own splits and renders like the source', () => {
  test.each([
    {
      name: '`this` in a type only',
      code: `${head}export class Page extends Component<{ v: number }> {
  render() {
    const v = this.props.v
    return <Hydrate when={load()}><p>{v as typeof this.props.v}</p></Hydrate>
  }
}`,
      props: { v: 3 },
      rendered: '<p>3</p>',
    },
    {
      name: "a nested class's field initialiser reading its own `this`",
      code: fnPage('<p>{String(new (class { a = 1; b = this.a })().b)}</p>'),
      rendered: '<p>1</p>',
    },
    {
      name: "a function's own `this` in a default parameter",
      code: fnPage(
        "<p>{(function (this: unknown, t = typeof this) { return t }).call('s')}</p>",
      ),
      rendered: '<p>string</p>',
    },
    {
      name: "a static block's own `this`",
      code: fnPage(
        '<p>{String((class { static a = 1; static { this.a = 2 } }).a)}</p>',
      ),
      rendered: '<p>2</p>',
    },
    {
      name: "an object method's own `super`",
      code: fnPage(
        '<p>{String({ __proto__: { a: 1 }, m() { return super.a } }.m())}</p>',
      ),
      rendered: '<p>1</p>',
    },
    {
      name: "a nested class's own #x, shadowing the component's",
      code: classPage(
        '<p>{String(new (class { #x = 5; m() { return this.#x } })().m())}</p>',
      ),
      rendered: '<p>5</p>',
    },
    {
      name: 'a hook in the body of a generator called in place and never resumed',
      code: fnPage('<p>{String((function* () { useId() })())}</p>'),
      rendered: '<p>[object Generator]</p>',
    },
    {
      name: "an async arrow's own `await`",
      code: fnPage("<p>{typeof (async () => { await fetch('/x') })}</p>"),
      rendered: '<p>function</p>',
    },
    {
      name: "a function's own `arguments`",
      code: fnPage(
        '<p>{(function (..._a: Array<unknown>) { return arguments.length })(1, 2)}</p>',
      ),
      rendered: '<p>2</p>',
    },
    {
      name: 'properties named arguments',
      code: `${head}export function Page(p: { arguments: string }) {
  return <Hydrate when={load()}><p>{p.arguments + Object.keys({ arguments: 1 }).join()}</p></Hydrate>
}`,
      props: { arguments: 'a:' },
      rendered: '<p>a:arguments</p>',
    },
    // what the `arguments` refusal suggests: a local before the boundary,
    // or `split={false}`
    {
      name: '`arguments` read into a local before the boundary',
      code: fnPage(
        '<p>{(args[0] as { tag: string }).tag}</p>',
        '  const args = arguments\n',
      ),
      props: { tag: 'x' },
      rendered: '<p>x</p>',
    },
  ])('$name', async ({ code, props, rendered }) => {
    const { client } = await expectRendersLikeSource(hosts, code, {
      props,
    })
    expect(client.html).toContain(rendered)
  })

  test('`arguments` with split={false} stays in place in both environments', async () => {
    const { client } = await expectRendersLikeSource(
      hosts,
      `${head}export function Page(..._args: Array<unknown>) {
  return <Hydrate when={load()} split={false}><p>{(arguments[0] as { tag: string }).tag}</p></Hydrate>
}`,
      { props: { tag: 'x' }, split: false },
    )
    expect(client.html).toContain('<p>x</p>')
    expect(client.lazy).toEqual([])
  })
})

// React passes a capture's value when the placeholder renders: a function
// of the children reading a local the component reassigns would read that
// snapshot, a write in the children would assign a copy, and a read of a
// local whose declaration does not end before the boundary may run before
// it is initialised. The client
// keeps such children in place, with one warning (decision 12), and they
// render like the source.
describe('React: children the split would give a copy of a local', () => {
  const read = {
    setup: `globalThis.read = []\nexport const cleanup = ['read']`,
    script: `root.querySelector('button').click()\nreturn globalThis.read`,
  }
  test.each([
    {
      name: 'a function reading a let assigned before the boundary',
      code: `${head}export function Page({ user }: { user?: { name: string } }) {
  let label = 'Guest'
  if (user) {
    label = user.name
  }
  return <Hydrate when={load()}><button onClick={() => { (globalThis as any).read.push(label) }}>hi</button></Hydrate>
}`,
      at: 'label) }}',
      props: { user: { name: 'Ann' } },
      result: ['Ann'],
    },
    {
      name: 'a function reading a let assigned after the boundary',
      code: `${head}export function Page() {
  let x = 0
  const el = <Hydrate when={load()}><button onClick={() => { (globalThis as any).read.push(x) }}>b</button></Hydrate>
  x = 1
  return el
}`,
      at: 'x) }}',
      props: {},
      result: [1],
    },
    {
      // the placeholder would read `save` before its declaration runs
      // (`main` splits it, and its placeholder reads it too early)
      name: 'a function reading a const declared after the boundary',
      code: `${head}export function Page() {
  const view = <Hydrate when={load()}><button onClick={() => save()}>b</button></Hydrate>
  const save = () => {
    ;(globalThis as any).read.push('saved')
  }
  return view
}`,
      at: 'save()}',
      props: {},
      result: ['saved'],
    },
    // the runtime declaration, not a type of the same name before it
    // (Astra review of decision 12)
    {
      name: 'a const declared after the boundary, a type of its name before it',
      code: `${head}export function Page() {
  type label = string
  const el = <Hydrate when={load()}><button onClick={() => { (globalThis as any).read.push(label) }}>b</button></Hydrate>
  const label: label = 'after'
  return el
}`,
      at: 'label) }}',
      props: {},
      result: ['after'],
    },
    // the boundary in the initialiser of the local it reads: the
    // declaration starts before the boundary and ends after it (Gemini
    // review of decision 12)
    {
      name: 'a const holding the boundary',
      code: `${head}export function Page() {
  const view = <Hydrate when={load()}><button onClick={() => { (globalThis as any).read.push(typeof view) }}>b</button></Hydrate>
  return view
}`,
      at: 'view) }}',
      props: {},
      result: ['object'],
    },
    {
      name: 'an object holding the boundary',
      code: `${head}export function Page() {
  const obj = { view: <Hydrate when={load()}><button onClick={() => { (globalThis as any).read.push(typeof obj) }}>b</button></Hydrate> }
  return obj.view
}`,
      at: 'obj) }}',
      props: {},
      result: ['object'],
    },
    {
      name: 'a destructured array holding the boundary',
      code: `${head}export function Page() {
  const [, view] = [0, <Hydrate when={load()}><button onClick={() => { (globalThis as any).read.push(typeof view) }}>b</button></Hydrate>]
  return view
}`,
      at: 'view) }}',
      props: {},
      result: ['object'],
    },
    {
      name: 'a var holding the boundary',
      code: `${head}export function Page() {
  var view = <Hydrate when={load()}><button onClick={() => { (globalThis as any).read.push(typeof view) }}>b</button></Hydrate>
  return view
}`,
      at: 'view) }}',
      props: {},
      result: ['object'],
    },
    {
      name: 'a write in the children (a render counter in a map callback)',
      code: `${head}export function Page() {
  let n = 0
  return <Hydrate when={load()}><ul>{['a', 'b'].map((k) => { n++; return <li key={k}>{n}</li> })}</ul><button onClick={() => { (globalThis as any).read.push(n) }}>b</button></Hydrate>
}`,
      at: 'n++',
      props: {},
      result: [2],
    },
  ])('$name: in place, warned at $at', async ({ code, at, props, result }) => {
    const startCase = await hosts.start.case({ 'module.tsx': code })
    await expectNotSplit(startCase, code, at)
    const { client } = await expectRendersLikeSource(hosts, code, {
      props,
      split: false,
      ...read,
    })
    expect(client.result).toEqual(result)
  })

  // a directive reads its local like any capture (Gemini review of
  // decision 12)
  test('Solid: a directive declared after the boundary: in place, warned at the directive', async () => {
    const code = `${solidHead}export function Page() {
  const view = <Hydrate when={load()}><p use:tip>hi</p></Hydrate>
  const tip = (el: HTMLElement) => {
    el.dataset.tipped = 'yes'
  }
  return view
}`
    const startCase = await solidHost.start.case({ 'module.tsx': code })
    await expectNotSplit(startCase, code, 'tip>hi')
  })

  test('Solid: a write in the children (a render counter in a map callback): in place, warned at the write', async () => {
    const code = `${solidHead}export function Page() {
  let n = 0
  return <Hydrate when={load()}><ul>{['a'].map(() => { n++; return <li>{n}</li> })}</ul></Hydrate>
}`
    const startCase = await solidHost.start.case({ 'module.tsx': code })
    await expectNotSplit(startCase, code, 'n++')
  })
})
