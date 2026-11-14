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

  it('runs top-level statements and unread declarations once, when the route module loads', async () => {
    const route = await loadRoute(
      `${head}import { track } from './track'
const registry = new Map<string, number>()
registry.set('k', 1)
track('statement')
const unused = track('unused')
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
      ['statement', 'unused', 'if'],
      '<p>1</p>',
      '<p>1</p>',
      ['statement', 'unused', 'if'],
    ])
  })
})
