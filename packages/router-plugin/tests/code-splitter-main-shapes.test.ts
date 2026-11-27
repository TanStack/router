/**
 * Route splitting does what main's splitter does wherever main's output works
 * (R153): the option values it splits, what an exported option value does,
 * and one instance of module state however many options read it.
 * Loaded the way an app loads it (`route-app.ts`), and asserted on what the
 * page shows: rendered output, which options load lazily, init counts and
 * identity. The cases follow main's code-splitter fixtures; the file is one
 * of four (code-splitter-main-shapes*.test.ts).
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

describe('option values main splits', () => {
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
    expect(await route.renderLazy('component')).toEqual({
      lazy: true,
      html: '<p>page</p>',
    })
  })

  // (SPEC §2.1: the chunk imports the route file by a specifier holding the `'`)
  it("splits the component of a route file with a ' in its name and renders it", async () => {
    const route = await loadRoute(
      `${head}export const Route = createFileRoute("/what's-new")({ component: () => <p>new</p> })
`,
      { filename: "what's-new.tsx", routeId: "/what's-new" },
    )
    await expectValidModules(route)
    expect(await route.renderLazy('component')).toEqual({
      lazy: true,
      html: '<p>new</p>',
    })
  })

  it('splits a loader given as an imported function, which loads its data', async () => {
    const route = await loadRoute(
      `${head}import { fetchData } from './data'
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['component']],
  loader: fetchData,
  component: () => <p>page</p>,
})
`,
      {
        files: {
          'data.ts': `export async function fetchData() {\n  return ['a', 'b']\n}\n`,
        },
      },
    )
    await expectValidModules(route)
    expect(await route.isLazy('loader')).toBe(true)
    expect(await route.run(`return options.loader()`)).toEqual(['a', 'b'])
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

describe('exported option values', () => {
  it.each([
    'export function Page() { return <p>page</p> }',
    'export const Page = () => <p>page</p>',
    'export default function Page() { return <p>page</p> }',
  ])(
    'keeps %s in the route module, the one instance importers get, and warns once',
    async (decl) => {
      // A server of its own: the compiler warns once per file and run
      const route = await loadRoute(
        `${head}${decl}
export const Route = createFileRoute('/')({
  component: Page,
  errorComponent: () => <p>error</p>,
})
`,
        { fresh: true },
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

describe('module state the options read', () => {
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

  // `main` keeps what a staying option and a split one share in a module
  // both import: the helper and the state it reads are created once
  it('creates a helper a staying loader and the split component share, and the state it reads, once', async () => {
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

  // code already unused in the source stays (the R153 amendment): only what
  // the split made unused leaves an output. Better than `main`, whose chunks
  // each hold a copy that runs again when it loads (spec-main-splitting 1.8
  // #5): it stays in the route module only, which always loads first
  it('keeps a declaration nothing reads in the route module only (better than `main`: runs once)', async () => {
    const route = await loadRoute(
      `${head}import { track } from './track'
const unused = track('unused')
export const Route = createFileRoute('/')({
  component: () => <p>page</p>,
})
`,
      { files: { 'track.ts': trackFile } },
    )
    await expectValidModules(route)
    expect(await route.isLazy('component')).toBe(true)
    expect(
      await route.run(`const { seen } = await app('track.ts')
const atLoad = [...seen()]
await render('component')
return [atLoad, seen()]`),
    ).toEqual([['unused'], ['unused']])
  })

  it('runs a declaration nothing reads once when the route module and two chunks load (better than `main`: runs once)', async () => {
    const route = await loadRoute(
      `${head}import { register } from './register'
const unused = register('x')
function Unused() { return <p>{register('fn').name}</p> }
export const Route = createFileRoute('/')({
  component: () => <p>page</p>,
  errorComponent: () => <p>error</p>,
})
`,
      {
        files: {
          'register.ts': `const calls: Array<string> = []
export function register(name: string) {
  calls.push(name)
  return { name }
}
export const seen = () => calls
`,
        },
      },
    )
    await expectValidModules(route)
    expect([
      await route.isLazy('component'),
      await route.isLazy('errorComponent'),
    ]).toEqual([true, true])
    expect(
      await route.run(`const { seen } = await app('register.ts')
const atLoad = [...seen()]
const page = await render('component')
const error = await render('errorComponent')
return [atLoad, page, error, seen()]`),
    ).toEqual([['x'], '<p>page</p>', '<p>error</p>', ['x']])
  })

  it('keeps an import specifier nothing reads: its module runs when the route module loads', async () => {
    const route = await loadRoute(
      `${head}import { setup } from './polyfill'
export const Route = createFileRoute('/')({
  component: () => <p>page</p>,
})
`,
      {
        files: {
          'track.ts': trackFile,
          'polyfill.ts': `import { track } from './track'
track('polyfill')
export function setup() {}
`,
        },
      },
    )
    await expectValidModules(route)
    expect(
      await route.run(`const { seen } = await app('track.ts')
return seen()`),
    ).toEqual(['polyfill'])
  })

  // a bare import is an import nothing references: the shared module has it
  // too, in source order, so a module the shared module imports still runs
  // after it (the route module imports the shared module first)
  it('runs a bare import before the module a shared declaration reads, as written', async () => {
    const route = await loadRoute(
      `${head}import './polyfill'
import { make } from './make'
const cfg = make()
function Page() {
  return <p>{cfg.k}</p>
}
export const Route = createFileRoute('/')({
  loader: () => cfg.k,
  component: Page,
})
`,
      {
        files: {
          'polyfill.ts': `;(globalThis as any).__poly = 'poly'\nexport {}\n`,
          'make.ts': `const seen: string = (globalThis as any).__poly ?? 'none'
export function make() {
  return { k: seen }
}
`,
        },
      },
    )
    await expectValidModules(route)
    expect(await route.isLazy('component')).toBe(true)
    expect(
      await route.run(`return [options.loader(), await render('component')]`),
    ).toEqual(['poly', '<p>poly</p>'])
  })

  // the same when the route module only re-exports a shared name: its import
  // of the shared module is then printed last, so the bare import stays in
  // the route module, before the import written after it
  it('runs a bare import before an import the route module keeps, when it only re-exports a shared name', async () => {
    const route = await loadRoute(
      `${head}import './polyfill'
import { helper } from './helper'
export const LIMIT = 10
function Page() {
  return <p>{LIMIT}</p>
}
function Err() {
  return <b>{LIMIT}</b>
}
export const Route = createFileRoute('/')({
  loader: () => helper(),
  component: Page,
  errorComponent: Err,
})
`,
      {
        files: {
          'polyfill.ts': `;(globalThis as any).__poly = 'poly'\nexport {}\n`,
          'helper.ts': `const seen: string = (globalThis as any).__poly ?? 'none'
export function helper() {
  return seen
}
`,
        },
      },
    )
    await expectValidModules(route)
    expect(await route.isLazy('component')).toBe(true)
    expect(
      await route.run(`return [options.loader(), await render('component')]`),
    ).toEqual(['poly', '<p>10</p>'])
  })
})
