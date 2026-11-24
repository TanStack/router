/**
 * What `<Hydrate>` children take from the component around them without a
 * name (`this`, `super`, `new.target`, `arguments`, `await`, `yield`, a
 * private name), and when their parts run, as the language scopes them
 * (SPEC J5.5): the children render in another component, so each such use
 * is a compile error, in the client and the server compile alike, and code
 * that owns what it uses (a function's own `this`, a class's own private
 * name, an async arrow's own `await`) splits and renders like the source.
 * A hook call is refused where it may run while the children render. On
 * React, a reassigned local a function of the children reads builds when
 * its writes are complete before the boundary (decision 3a), and is
 * refused otherwise. Through the public Start plugin on a dev server (`render.ts`); errors by
 * severity and position.
 */
import { describe, expect, test } from 'vitest'
import { compileError, expectCompileError } from '../../regression-helpers'
import {
  expectRendersLikeSource,
  useHydrateHost,
  useSolidHost,
} from '../../render'

const hosts = useHydrateHost()
const solidHost = useSolidHost()

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
  const host = framework === 'solid' ? await solidHost() : await hosts()
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
    { name: '<this.Body />', code: classPage('<this.Body />') },
    {
      name: "`this` in a nested class's computed key",
      code: classPage('<p>{String(new (class { [this.k]() {} })())}</p>'),
    },
    {
      name: "`this` in a parameter decorator of a nested class's method",
      code: classPage(
        '<p>{(() => { class C { m(@((this as any).dec) _x: string) {} } return C.name })()}</p>',
        '  dec = () => {}\n',
      ),
    },
    {
      name: '`this` through a cast',
      code: classPage('<p>{(this as any).k}</p>'),
    },
    // first in the children's order: `this` before a later hook, the
    // private name of `this.#x` before its `this`
    {
      name: '`this` before a hook call',
      code: classPage('<p>{[this.k, useId()]}</p>'),
    },
    { name: 'this.#x', code: classPage('<p>{this.#x}</p>') },
    // (as before)
    { name: '`this`', code: classPage('<p>{this.k}</p>') },
    {
      name: "`this` in a nested class's extends",
      code: classPage('<p>{String(new (class extends this.B {})())}</p>'),
    },
    { name: '`super`', code: classPage('<p>{super.label()}</p>') },
    { name: 'o.#x', code: classPage('<p>{o.#x}</p>') },
    { name: '#x in o', code: classPage('<p>{String(#x in o)}</p>') },
    {
      name: 'the outer #x, in a nested class with a private name of its own',
      code: classPage(
        '<p>{String(new (class { #y = 2; m() { return o.#x + this.#y } })().m())}</p>',
      ),
    },
    {
      name: '`new.target`',
      code: fnPage('<p>{String(new.target)}</p>'),
    },
    {
      name: '`await`',
      code: `${head}export async function Page() {
  return <Hydrate when={load()}><p>{await Promise.resolve(1)}</p></Hydrate>
}`,
    },
    {
      name: '`yield`',
      code: `${head}export function* Page() {
  yield <Hydrate when={load()}><p>{yield 1}</p></Hydrate>
}`,
    },
    {
      name: 'a top-level `await`',
      code: `${head}export const el = <Hydrate when={load()}><p>{await Promise.resolve(1)}</p></Hydrate>
export const Page = () => el`,
    },
  ])('$name: at the boundary', async ({ code }) => {
    await expectRejected(code, '<Hydrate')
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

  // React passes a capture's value when the placeholder renders: a read of
  // a reassigned local where it may run at another time is refused at the
  // read (an instance field's initialiser is such code; a function called
  // in place too, whatever proves the write complete). Client only: the
  // server renders the children in place
  test.each([
    {
      name: 'an instance field of a class the children pass',
      code: `${head}function Widget(props: { C: new () => { v: number } }) {
  return <p>{new props.C().v}</p>
}
export function Page() {
  let count = 0
  const el = <Hydrate when={load()}><Widget C={class { v = count }} /></Hydrate>
  count = 1
  return el
}`,
      at: 'count }',
    },
    {
      name: 'a function called in place, after a captured function assigning it',
      code: fnPage(
        '<p>{(bump(), (() => x)())}</p>',
        '  let x = 0\n  const bump = () => ++x\n',
      ),
      at: 'x)())',
    },
    {
      name: 'a generator called in place, the local assigned after the boundary',
      code: `${head}export function Page() {
  let x = 0
  const el = <Hydrate when={load()}><p>{[...(function* () { yield x })()].join()}</p></Hydrate>
  x = 1
  return el
}`,
      at: 'x })()',
    },
    {
      name: 'an async function called in place, after its `await`, the local assigned after the boundary',
      code: `${head}export function Page() {
  let x = 0
  const el = <Hydrate when={load()}><p>{String((async () => { await 0; return x })())}</p></Hydrate>
  x = 1
  return el
}`,
      at: 'x })())',
    },
  ])('a reassigned local read in $name: at the read', async ({ code, at }) => {
    await expectRejected(code, at, { environments: ['client'] })
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
    const { client } = await expectRendersLikeSource(await hosts(), code, {
      props,
    })
    expect(client.html).toContain(rendered)
  })

  test('`arguments` with split={false} stays in place in both environments', async () => {
    const { client } = await expectRendersLikeSource(
      await hosts(),
      `${head}export function Page(..._args: Array<unknown>) {
  return <Hydrate when={load()} split={false}><p>{(arguments[0] as { tag: string }).tag}</p></Hydrate>
}`,
      { props: { tag: 'x' }, split: false },
    )
    expect(client.html).toContain('<p>x</p>')
    expect(client.lazy).toEqual([])
  })
})

