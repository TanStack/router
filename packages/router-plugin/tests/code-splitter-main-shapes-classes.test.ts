/**
 * Route splitting does what main's splitter does wherever main's output works
 * (R153): the load-time code a chunk copies with the state it copies, and
 * where classes, enums and namespaces run.
 * Loaded the way an app loads it (`route-app.ts`), and asserted on what the
 * page shows: rendered output, which options load lazily, init counts and
 * identity. The cases follow main's code-splitter fixtures; the file is one
 * of four (code-splitter-main-shapes*.test.ts).
 */
import { describe, expect, it } from 'vitest'
import { expectValidModules, head, loadRoute } from './route-app'

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
