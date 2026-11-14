/**
 * Route splitting does what main's splitter does wherever main's output works
 * (R153): the option values it splits, what an exported option value does,
 * one instance of module state however many options read it, and top-level
 * code that runs once. Loaded the way an app loads it (`route-app.ts`), and
 * asserted on what the page shows: rendered output, which options load
 * lazily, init counts and identity. The cases follow main's code-splitter
 * fixtures and spec-main-splitting.md §1.5-1.7.
 */
import { describe, expect, it } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { expectValidModules, head, loadRoute } from './route-app'

/** `track(name)` records each call and returns a fresh object (`seen()`). */
const trackFile = `const calls: Array<string> = []
export function track(name: string) {
  calls.push(name)
  return { name }
}
export const seen = () => calls
`

const pageFile = `export function Page() { return <p>page</p> }
export default function DefaultPage() { return <p>page</p> }
`

describe('option values main splits (§1.5)', () => {
  it.each([
    { name: 'an arrow function', decls: '', value: '() => <p>page</p>' },
    {
      name: 'a function expression',
      decls: '',
      value: 'function Page() { return <p>page</p> }',
    },
    {
      name: 'a function declaration',
      decls: 'function Page() { return <p>page</p> }',
      value: 'Page',
    },
    {
      name: 'a const',
      decls: 'const Page = () => <p>page</p>',
      value: 'Page',
    },
    {
      name: 'a name of a destructuring',
      decls: 'const { Page } = { Page: () => <p>page</p> }',
      value: 'Page',
    },
    {
      name: 'a named import',
      decls: "import { Page } from './page'",
      value: 'Page',
    },
    {
      name: 'a default import',
      decls: "import DefaultPage from './page'",
      value: 'DefaultPage',
    },
    {
      name: 'a call',
      decls: "import { memo } from 'react'\nconst Inner = () => <p>page</p>",
      value: 'memo(Inner)',
    },
    {
      name: 'a conditional',
      decls: 'const Page = () => <p>page</p>\nconst Other = () => null',
      value: 'Math.random() < 2 ? Page : Other',
    },
    {
      name: 'a cast',
      decls: 'const Page = () => <p>page</p>',
      value: 'Page as any',
    },
  ])('splits $name and renders it', async ({ decls, value }) => {
    const route = await loadRoute(
      `${head}${decls}
export const Route = createFileRoute('/')({ component: ${value} })
`,
      { files: { 'page.tsx': pageFile } },
    )
    await expectValidModules(route)
    expect(await route.isLazy('component')).toBe(true)
    expect(await route.run(`return render('component')`)).toBe('<p>page</p>')
  })

  // Values main's chunk compile cannot take (it throws, or the chunk exports
  // a name it does not declare): the route keeps working with them, split
  // or not.
  it.each([
    {
      name: 'a member of a local object',
      decls: 'const pages = { Page: () => <p>page</p> }',
      value: 'pages.Page',
    },
    {
      name: 'a namespace member',
      decls: "import * as pages from './page'",
      value: 'pages.Page',
    },
    {
      name: 'a value in a satisfies expression',
      decls: 'const Page = () => <p>page</p>',
      value: 'Page satisfies unknown',
    },
    {
      name: 'a sequence',
      decls: 'const Page = () => <p>page</p>',
      value: '(0, Page)',
    },
    {
      name: 'a name of an array pattern',
      decls: 'const [Page] = [() => <p>page</p>]',
      value: 'Page',
    },
    {
      name: 'a call holding JSX',
      decls: "import { memo } from 'react'",
      value: 'memo(() => <p>page</p>)',
    },
  ])('renders $name', async ({ decls, value }) => {
    const route = await loadRoute(
      `${head}${decls}
export const Route = createFileRoute('/')({ component: ${value} })
`,
      { files: { 'page.tsx': pageFile } },
    )
    await expectValidModules(route)
    expect(await route.run(`return render('component')`)).toBe('<p>page</p>')
  })
})

describe('exported option values (§1.6)', () => {
  it.each([
    'export function Page() { return <p>page</p> }',
    'export const Page = () => <p>page</p>',
    'export default function Page() { return <p>page</p> }',
  ])(
    'keeps %s in the route module, the one instance importers get, and warns once',
    async (decl) => {
      const route = await loadRoute(
        `${head}${decl}
export const Route = createFileRoute('/')({
  component: Page,
  errorComponent: () => <p>error</p>,
})
`,
      )
      await expectValidModules(route)
      expect(await route.isLazy('component')).toBe(false)
      expect(await route.isLazy('errorComponent')).toBe(true)
      expect(
        await route.run(
          `return [options.component === (exports.Page ?? exports.default), await render('component')]`,
        ),
      ).toEqual([true, '<p>page</p>'])
      expectDiagnostic(await route.diagnostics(), {
        severity: 'warning',
        file: route.url.slice(1),
        root: route.host.root,
        times: 1,
      })
    },
  )

  it('splits a component reading an exported const, which stays one instance', async () => {
    const route = await loadRoute(
      `${head}import { track } from './track'
export const config = track('config')
export const Route = createFileRoute('/')({
  component: () => <p>{config.name}</p>,
})
`,
      { files: { 'track.ts': trackFile } },
    )
    await expectValidModules(route)
    expect(await route.isLazy('component')).toBe(true)
    expect(
      await route.run(`const html = await render('component')
const { seen } = await app('track.ts')
return [html, seen()]`),
    ).toEqual(['<p>config</p>', ['config']])
  })
})

