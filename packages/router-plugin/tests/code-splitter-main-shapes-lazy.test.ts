/**
 * Route splitting does what main's splitter does wherever main's output works
 * (R153): what main leaves lazy, and what it shares between the route module
 * and its chunks.
 * Loaded the way an app loads it (`route-app.ts`), and asserted on what the
 * page shows: rendered output, which options load lazily, init counts and
 * identity. The cases follow main's code-splitter fixtures; the file is one
 * of four (code-splitter-main-shapes*.test.ts).
 */
import { describe, expect, it } from 'vitest'
import { expectValidModules, head, loadRoute } from './route-app'

describe('what main leaves lazy', () => {
  it.each([
    {
      name: 'an exported function',
      decls: `export function PostList() { return <p>MARK_HELPER</p> }
function Page() { return <div><PostList /></div> }`,
      html: '<div><p>MARK_HELPER</p></div>',
    },
    {
      name: 'an exported class',
      decls: `export class Model { get() { return 'MARK_HELPER' } }
function Page() { return <p>{new Model().get()}</p> }`,
      html: '<p>MARK_HELPER</p>',
    },
    {
      name: 'an exported hook beside an exported const',
      decls: `export function usePosts() { return 'MARK_HELPER' }
export const postsKey = ['key']
function Page() { return <p>{usePosts()}{postsKey[0]}</p> }`,
      html: '<p>MARK_HELPERkey</p>',
    },
    {
      name: 'a sub-component with a display name',
      decls: `const Card = (p: any) => <section>MARK_HELPER{p.children}</section>
Card.displayName = 'Card'
function Page() { return <Card>x</Card> }`,
      html: '<section>MARK_HELPERx</section>',
    },
    {
      name: 'a compound component',
      decls: `function Tabs(p: any) { return <div>{p.children}</div> }
function TabsList() { return <i>MARK_HELPER</i> }
Tabs.List = TabsList
function Page() { return <Tabs><Tabs.List /></Tabs> }`,
      html: '<div><i>MARK_HELPER</i></div>',
    },
    {
      name: 'a component an unused exported const reads',
      decls: `const Cell = () => <i>MARK_HELPER</i>
export const columns = [{ id: 'a', cell: Cell }]
function Page() { return <div><Cell /></div> }`,
      html: '<div><i>MARK_HELPER</i></div>',
    },
    {
      name: 'a component with default props',
      decls: `function Widget() { return <i>MARK_HELPER</i> }
Widget.defaultProps = { size: 1 }
function Page() { return <Widget /> }`,
      html: '<i>MARK_HELPER</i>',
    },
    {
      name: 'an object a statement fills',
      decls: `function Chart() { return <i>MARK_HELPER</i> }
const icons: Record<string, any> = {}
icons.chart = Chart
function Page() { const I = icons.chart; return <I /> }`,
      html: '<i>MARK_HELPER</i>',
    },
    {
      name: 'a table an exported function reads',
      decls: `const table: Record<string, string> = { a: 'MARK_HELPER' }
export function lookup(k: string) { return table[k] }
function Page() { return <p>{table.a}</p> }`,
      html: '<p>MARK_HELPER</p>',
    },
    {
      name: 'a cache an exported default function returns',
      decls: `const cache = new Map([['MARK_HELPER', 1]])
export default function getCache() { return cache }
function Page() { return <p>{[...cache.keys()][0]}</p> }`,
      html: '<p>MARK_HELPER</p>',
    },
    {
      name: 'a helper exported by a list',
      decls: `const table: Record<string, string> = { a: 'MARK_HELPER' }
function lookup(k: string) { return table[k] }
export { lookup }
function Page() { return <p>{lookup('a')}</p> }`,
      html: '<p>MARK_HELPER</p>',
    },
    {
      name: 'a component exported as default',
      decls: `function Widget() { return <i>MARK_HELPER</i> }
export default Widget
function Page() { return <div><Widget /></div> }`,
      html: '<div><i>MARK_HELPER</i></div>',
    },
    {
      name: 'an enum',
      decls: `enum Status { Active = 'MARK_HELPER' }
function Page() { return <p>{Status.Active}</p> }`,
      html: '<p>MARK_HELPER</p>',
    },
    {
      name: 'an object keyed by an enum',
      decls: `enum Kind { A = 'MARK_HELPER' }
const renderers = { [Kind.A]: () => Kind.A }
function Page() { return <p>{renderers[Kind.A]()}</p> }`,
      html: '<p>MARK_HELPER</p>',
    },
    {
      name: 'an overloaded function',
      decls: `function fmt(a: string): string
function fmt(a: number): string
function fmt(a: any) { return \`MARK_HELPER\${a}\` }
function Page() { return <p>{fmt(1)}</p> }`,
      html: '<p>MARK_HELPER1</p>',
    },
    {
      name: 'an overloaded function a const calls',
      decls: `declare function ambient(x: number): void
function pick(a: string): string
function pick(a: number): string
function pick(a: any) { return 'MARK_HELPER' + a }
const one = pick(1)
function Page() { return <p>{one}{pick('x')}</p> }`,
      html: '<p>MARK_HELPER1MARK_HELPERx</p>',
    },
  ])(
    'splits the component reading $name, which loads with it',
    async ({ decls, html }) => {
      const route = await loadRoute(
        `${head}${decls}
export const Route = createFileRoute('/')({ component: Page })
`,
      )
      await expectValidModules(route)
      expect(await route.renderLazy('component')).toEqual({
        lazy: true,
        html,
      })
      expect((await route.production()).where('MARK_HELPER')).toBe('lazy')
    },
  )

  // R155: an enum or a namespace the route module reads too stays there;
  // the chunk copies it, as main does
  it.each([
    {
      name: 'a namespace',
      decls: `namespace Labels { export const quiet = 'MARK_HELPER' }
;(globalThis as any).caseKept = Labels.quiet`,
      read: 'Labels.quiet',
      html: '<p>MARK_HELPER</p>',
    },
    {
      name: 'an enum',
      decls: `const measure = (s: string) => s.length
enum Size { Large = measure('MARK_HELPER') }
;(globalThis as any).caseKept = Size.Large`,
      read: 'Size.Large',
      html: '<p>11</p>',
    },
  ])(
    'keeps $name the route module reads too in the route module',
    async ({ decls, read, html }) => {
      const route = await loadRoute(
        `${head}${decls}
function Page() { return <p>{${read}}</p> }
export const Route = createFileRoute('/')({ component: Page })
`,
      )
      await expectValidModules(route)
      expect(await route.renderLazy('component')).toEqual({
        lazy: true,
        html,
      })
      expect((await route.production()).where('MARK_HELPER')).toBe('eager+lazy')
    },
  )

  it.each([
    {
      name: 'an overloaded component',
      decls: `function Page(p: { a: string }): any
function Page(p: { b: number }): any
function Page(p: any) { return <p>MARK_HELPER</p> }`,
      value: 'Page',
      html: '<p>MARK_HELPER</p>',
    },
    {
      name: 'an exported component behind a cast',
      decls: `export function Page() { return <p>MARK_HELPER</p> }`,
      value: 'Page as any',
      html: '<p>MARK_HELPER</p>',
    },
  ])('splits $name', async ({ decls, value, html }) => {
    const route = await loadRoute(
      `${head}${decls}
export const Route = createFileRoute('/')({ component: ${value} })
`,
    )
    await expectValidModules(route)
    expect(await route.renderLazy('component')).toEqual({
      lazy: true,
      html,
    })
    expect(
      (await route.diagnostics()).filter((d) => d.severity === 'warning'),
    ).toEqual([])
  })

  // A `let` the component assigns that only other route-file code also names:
  // the chunk holds its own copy, as on `main`, with the statements naming it
  it.each([
    {
      name: 'a statement disposing of it in development',
      decls: `let socket: any
if (import.meta.hot) { import.meta.hot.dispose(() => socket?.close()) }
function Page() { socket ??= { label: 'MARK_HELPER', close() {} }; return <p>{socket.label}</p> }`,
      html: '<p>MARK_HELPER</p>',
    },
    {
      name: 'a statement setting it in the browser',
      decls: `let cachedUser: any = null
if (typeof window !== 'undefined') { cachedUser = 'MARK_HELPER' }
function Page() { const before = cachedUser; cachedUser = 'next'; return <p>{before}</p> }`,
      html: '<p>MARK_HELPER</p>',
    },
    {
      name: 'an exported function resetting it',
      decls: `let cache: any
export function reset() { cache = undefined }
function Page() { cache ??= 'MARK_HELPER'; return <p>{cache}</p> }`,
      html: '<p>MARK_HELPER</p>',
    },
    {
      name: 'a statement disposing of it, beside a second split option',
      decls: `let socket: any
if (import.meta.hot) { import.meta.hot.dispose(() => socket?.close()) }
function Page() { socket ??= { label: 'MARK_HELPER', close() {} }; return <p>{socket.label}</p> }`,
      options: `errorComponent: () => <b>error</b>,`,
      html: '<p>MARK_HELPER</p>',
    },
  ])(
    'splits a component assigning a `let` beside $name',
    async ({ decls, options = '', html }) => {
      const route = await loadRoute(
        `${head}${decls}
export const Route = createFileRoute('/')({ ${options} component: Page })
`,
      )
      await expectValidModules(route)
      expect(await route.renderLazy('component')).toEqual({
        lazy: true,
        html,
      })
      expect((await route.production()).where('MARK_HELPER')).toBe('lazy')
    },
  )

  // `export default <expression>` is a top-level statement: a chunk copying
  // what it reads or writes runs it too, as `main`'s chunk keeps it (its
  // copy of `ready` is `true`, its `registry` is registered to again). The
  // route module's default export is unchanged.
  it.each([
    {
      name: 'assigning it',
      decls: `let ready = false
export default (ready = true)
function Page() { return <p>{String(ready)}</p> }`,
      values: [true, '<p>true</p>'],
    },
    {
      name: 'exporting it',
      decls: `const label = { text: 'MARK_HELPER' }
export default label
function Page() { return <p>{label.text}</p> }`,
      values: [{ text: 'MARK_HELPER' }, '<p>MARK_HELPER</p>'],
    },
    {
      name: 'passing it to a function that changes it',
      decls: `function register(list: Array<string>, name: string) { list.push(name); return list.length }
const registry: Array<string> = []
export default register(registry, 'MARK_HELPER')
function Page() { return <p>{registry.join()}</p> }`,
      values: [1, '<p>MARK_HELPER</p>'],
    },
  ])(
    'splits a component reading a binding beside an `export default` $name',
    async ({ decls, values }) => {
      const route = await loadRoute(
        `${head}${decls}
export const Route = createFileRoute('/')({ component: Page })
`,
      )
      await expectValidModules(route)
      expect(await route.isLazy('component')).toBe(true)
      expect(
        await route.run(`return [exports.default, await render('component')]`),
      ).toEqual(values)
    },
  )

  // An anonymous default class is named `default` while it evaluates: the
  // chunk's copy of the statement keeps the name its static initialiser
  // reads. Source: the Astra core review 9.
  it('splits a component reading what an anonymous default class writes while it is named', async () => {
    const route = await loadRoute(
      `${head}const names: Array<string> = []
export default class {
  static n = names.push(this.name)
}
function Page() { return <p>{names.join()}</p> }
export const Route = createFileRoute('/')({ component: Page })
`,
    )
    await expectValidModules(route)
    expect(await route.isLazy('component')).toBe(true)
    expect(
      await route.run(
        `return [exports.default.name, await render('component')]`,
      ),
    ).toEqual(['default', '<p>default</p>'])
  })
})

