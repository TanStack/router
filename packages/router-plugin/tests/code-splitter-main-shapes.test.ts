/**
 * Route splitting does what main's splitter does wherever main's output works
 * (R153): the option values it splits, what an exported option value does,
 * one instance of module state however many options read it, and top-level
 * code that runs once. Loaded the way an app loads it (`route-app.ts`), and
 * asserted on what the page shows: rendered output, which options load
 * lazily, init counts and identity. The cases follow main's code-splitter
 * fixtures.
 */
import { describe, expect, it } from 'vitest'
import {
  diagnosticPosition,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { expectNoProblems } from '@tanstack/compiler-test-utils/diagnostic-channel'
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

// What `main`'s chunk copies (or takes alone) leaves the route file's
// production output with it: the option is split, and what only split code
// reads loads with the chunk, however the route file also names it (an
// export other than `export const|let|var`, a statement, an overload).
// Inputs of review-main-shape-guarantee.md (causes A to E), each with a
// marker in the route file's own code that only the component reads.
// R1 (review-phase1 3.1): a chunk copying state the route module keeps
// also copies the top-level code reaching it through other names, as
// main's chunk keeps it (main's chunk drops no statement reading a name it
// still declares, no class, no never-read declaration): the component reads
// the value the route module computed at load. Kind A: each failed at
// cb9d1331b2 (the chunk held the state without the code changing it).
describe('a chunk copies the load-time code reaching what it copies', () => {
  it.each([
    {
      name: 'a function the module calls at load (`bump()`)',
      decls: `let count = 0
function bump() { count++ }
bump()`,
      read: 'count',
      html: '<p>1</p>',
    },
    {
      name: 'a registry filled through a helper',
      decls: `const registry = new Map<string, number>()
function register(k: string, v: number) { registry.set(k, v) }
register('a', 1)`,
      read: "registry.get('a')",
      html: '<p>1</p>',
    },
    {
      name: 'a write through an alias',
      decls: `const cfg = { url: 'a' }
const alias = cfg
alias.url = 'b'`,
      read: 'cfg.url',
      html: '<p>b</p>',
    },
    {
      name: 'a class static block',
      decls: `const routes: Array<string> = []
class Boot { static { routes.push('boot') } }`,
      read: 'routes.length',
      html: '<p>1</p>',
    },
    {
      name: 'a never-read declaration',
      decls: `const registry = new Map<string, number>()
const _boot = registry.set('a', 1)`,
      read: "registry.get('a')",
      html: '<p>1</p>',
    },
    // (review-a1-classes-stay-round2 q1, q3: only its own text or a type names
    // it, so nothing else of the source reads it: `main`'s chunk keeps it)
    {
      name: 'a declaration only it names itself',
      decls: `const routes: Array<string> = []
const reg: any = (routes.push('x'), { again: () => reg })`,
      read: 'routes.length',
      html: '<p>1</p>',
    },
    {
      // a type never keeps a value (user decision, 2026-11-25; main runs
      // it): an annotation of code that stays names what it names, and the
      // declaration leaves with its evaluation
      name: 'a declaration only a type names leaves',
      decls: `const routes: Array<string> = []
const defaults = (routes.push('home'), { a: 1 })
type Defaults = typeof defaults
export function format(d: Defaults) { return JSON.stringify(d) }`,
      read: 'routes.length',
      html: '<p>0</p>',
    },
    // (review-phase1 r5; R163: a class stays and is copied as a statement is)
    {
      name: 'a class static block whose class only an export reads',
      decls: `const routes: Array<string> = []
class Boot { static { routes.push('boot') } }
export const boot = Boot`,
      read: 'routes.length',
      html: '<p>1</p>',
    },
  ])('$name', async ({ decls, read, html }) => {
    const route = await loadRoute(
      `${head}${decls}
export const Route = createFileRoute('/')({ component: () => <p>{String(${read})}</p> })
`,
    )
    await expectValidModules(route)
    expect(await route.renderLazy('component')).toEqual({
      lazy: true,
      html,
    })
  })

  // O1 (review-phase1-final 3.1): code reaching a copied binding only
  // through a binding the chunk imports (an `export const`) is not copied:
  // the imported binding is the route module's one instance, already set
  // up there. Kind A: at bd4b7c6d23 the chunk ran `state.n++` again (2).
  it('does not copy code reaching what it copies only through a binding it imports', async () => {
    const route = await loadRoute(
      `${head}const defaults = { n: 0 }
export const state = { ...defaults }
state.n++
function Comp() { return <p>{defaults.n}/{state.n}</p> }
export const Route = createFileRoute('/')({ component: Comp })
`,
    )
    await expectValidModules(route)
    expect(await route.renderLazy('component')).toEqual({
      lazy: true,
      html: '<p>0/1</p>',
    })
  })
})

// R163 (coverage-review-A 1): `main` never removes a class, an enum or a
// namespace from the route module, so its body runs when the route module
// loads, also when only a split option reads it; the chunk copies it. A
// loader reading what the body did reads it before the chunk loads.
describe('a class, enum or namespace only split code reads runs with the route module', () => {
  it.each([
    {
      name: 'a class static block',
      decls: `const handlers = new Map<string, () => string>()
class PageModel { static { handlers.set('page', () => 'handled') } title = 'model' }`,
      loader: `handlers.get('page')?.() ?? 'missing'`,
      read: 'new PageModel().title',
      values: ['handled', '<p>model</p>'],
    },
    {
      name: 'a class static field initialiser',
      decls: `class Feature { static enabled = ((globalThis as any).caseFeature = 'on') }`,
      loader: `(globalThis as any).caseFeature ?? 'off'`,
      read: 'Feature.enabled',
      values: ['on', '<p>on</p>'],
    },
    {
      name: 'a class extending an import whose module has an effect',
      decls: `import { Base } from './base'
class Model extends Base { title = 'model' }`,
      loader: `(globalThis as any).caseBase ?? 'not-loaded'`,
      read: 'new Model().title',
      values: ['loaded', '<p>model</p>'],
    },
    {
      name: 'a class static block filling a registry the loader reads',
      decls: `const registry: Array<string> = []
class Entry { static { registry.push('entry') } }`,
      loader: 'registry.length',
      read: 'typeof Entry',
      values: [1, '<p>function</p>'],
    },
    {
      name: 'a namespace body',
      decls: `namespace Boot { (globalThis as any).caseBoot = 'booted'; export function name() { return 'boot' } }`,
      loader: `(globalThis as any).caseBoot ?? 'not-booted'`,
      read: 'Boot.name()',
      values: ['booted', '<p>boot</p>'],
    },
    {
      name: 'an enum member initialiser',
      decls: `const seen: Array<string> = []
enum Kind { A = (seen.push('enum'), 'a') }`,
      loader: 'seen.length',
      read: 'Kind.A',
      values: [1, '<p>a</p>'],
    },
  ])('$name', async ({ decls, loader, read, values }) => {
    const route = await loadRoute(
      `${head}${decls}
function Page() { return <p>{String(${read})}</p> }
export const Route = createFileRoute('/')({
  loader: () => ${loader},
  component: Page,
})
`,
      {
        files: {
          'base.ts': `export class Base {}
;(globalThis as any).caseBase = 'loaded'
`,
        },
      },
    )
    await expectValidModules(route)
    expect(await route.isLazy('component')).toBe(true)
    expect(
      await route.run(`const loaded = await options.loader()
return [loaded, await render('component')]`),
    ).toEqual(values)
  })

  // `main` shares a class two option groups read: one instance, its
  // body run once, in the module both chunks import
  it('creates a class two split options read once', async () => {
    const route = await loadRoute(
      `${head}const registry: Array<string> = []
class Entry { static { registry.push('entry') } }
export const Route = createFileRoute('/')({
  component: () => <p>{registry.length}{String(new Entry() instanceof Entry)}</p>,
  errorComponent: () => <p>{registry.length}{typeof Entry}</p>,
})
`,
    )
    await expectValidModules(route)
    expect(await route.isLazy('component')).toBe(true)
    expect(await route.isLazy('errorComponent')).toBe(true)
    expect(
      await route.run(
        `return [await render('component'), await render('errorComponent')]`,
      ),
    ).toEqual(['<p>1true</p>', '<p>1function</p>'])
  })
})

// R163 clarification (review-a1-classes-stay 1): route splitting never
// removes a class, enum or namespace, whatever names it, by value or in a
// type, in split or kept text: its body runs when the route module loads, as
// on `main`, and so does an import only it reads.
describe('a class, enum or namespace named only in a type runs with the route module', () => {
  const G = '(globalThis as any)'
  it.each([
    {
      name: 'a class in a type annotation of the component',
      decls: `class M { static made = (${G}.caseM = 'made'); v = 1 }
function Page() { const m: M | null = null; return <p>{String(m)}</p> }`,
      loader: `${G}.caseM ?? 'not-made'`,
      values: ['made', '<p>null</p>'],
    },
    {
      name: 'an enum as a type of the component',
      decls: `const mark = (s: string) => { ${G}.caseE = 'made'; return s }
enum Kind { A = mark('a') as any }
function Page() { const k: Kind | null = null; return <p>{String(k)}</p> }`,
      loader: `${G}.caseE ?? 'not-made'`,
      values: ['made', '<p>null</p>'],
    },
    {
      name: 'a namespace whose type the component names',
      decls: `namespace Boot { ${G}.caseBoot = 'booted'; export type T = string; export const v = 1 }
function Page() { const t: Boot.T | null = null; return <p>{String(t)}</p> }`,
      loader: `${G}.caseBoot ?? 'not-booted'`,
      values: ['booted', '<p>null</p>'],
    },
    {
      name: 'a class the component names through typeof',
      decls: `class M { static made = (${G}.caseM = 'made'); v = 1 }
function Page() { const m: typeof M | null = null; return <p>{String(m)}</p> }`,
      loader: `${G}.caseM ?? 'not-made'`,
      values: ['made', '<p>null</p>'],
    },
    {
      name: 'a class extending an import with an effect, as a prop type',
      decls: `import { Base } from './base'
class Model extends Base { title = 'model' }
function Page(props: { m?: Model }) { return <p>{String(props.m)}</p> }`,
      loader: `${G}.caseBase ?? 'not-loaded'`,
      values: ['loaded', '<p>undefined</p>'],
    },
    {
      name: 'a decorated class the component names as a type',
      decls: `const define = (tag: string) => (_target: unknown) => { ${G}.caseDefined = tag }
@define('x-el')
class XEl {}
function Page() { const el: XEl | null = null; return <p>{String(el)}</p> }`,
      loader: `${G}.caseDefined ?? 'not-defined'`,
      values: ['x-el', '<p>null</p>'],
    },
    // (the component reads the route, whose options name the class in a
    // type: the split leaves the class's readers unchanged)
    {
      name: 'a class in a type annotation of the loader that stays',
      decls: `class M { static made = (${G}.caseM = 'made'); v = 1 }
function Page() { return <p>{typeof Route}</p> }`,
      loader: `{ const m: M | null = null; return String(m) + (${G}.caseM ?? 'not-made') }`,
      values: ['nullmade', '<p>object</p>'],
    },
  ])('$name', async ({ decls, loader, values }) => {
    const route = await loadRoute(
      `${head}${decls}
export const Route = createFileRoute('/')({
  loader: () => ${loader},
  component: Page,
})
`,
      {
        tsconfig: { experimentalDecorators: true },
        files: {
          'base.ts': `export class Base {}
;(globalThis as any).caseBase = 'loaded'
`,
        },
      },
    )
    await expectValidModules(route)
    expect(await route.isLazy('component')).toBe(true)
    expect(
      await route.run(`const loaded = await options.loader()
return [loaded, await render('component')]`),
    ).toEqual(values)
  })
})

// TypeScript's decorator metadata (`emitDecoratorMetadata` with
// `experimentalDecorators`: DI containers, ORMs, validation DTOs) reads the
// classes a decorated member names in its types when the class is defined:
// the import a type names is a value the class reads, in the route module as
// in a chunk (`main` keeps it; astra-r3 fact-check B3).
describe('decorator metadata records the classes a decorated class names in its types', () => {
  const declaration = `import { Dep, Model } from './model'
import * as shapes from './model'
const seen = (..._args: Array<unknown>): any => {}
@seen
class Entity {
  constructor(readonly dep: Dep) {}
  @seen model!: Model
  @seen with(other: shapes.Other): Model { return other as any }
}
const recorded = () => (Entity as any).recorded.join(' ')`
  it.each([
    { name: 'a loader that stays', loader: 'recorded()', component: '<p />' },
    {
      name: 'the split component',
      loader: "'none'",
      component: '<p>{recorded()}</p>',
    },
  ])('read by $name', async ({ name, loader, component }) => {
    const route = await loadRoute(
      `${head}${declaration}
export const Route = createFileRoute('/')({
  loader: () => ${loader},
  component: () => ${component},
})
`,
      {
        tsconfig: {
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          verbatimModuleSyntax: false,
        },
        files: {
          'model.ts': `export class Dep {}
export class Model {}
export class Other {}
`,
        },
        // (what `reflect-metadata` does, recorded on the class)
        pageScript: `Reflect.metadata = (key, value) => (target, member) => {
  const owner = typeof target === 'function' ? target : target.constructor
  const show = (v) => Array.isArray(v) ? '[' + v.map(show) + ']' : v.name
  ;(owner.recorded ??= []).push(key + (member ? '(' + member + ')' : '') + '=' + show(value))
}`,
      },
    )
    expect(await route.isLazy('component')).toBe(true)
    const expected =
      'design:type(model)=Model design:returntype(with)=Model design:paramtypes(with)=[Other] design:type(with)=Function design:paramtypes=[Dep]'
    expect(
      await route.run(`const loaded = await options.loader()
return [loaded, await render('component')]`),
    ).toEqual(
      name === 'the split component'
        ? ['none', `<p>${expected}</p>`]
        : [expected, '<p></p>'],
    )
  })
})

// Only erasure removes one:a class, enum or namespace that an erased option
// (`deleteNodes`, Start's client `server`) names, by value or in a type, and
// that nothing staying reads by value leaves the client with its imports,
// against `main`, which ships it (leaks block whatever `main` does;
// review-a1-classes-stay 3, round 2 (b)).
describe('a class, enum or namespace only a deleted option names stays off the client', () => {
  const G = '(globalThis as any)'
  const handlers = (value: string) =>
    `server: { handlers: { GET: () => new Response(String(${value})) } },`
  it.each([
    {
      name: 'a class',
      decls: `class Db { static made = (${G}.caseDb = 'made'); q() { return 'SERVER_ONLY_CANARY' } }
function Page() { return <p>{String(${G}.caseDb)}</p> }`,
      server: handlers('new Db().q()'),
    },
    {
      name: 'a class reading an import',
      decls: `import { secret } from './secret'
class Db { static made = (${G}.caseDb = 'made'); q() { return secret } }
function Page() { return <p>{String(${G}.caseDb)}</p> }`,
      server: handlers('new Db().q()'),
    },
    {
      name: 'a namespace',
      decls: `namespace Srv { ${G}.caseDb = 'made'; export const key = () => 'SERVER_ONLY_CANARY' }
function Page() { return <p>{String(${G}.caseDb)}</p> }`,
      server: handlers('Srv.key()'),
    },
    // (R163 round 2 (b): erased text naming it in a type is enough)
    {
      name: 'a class reading an import, which the deleted option names in a type',
      decls: `import { secret } from './secret'
class Db { static made = (${G}.caseDb = 'made'); q() { return secret } }
function Page() { return <p>{String(${G}.caseDb)}</p> }`,
      server: `server: { handlers: { GET: () => { const d: Db | null = null; return new Response(String(d)) } } },`,
    },
    {
      name: 'a class the component names as a type',
      decls: `class Db { static made = (${G}.caseDb = 'made'); q() { return 'SERVER_ONLY_CANARY' } }
function Page(props: { db?: Db }) { return <p>{String(${G}.caseDb)}{String(props.db)}</p> }`,
      server: handlers('new Db().q()'),
    },
  ])('$name', async ({ decls, server }) => {
    const route = await loadRoute(
      `${head}${decls}
export const Route = createFileRoute('/')({
  ${server}
  component: Page,
})
`,
      {
        deleteNodes: ['server'],
        files: {
          'secret.ts': `export const secret = 'SERVER_ONLY_CANARY'
`,
        },
      },
    )
    await expectValidModules(route)
    expect(
      await route.run(
        `return ['server' in options, await render('component'), globalThis.caseDb]`,
      ),
    ).toEqual([false, expect.stringMatching(/^<p>undefined/), undefined])
    expect(await route.requested()).not.toContain('/secret.ts')
    expect((await route.production()).where('SERVER_ONLY_CANARY')).toBe(
      'nowhere',
    )
  })
})

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