describe('module state the options read (§1.7)', () => {
  it('creates a value two split options read once', async () => {
    const route = await loadRoute(
      `${head}import { track } from './track'
const store = track('store')
export const Route = createFileRoute('/')({
  component: () => <p>{store.name}</p>,
  errorComponent: () => <p>{store.name}!</p>,
})
`,
      { files: { 'track.ts': trackFile } },
    )
    await expectValidModules(route)
    expect(await route.isLazy('component')).toBe(true)
    expect(await route.isLazy('errorComponent')).toBe(true)
    expect(
      await route.run(`const page = await render('component')
const error = await render('errorComponent')
const { seen } = await app('track.ts')
return [page, error, seen()]`),
    ).toEqual(['<p>store</p>', '<p>store!</p>', ['store']])
  })

  it('creates a value an option that stays and a split option read once', async () => {
    const route = await loadRoute(
      `${head}import { track } from './track'
const store = track('store')
export const Route = createFileRoute('/')({
  loader: () => store,
  component: () => <p>{store.name}</p>,
})
`,
      { files: { 'track.ts': trackFile } },
    )
    await expectValidModules(route)
    expect(await route.isLazy('component')).toBe(true)
    expect(
      await route.run(`const loaded = await options.loader()
const html = await render('component')
const { seen } = await app('track.ts')
return [html, seen(), loaded.name]`),
    ).toEqual(['<p>store</p>', ['store'], 'store'])
  })

  // `main` keeps what a staying option and a split one share in its shared
  // module, which both import: the chunk does not import the route module
  // (on Vite 8, a chunk importing its own route module moves React into a
  // chunk of its own)
  it('gives a helper a staying loader and the split component share its own module, which the chunk imports', async () => {
    const route = await loadRoute(
      `${head}import { track } from './track'
const prefix = track('prefix')
function title(n: number) {
  return \`\${prefix.name} \${n}\`
}
export const Route = createFileRoute('/')({
  loader: () => title(1),
  component: () => <p>{title(2)}</p>,
})
`,
      { files: { 'track.ts': trackFile } },
    )
    await expectValidModules(route)
    expect(await route.isLazy('component')).toBe(true)
    expect(
      await route.run(`const loaded = await options.loader()
const html = await render('component')
const { seen } = await app('track.ts')
return [loaded, html, seen()]`),
    ).toEqual(['prefix 1', '<p>prefix 2</p>', ['prefix']])
    // what the chunk imports from modules of the route file: the shared one
    const { modules } = await route.modules()
    const file = route.url.split('/').at(-1)!
    const fromRouteFile = [
      ...modules['lazy component']!.matchAll(/\bfrom\s*["']([^"']+)["']/g),
    ]
      .map((m) => m[1]!)
      .filter((spec) => spec.split('?')[0]!.endsWith(`/${file}`))
      .map((spec) => new URLSearchParams(spec.split('?')[1] ?? '').toString())
    expect({
      routeModule: fromRouteFile.includes(''),
      sharedModule: fromRouteFile.some((q) => /tsr-split=shared/.test(q)),
    }).toEqual({ routeModule: false, sharedModule: true })
  })

  it('moves a value only the split component reads into its chunk, its initialiser included', async () => {
    const route = await loadRoute(
      `${head}import { track } from './track'
const label = track('label')
export const Route = createFileRoute('/')({
  component: () => <p>{label.name}</p>,
})
`,
      { files: { 'track.ts': trackFile } },
    )
    await expectValidModules(route)
    expect(
      await route.run(`const { seen } = await app('track.ts')
const before = [...seen()]
const html = await render('component')
return [before, html, seen()]`),
    ).toEqual([[], '<p>label</p>', ['label']])
  })

  it('runs top-level statements once, when the route module loads', async () => {
    const route = await loadRoute(
      `${head}import { track } from './track'
const registry = new Map<string, number>()
registry.set('k', 1)
track('statement')
if (registry.size) { track('if') }
function Page() {
  return <p>{registry.get('k')}</p>
}
export const Route = createFileRoute('/')({
  component: Page,
  errorComponent: () => <p>{registry.size}</p>,
})
`,
      { files: { 'track.ts': trackFile } },
    )
    await expectValidModules(route)
    expect(await route.isLazy('component')).toBe(true)
    expect(
      await route.run(`const { seen } = await app('track.ts')
const atLoad = [...seen()]
const page = await render('component')
const error = await render('errorComponent')
return [atLoad, page, error, seen()]`),
    ).toEqual([
      ['statement', 'if'],
      '<p>1</p>',
      '<p>1</p>',
      ['statement', 'if'],
    ])
  })
})

// What `main`'s chunk copies (or takes alone) leaves the route file's
// production output with it: the option is split, and what only split code
// reads loads with the chunk, however the route file also names it (an
// export other than `export const|let|var`, a statement, an overload).
// Inputs of review-main-shape-guarantee.md (causes A to E), each with a
// marker in the route file's own code that only the component reads.
describe('what main leaves lazy (§1.6-1.8)', () => {
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
      expect(await route.isLazy('component')).toBe(true)
      expect(await route.run(`return render('component')`)).toBe(html)
      expect((await route.production()).where('MARK_HELPER')).toBe('lazy')
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
    expect(await route.isLazy('component')).toBe(true)
    expect(await route.run(`return render('component')`)).toBe(html)
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
      expect(await route.isLazy('component')).toBe(true)
      expect(await route.run(`return render('component')`)).toBe(html)
      expect((await route.production()).where('MARK_HELPER')).toBe('lazy')
    },
  )
})

// `main`'s shared module holds the names two option groups read (a staying
// option counting as one group) and nothing else; what else two split
// options read, each chunk copies (spec-main-splitting 1.3, 1.8 #1).
describe('what main shares, and only that (§1.3)', () => {
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