// `main`'s shared module holds the names two option groups read (a staying
// option counting as one group) and nothing else; what else two split
// options read, each chunk copies (spec-main-splitting 1.3, 1.8 #1).
describe('what main shares, and only that', () => {
  it('keeps a component two split options give lazy when a staying option shares a constant with it', async () => {
    const route = await loadRoute(
      `${head}const PAGE_SIZE = 20
export const Route = createFileRoute('/')({
  component: OverviewRoute,
  errorComponent: OverviewRoute,
  loader: () => ({ rows: PAGE_SIZE }),
})
function OverviewRoute() {
  return <p>MARK_OVERVIEW {PAGE_SIZE}{typeof Route.options}</p>
}
`,
    )
    await expectValidModules(route)
    expect(await route.isLazy('component')).toBe(true)
    expect(
      await route.run(
        `return [(await options.loader()).rows, await render('component')]`,
      ),
    ).toEqual([20, '<p>MARK_OVERVIEW 20object</p>'])
    expect((await route.production()).where('MARK_OVERVIEW')).toBe('lazy')
  })

  it.each([
    {
      name: 'a value read from Route',
      decls: `const query = { key: 'k' }
export const Route = createFileRoute('/')({
  loader: () => query.key,
  component: Page,
  notFoundComponent: Missing,
})
const options = Route.options`,
    },
    {
      name: 'a property destructured from Route',
      decls: `const query = { key: 'k' }
export const Route = createFileRoute('/')({
  loader: () => query.key,
  component: Page,
  notFoundComponent: Missing,
})
const { options } = Route`,
    },
  ])(
    'loads the route module when two split options read $name at load',
    async ({ decls }) => {
      const route = await loadRoute(
        `${head}${decls}
function Page() {
  return <p>{typeof options}{query.key}</p>
}
function Missing() {
  return <p>missing {typeof options}</p>
}
`,
      )
      await expectValidModules(route)
      expect(
        await route.run(
          `return [await options.loader(), await render('component'), await render('notFoundComponent')]`,
        ),
      ).toEqual(['k', '<p>objectk</p>', '<p>missing object</p>'])
    },
  )

  // assigning is no read: `main` shares nothing here, each module has its own
  it('splits a component that only assigns a let a staying option assigns too', async () => {
    const route = await loadRoute(
      `${head}let renders = 0
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    renders = 0
  },
  component: () => {
    renders += 1
    return <p>page</p>
  },
})
`,
    )
    await expectValidModules(route)
    expect(await route.isLazy('component')).toBe(true)
    expect(
      await route.run(`options.beforeLoad()
return render('component')`),
    ).toBe('<p>page</p>')
  })

  it.each([
    {
      name: 'a top-level call of it',
      decls: `let client: { id: number } | undefined
if (typeof window !== 'undefined') { getClient() }
function getClient() {
  if (!client) { client = { id: 1 } }
  return client
}`,
      read: 'getClient().id',
      values: [1, '<p>1</p>'],
    },
    {
      name: 'a property set on it',
      decls: `let pool: Array<number> | null = null
function fill() {
  pool ??= [1]
  return pool
}
fill.calls = 0`,
      read: 'fill().length',
      values: [1, '<p>1</p>'],
    },
    {
      name: 'a display name set on it',
      decls: `let seq = 0
function useId() {
  seq += 1
  return seq
}
useId.displayName = 'useId'`,
      read: 'useId()',
      values: [1, '<p>2</p>'],
    },
  ])(
    'shares a function assigning a shared let next to $name',
    async ({ decls, read, values }) => {
      const route = await loadRoute(
        `${head}${decls}
export const Route = createFileRoute('/')({
  loader: () => ${read},
  component: () => <p>{${read}}</p>,
})
`,
      )
      await expectValidModules(route)
      expect(await route.isLazy('component')).toBe(true)
      expect(
        await route.run(
          `return [await options.loader(), await render('component')]`,
        ),
      ).toEqual(values)
    },
  )
})