// React passes a reassigned local by value when the placeholder renders: a
// function of the children reading it sees that value. Exact when every
// write is complete when the boundary is created (decision 3a): an
// ordinary statement of the code declaring the local, in its blocks, `if`,
// `switch` or `try`, before the boundary, which is in that code too and in
// no loop the local outlives. Any other write may run after the snapshot.
describe('React: a reassigned local read in a function of the children', () => {
  const read = {
    setup: `globalThis.read = []\nexport const cleanup = ['read']`,
    script: `root.querySelector('button').click()\nreturn globalThis.read`,
  }
  test.each([
    {
      name: 'assigned in an if block before the boundary',
      code: `${head}export function Page({ user }: { user?: { name: string } }) {
  let label = 'Guest'
  if (user) {
    label = user.name
  }
  return <Hydrate when={load()}><ul>{['a'].map((k) => <li key={k}>{label}</li>)}</ul><button onClick={() => { (globalThis as any).read.push(label) }}>hi</button></Hydrate>
}`,
      props: { user: { name: 'Ann' } },
      rendered: '<li>Ann</li>',
      result: ['Ann'],
    },
    {
      name: 'assigned in both branches of an if before the boundary',
      code: `${head}export function Page({ picked }: { picked?: string }) {
  let selected: string | undefined
  if (picked) {
    selected = picked
  } else {
    selected = 'other'
  }
  return <Hydrate when={load()}><ul>{['a', 'other'].map((d) => <li key={d}>{String(d === selected)}</li>)}</ul><button onClick={() => { (globalThis as any).read.push(selected) }}>hi</button></Hydrate>
}`,
      props: {},
      rendered: '<ul><li>false</li><li>true</li></ul>',
      result: ['other'],
    },
    {
      name: 'assigned before the boundary, read in a function called in place',
      code: fnPage(
        '<p>{(() => x)()}</p><button onClick={() => { (globalThis as any).read.push(x) }}>hi</button>',
        '  let x = 0\n  x = 1\n',
      ),
      props: {},
      rendered: '<p>1</p>',
      result: [1],
    },
  ])(
    'builds and reads its value: $name',
    async ({ code, props, rendered, result }) => {
      const { client } = await expectRendersLikeSource(await hosts(), code, {
        props,
        ...read,
      })
      expect(client.html).toContain(rendered)
      expect(client.result).toEqual(result)
    },
  )

  const page = (body: string) => `${head}export function Page() {
  let x = 0
${body}
}`
  const button = '<button onClick={() => String(x)}>b</button>'
  test.each([
    {
      name: 'a write after the boundary',
      code: page(`  const el = <Hydrate when={load()}>${button}</Hydrate>
  x = 1
  return el`),
    },
    {
      name: 'a write in a handler declared before the boundary',
      code: page(`  const set = () => {
    x = 1
  }
  return <Hydrate when={load()}><i onClick={set} />${button}</Hydrate>`),
    },
    {
      name: 'a write in an async function called before the boundary, after its await',
      code: page(`  void (async () => {
    await 0
    x = 1
  })()
  return <Hydrate when={load()}>${button}</Hydrate>`),
    },
    {
      name: 'a write in a generator resumed before the boundary',
      code: page(`  const it = (function* () {
    x = 1
  })()
  it.next()
  return <Hydrate when={load()}>${button}</Hydrate>`),
    },
    {
      name: 'a write in an instance field of a class constructed after the boundary',
      code: page(`  class S {
    value = ++x
  }
  const el = <Hydrate when={load()}>${button}</Hydrate>
  new S()
  return el`),
    },
    {
      name: 'a write whose statement holds the boundary',
      code: `${head}export function Page() {
  let x: unknown = 0
  x = <Hydrate when={load()}>${button}</Hydrate>
  return x as any
}`,
    },
    {
      name: 'a write in a loop holding the boundary',
      code: page(`  const out: Array<unknown> = []
  for (const k of ['a']) {
    x = 1
    out.push(<Hydrate key={k} when={load()}>${button}</Hydrate>)
  }
  return <>{out}</>`),
    },
    {
      name: 'the boundary in a map callback',
      code: page(`  x = 1
  return <>{['a'].map((k) => <Hydrate key={k} when={load()}>${button}</Hydrate>)}</>`),
    },
    {
      name: 'the boundary in a function declared after the write and called before it',
      code: page(`  const el = make()
  x = 1
  function make() {
    return <Hydrate when={load()}>${button}</Hydrate>
  }
  return el`),
    },
    {
      name: 'a nested boundary in a map callback, the write after the outer boundary',
      code: page(`  const el = <Hydrate when={load()}><section>{[0].map((k) => <Hydrate key={k} when={load()}>${button}</Hydrate>)}</section></Hydrate>
  x = 1
  return el`),
    },
  ])('$name: at the read', async ({ code }) => {
    await expectRejected(code, 'x)}>b', { environments: ['client'] })
  })

  test('a for (let i…) variable, written by the loop: at the read', async () => {
    await expectRejected(
      `${head}export function Page() {
  const out: Array<unknown> = []
  for (let i = 0; i < 1; i++) {
    out.push(<Hydrate key={i} when={load()}><button onClick={() => String(i)}>b</button></Hydrate>)
  }
  return <>{out}</>
}`,
      'i)}>b',
      { environments: ['client'] },
    )
  })

  // a write in the children assigns the chunk's copy: refused at the write
  // (a render counter in a map callback, also on Solid; a ref callback
  // assigning a local code outside reads)
  test.each([
    {
      name: 'a render counter in a map callback',
      framework: 'react',
      code: `${head}export function Page() {
  let n = 0
  return <Hydrate when={load()}><ul>{['a'].map((k) => { n++; return <li key={k}>{n}</li> })}</ul></Hydrate>
}`,
      at: 'n++',
    },
    {
      name: 'a render counter in a map callback (Solid)',
      framework: 'solid',
      code: `${solidHead}export function Page() {
  let n = 0
  return <Hydrate when={load()}><ul>{['a'].map(() => { n++; return <li>{n}</li> })}</ul></Hydrate>
}`,
      at: 'n++',
    },
    {
      name: 'a ref callback assigning a local code outside reads',
      framework: 'react',
      code: `${head}export function Page() {
  let el: unknown
  return <><Hydrate when={load()}><b ref={(e) => { el = e }} /></Hydrate><i onClick={() => String(el)} /></>
}`,
      at: 'el = e',
    },
  ] as const)('$name: at the write', async ({ framework, code, at }) => {
    await expectRejected(code, at, { framework, environments: ['client'] })
  })
})
