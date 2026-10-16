import { transformWithOxc } from 'vite'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  compileRouteModules,
  componentChunk,
  evaluateModule,
  expectValidModules,
  exportedNames,
  head,
  importSources,
  importedNames,
  loadRoute,
  transformWithRouteHmrPlugin,
} from './regression-helpers'

describe('each module imports only the specifiers it reads', () => {
  // Source: React Router route-chunks-test.ts "functions referencing their own
  // identifiers"; babel-dead-code-elimination dead-code-elimination.test.ts
  // "import" > "mixed default and named" and "namespace"
  it('splits default, named and namespace specifiers between the modules', async () => {
    const { modules } =
      compileRouteModules(`${head}import defaultMessage, { targetMessage, otherMessage } from './messages'
import * as messages from './messages'
import other, * as ns from './other'
const getDefault = () => defaultMessage
const getTarget = () => targetMessage
const getOther = () => otherMessage
function getNamespaced() {
  return messages.namespaced
}
export const Route = createFileRoute('/')({
  loader: () => [getOther(), other],
  component: () => <div>{getDefault()}{ns.x}</div>,
  errorComponent: () => <div>{getNamespaced()}</div>,
  notFoundComponent: () => <div>{getTarget()}</div>,
})
`)
    const imports = (module: string, source: string) =>
      importedNames(modules[module]!, source)
    expect(imports('reference', './messages')).toEqual(['otherMessage'])
    expect(imports('reference', './other')).toEqual(['default'])
    expect(imports('virtual component', './messages')).toEqual(['default'])
    expect(imports('virtual component', './other')).toEqual(['*'])
    expect(imports('virtual errorComponent', './messages')).toEqual(['*'])
    expect(imports('virtual notFoundComponent', './messages')).toEqual([
      'targetMessage',
    ])
    await expectValidModules(modules)
  })

  it('moves a specifier with a string name into the chunk', async () => {
    const { modules } =
      compileRouteModules(`${head}import { "kebab-name" as Kebab } from './icons'
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <Kebab />,
})
`)
    expect(importedNames(modules['virtual component']!, './icons')).toEqual([
      'kebab-name',
    ])
    expect(importSources(modules.reference!)).not.toContain('./icons')
    await expectValidModules(modules)
  })

  // Source: babel-dead-code-elimination dead-code-elimination.test.ts "import" >
  // "mixed default and named: none used" and "side-effect"
  it('removes an import whose specifiers all moved instead of leaving a side-effect import', async () => {
    const code = `${head}import a, { b } from 'pkg'
import './styles.css'
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{a}{b}</p>,
})
`
    const { modules } = compileRouteModules(code)
    // React HMR rewrites the reference module before unused code is removed.
    const hmrReference = compileRouteModules(code, { hmr: true }).modules
      .reference!
    for (const reference of [modules.reference!, hmrReference]) {
      expect(importSources(reference)).toContain('./styles.css')
      expect(importSources(reference)).not.toContain('pkg')
    }
    expect(importedNames(modules['virtual component']!, 'pkg')).toEqual([
      'b',
      'default',
    ])
    await expectValidModules(modules)
  })

  // Import attributes change what a module is (`type: 'json'`, a bundler
  // macro), so they move with the import.
  it('keeps the attributes of an import moved into the chunk', async () => {
    const { modules } =
      compileRouteModules(`${head}import { test } from './test' with { type: 'macro' }
export const Route = createFileRoute('/')({
  component: () => test,
})
`)
    expect(importSources(modules.reference!)).not.toContain('./test')
    expect(modules['virtual component']).toMatch(
      /import\s*\{\s*test\s*\}\s*from\s*["']\.\/test["']\s*with\s*\{\s*type:\s*["']macro["']\s*\}/,
    )
    await expectValidModules(modules)
  })

  // Import assertions (`assert { type: 'json' }`) are the deprecated form of
  // import attributes; the modules the code splitter emits use the `with`
  // keyword, which current runtimes and bundlers accept.
  it('compiles an import assertion of a route file into an import attribute', async () => {
    const route = await loadRoute(
      `${head}import data from './data.json' assert { type: 'json' }
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{data.title}</p>,
})
`,
      { stubs: { './data.json': '{ "title": "from json" }' } },
    )
    const importers = Object.values(route.modules).filter((code) =>
      importSources(code).includes('./data.json'),
    )
    expect(importers.length).toBeGreaterThan(0)
    for (const code of importers) {
      expect(code).toMatch(
        /from\s*["']\.\/data\.json["']\s*with\s*\{\s*type:\s*["']json["']\s*\}/,
      )
      expect(code).not.toMatch(/\bassert\s*\{/)
    }
    expect((await route.load('component'))()).toBe('<p>from json</p>')
  })

  // With React's classic JSX runtime (`jsx: "react"` in tsconfig), JSX
  // compiles to `React.createElement`, so a React import that the TypeScript
  // code only uses in types must stay.
  it.each([
    { name: 'split chunk', compile: componentChunk },
    {
      name: 'route module compiled for HMR',
      compile: (code: string) => transformWithRouteHmrPlugin(code),
    },
  ])(
    'keeps the React import of the $name for classic JSX',
    async ({ compile }) => {
      const output = compile(`import * as React from 'react'
${head}function Page({ title = 'classic' }: { title?: React.ReactNode }) {
  return <p>{title}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`)
      const { code } = await transformWithOxc(output, 'module.tsx', {
        jsx: { runtime: 'classic' },
      })
      expect(importedNames(code, 'react')).toEqual(['*'])
    },
  )

  it('keeps the React import of a split chunk with inline JSX when only a top-level type reads React', async () => {
    const chunk = componentChunk(`import * as React from 'react'
${head}type Title = React.ReactNode
export const Route = createFileRoute('/')({ component: () => <p>classic</p> })
`)
    const { code } = await transformWithOxc(chunk, 'module.tsx', {
      jsx: { runtime: 'classic' },
    })
    expect(importedNames(code, 'react')).toEqual(['*'])
  })
})

describe('exports of the route file', () => {
  it.each([
    { name: 'as-is', exports: 'export { Foo }' },
    { name: 'renamed', exports: 'export { Foo as Bar }' },
  ])(
    'are not redeclared when they re-export an import $name',
    async ({ exports }) => {
      const { modules } =
        compileRouteModules(`${head}import { Foo } from './foo'
${exports}
export const Route = createFileRoute('/')({ component: Page })
function Page() {
  return <Foo />
}
`)
      await expectValidModules(modules)
    },
  )

  it('are not redeclared when destructured next to a non-exported binding', async () => {
    const { modules } = compileRouteModules(`${head}const { a, b } = getStuff()
export { a }
export const Route = createFileRoute('/')({
  component: () => <div>{a}{b}</div>,
})
`)
    await expectValidModules(modules)
  })

  it.each([
    {
      name: 'function',
      declaration: 'function () {\n  return null\n}',
      type: 'function',
    },
    { name: 'class', declaration: 'class {\n  x = 1\n}', type: 'class' },
  ])(
    'keep an anonymous default-exported $name valid in every module',
    async ({ declaration, type }) => {
      const route = await loadRoute(`${head}const cache = new Map()
function Page() {
  return <div>{cache.size}</div>
}
export const Route = createFileRoute('/')({
  loader: () => cache.get('x'),
  component: Page,
})
export default ${declaration}
`)
      await expectValidModules(route.modules)
      const exported = route.exports.default
      expect(typeof exported).toBe('function')
      expect(type === 'class' ? new exported().x : exported()).toBe(
        type === 'class' ? 1 : null,
      )
      expect((await route.load('component'))()).toBe('<div>0</div>')
    },
  )

  it('stay exported through an export list next to bindings the route module shares', async () => {
    const route = await loadRoute(
      `${head}import { createStore } from './store'
const store = createStore()
const Route = createFileRoute('/')({
  loader: () => store.get(),
  component: () => <p>{store.get()}</p>,
})
const title = 'title'
export { Route, title }
`,
      { stubs: { './store': { createStore: () => ({ get: () => 'value' }) } } },
    )
    expect(exportedNames(route.modules.reference!)).toEqual(['Route', 'title'])
    expect(route.exports.title).toBe('title')
    expect([route.options.loader(), (await route.load('component'))()]).toEqual(
      ['value', '<p>value</p>'],
    )
    await expectValidModules(route.modules)
  })

  it("load the file route's split option without creating the code-based route of the module again", async () => {
    let created = 0
    const route = await loadRoute(
      `import { createFileRoute, createRoute } from '@tanstack/react-router'
export const legacy = createRoute({
  getParentRoute: () => null as any,
  path: '/legacy',
  component: () => <p>legacy</p>,
})
export const Route = createFileRoute('/')({
  component: () => <p>file</p>,
})
`,
      {
        stubs: {
          '@tanstack/react-router': {
            createRoute: (options: unknown) => {
              created++
              return { options }
            },
          },
        },
      },
    )
    expect(created).toBe(1)
    expect((await route.load('component'))()).toBe('<p>file</p>')
    expect(created).toBe(1)
  })

  // Source: Next.js ssg/getStaticProps/issue-31855 and multi-declarator-export
  it('keep one instance when declared in one statement and read by the chunk', async () => {
    const route = await loadRoute(`${head}export const a = { n: 0 },
  b = { n: 10 }
export const Route = createFileRoute('/')({
  component: () => {
    a.n++
    return <div>{a.n + b.n}</div>
  },
})
`)
    expect(exportedNames(route.modules.reference!)).toEqual(['Route', 'a', 'b'])
    expect((await route.load('component'))()).toBe('<div>11</div>')
    // The component updated the object the route module exports.
    expect(route.exports.a.n).toBe(1)
    await expectValidModules(route.modules)
  })

  // Source: #8504.
  it('keep working when the route module reassigns a binding declared with what the split component reads', async () => {
    const route =
      await loadRoute(`${head}let { title, visits } = { title: 'Home', visits: 0 }
export function reset() {
  visits = 0
  return visits
}
export function Title() {
  return <h1>{title}</h1>
}
export const Route = createFileRoute('/')({
  component: () => <Title />,
})
`)
    await expectValidModules(route.modules)
    expect([route.exports.reset(), (await route.load('component'))()]).toEqual([
      0,
      '<h1>Home</h1>',
    ])
  })

  it('keep module-level re-exports in the reference module', async () => {
    const { modules } = compileRouteModules(`${head}export * from './lib'
export * as lib from './lib'
export {}
const cache = new Map()
export const Route = createFileRoute('/')({
  loader: () => cache.size,
  component: () => <div>{cache.size}</div>,
})
`)
    expect(modules.reference).toMatch(/export \* from ['"]\.\/lib['"]/)
    expect(modules.reference).toMatch(/export \* as lib from ['"]\.\/lib['"]/)
    await expectValidModules(modules)
  })

  // An exported split option keeps working and keeps its identity, the other
  // options are still split, and when the exported option is not split the
  // compiler tells the developer once, naming the file and the binding.
  // Splitting it anyway is the goal, decided by the build (pinned in
  // known-bugs-code-splitter.test.ts, "page code exported from the route
  // file loads with its chunk").
  it.each([
    {
      name: 'an exported component, with the errorComponent split',
      code: `${head}export function Page() {
  return <p>page</p>
}
export const Route = createFileRoute('/')({
  component: Page,
  errorComponent: () => <p>error</p>,
})
`,
      split: 'errorComponent',
      option: 'component',
      binding: 'Page',
      value: '<p>page</p>',
    },
    {
      name: 'a default-exported component, with the notFoundComponent split',
      code: `${head}export const Route = createFileRoute('/home')({
  component: Home,
  notFoundComponent: NotFoundComponent,
})
function NotFoundComponent() {
  return <div>Not Found</div>
}
export default function Home() {
  return <h1>home</h1>
}
`,
      split: 'notFoundComponent',
      option: 'component',
      binding: 'default',
      value: '<h1>home</h1>',
    },
    {
      name: 'an exported loader, with the loader split',
      code: `${head}export function loaderFn() {
  return { foo: 'bar' }
}
function Layout() {
  return <main>layout</main>
}
export const Route = createFileRoute('/_layout')({
  codeSplitGroupings: [['loader'], ['component']],
  component: Layout,
  loader: loaderFn,
})
`,
      split: 'component',
      option: 'loader',
      binding: 'loaderFn',
      value: { foo: 'bar' },
    },
  ])(
    'keep working, and are reported once when not code-split: $name',
    async ({ code, split, option, binding, value }) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      onTestFinished(() => warn.mockRestore())
      const { ids } = compileRouteModules(code)
      const warnings = warn.mock.calls.map(([message]) => String(message))
      warn.mockClear()

      const route = await loadRoute(code)
      await expectValidModules(route.modules)
      expect(route.isLazy(split)).toBe(true)
      const loaded = await route.load(option)
      expect(loaded()).toEqual(value)
      if (option !== 'loader') {
        expect(loaded).toBe(route.exports[binding])
      }
      if (!route.isLazy(option)) {
        const name = binding === 'default' ? 'Home' : binding
        expect(warnings).toEqual([expect.stringContaining(ids.reference!)])
        expect(warnings[0]).toMatch(
          new RegExp(String.raw`\b(?:${name}|${option})\b`),
        )
      }
    },
  )
})

describe('TypeScript-only syntax', () => {
  it('erases type-only imports and exports from the split modules', async () => {
    // `./types` has no stub: a module that still imported a value from it
    // would fail to link.
    const route = await loadRoute(
      `${head}import type { User } from './types'
import { type Settings, defaults } from './settings'
export type * from './types'
export type { User }
const current: User | Settings = defaults
export const Route = createFileRoute('/')({
  loader: () => current,
  component: () => <div>{String(current)}</div>,
})
`,
      { stubs: { './settings': { defaults: 'defaults' } } },
    )
    for (const [name, code] of Object.entries(route.modules)) {
      expect(importedNames(code, './types'), name).toEqual([])
    }
    expect(
      Object.values(route.modules).some((code) =>
        importedNames(code, './settings').includes('defaults'),
      ),
    ).toBe(true)
    await expectValidModules(route.modules)
    expect([route.options.loader(), (await route.load('component'))()]).toEqual(
      ['defaults', '<div>defaults</div>'],
    )
  })

  // Ambient declarations (`declare ...`) have no runtime binding: the
  // environment provides the value (a <script> tag, a bundler define, a global).
  it.each([
    {
      name: 'a declare function',
      declaration: 'declare function track(event: string): void',
      use: 'track("x")',
      global: ['track', (event: string) => `tracked ${event}`],
      expected: 'tracked x',
    },
    {
      name: 'an exported declare function',
      declaration: 'export declare function track(event: string): void',
      use: 'track("x")',
      global: ['track', (event: string) => `tracked ${event}`],
      expected: 'tracked x',
    },
    {
      name: 'a declare enum',
      declaration: 'declare enum Flags { On = 1 }',
      use: 'Flags.On',
      global: ['Flags', { On: 1 }],
      expected: 1,
    },
    {
      name: 'a declare namespace',
      declaration:
        'declare namespace Analytics { function track(event: string): void }',
      use: 'Analytics.track("x")',
      global: ['Analytics', { track: (event: string) => `tracked ${event}` }],
      expected: 'tracked x',
    },
  ] as const)(
    'reads $name that the loader and the component use from the environment',
    async ({ declaration, use, global: [name, value], expected }) => {
      vi.stubGlobal(name, value)
      onTestFinished(() => {
        vi.unstubAllGlobals()
      })
      const route = await loadRoute(`${head}${declaration}
export const Route = createFileRoute('/ambient')({
  loader: () => ${use},
  component: () => <button onClick={() => ${use}}>{String(${use})}</button>,
})
`)
      await expectValidModules(route.modules)
      expect([
        route.options.loader(),
        (await route.load('component'))(),
      ]).toEqual([expected, `<button>${expected}</button>`])
    },
  )

  // An import the code only references from types (without `import type`)
  // is not imported by the route module when only the split component's
  // types reference it. (When only the loader's types do, the chunks import
  // it: pinned in known-bugs-code-splitter.test.ts.) Source: #8504.
  it('leaves an import only the split component references from types out of the route module', async () => {
    const { modules } =
      compileRouteModules(`${head}import { useState } from 'react'
import { Framework } from './projects'
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => {
    const [framework] = useState<Framework>('react')
    return <p>{framework}</p>
  },
})
`)
    expect(importSources(modules.reference!)).not.toContain('./projects')
    await expectValidModules(modules)
  })

  // Source: @babel/plugin-transform-typescript class/private-method-override;
  // #8504 (a guard against a parser bug, yuku-toolchain/yuku#257).
  it('gives the split component a class with an overloaded private method', async () => {
    const route = await loadRoute(`${head}class Parser {
  #parse(value: string): number
  #parse(value: number): string
  #parse(value: string | number): string | number {
    return typeof value === 'string' ? value.length : String(value)
  }
  run() {
    return [this.#parse('abc'), this.#parse(7)].join('|')
  }
}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{new Parser().run()}</p>,
})
`)
    await expectValidModules(route.modules)
    expect((await route.load('component'))()).toBe('<p>3|7</p>')
  })

  // An ambient var merged with an interface has no runtime declaration:
  // a declaration the loader and the split component share reads the
  // global. Source: TypeScript conformance test
  // expressions/functionCalls/overloadResolutionConstructors.ts; #8504.
  it('reads an ambient var merged with an interface from the environment in a shared declaration', async () => {
    vi.stubGlobal('readVersion', () => '1.0')
    onTestFinished(() => {
      vi.unstubAllGlobals()
    })
    const route = await loadRoute(`${head}interface readVersion {
  (): string
}
declare var readVersion: readVersion
const version = readVersion()
export const Route = createFileRoute('/')({
  loader: () => version,
  component: () => <p>{version}</p>,
})
`)
    await expectValidModules(route.modules)
    expect([route.options.loader(), (await route.load('component'))()]).toEqual(
      ['1.0', '<p>1.0</p>'],
    )
  })

  it('keeps the namespace import that an import alias refers to', () => {
    const chunk = componentChunk(`${head}import * as lib from './lib'
import Helper = lib.Helper
export const Route = createFileRoute('/')({
  component: () => <div>{Helper.x}</div>,
})
`)
    expect(importedNames(chunk, './lib')).toEqual(['*'])
    expect(chunk).toMatch(/\bHelper\s*=\s*lib\.Helper\b/)
  })

  // Source: Qwik optimizer test.rs example_ts_enums, example_exports
  it('gives the split component the enum and the overloaded function it uses', async () => {
    const { modules } = compileRouteModules(`${head}enum Tone { Loud = 'LOUD' }
function label(value: string): string
function label(value: unknown) { return 'label:' + String(value) }
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{[Tone.Loud, label('x')].join('|')}</p>,
})
`)
    await expectValidModules(modules)
    const chunk = await evaluateModule(modules['virtual component']!)
    expect(chunk.component!()).toBe('<p>LOUD|label:x</p>')
  })

  it.each([
    {
      // Source: @babel/plugin-transform-typescript enum/const
      name: 'a const enum',
      setup: `const enum Direction { Up = 1, Down }`,
      render: '[Direction.Up, Direction.Down].join()',
      expected: '1,2',
    },
    {
      // Sources: @babel/plugin-transform-typescript class/parameter-properties
      // and @babel/generator typescript/class-abstract
      name: 'an abstract class with parameter properties',
      setup: `abstract class Base {
  constructor(protected readonly label: string, public count = 2) {}
  abstract render(): string
}
class Item extends Base {
  declare extra: number
  render() { return this.label + this.count }
}`,
      render: "new Item('item').render()",
      expected: 'item2',
    },
  ])(
    'gives the split component $name it uses',
    async ({ setup, render, expected }) => {
      const { modules } = compileRouteModules(`${head}${setup}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{${render}}</p>,
})
`)
      await expectValidModules(modules)
      const chunk = await evaluateModule(modules['virtual component']!)
      expect(chunk.component!()).toBe(`<p>${expected}</p>`)
    },
  )

  // TypeScript lets a type and a value share a name; exporting both is valid.
  it.each([
    {
      name: 'a type alias and an export specifier',
      exports: `export type Post = { id: string }
function Post(id: string): Post {
  return { id }
}
export { Post }`,
    },
    {
      name: 'a type re-export and a value re-export',
      exports: `export type { Post } from './post-types'
export { Post } from './post-values'`,
    },
  ])(
    'exports a type and a value with the same name: $name',
    async ({ exports }) => {
      const code = `${head}${exports}
export const Route = createFileRoute('/posts')({
  component: () => <p>posts</p>,
})
`
      const { modules } = compileRouteModules(code)
      expect(exportedNames(modules.reference!)).toContain('Post')
      expect(exportedNames(transformWithRouteHmrPlugin(code))).toContain('Post')
      await expectValidModules(modules)
    },
  )

  it('keeps decorators before `export` for legacy decorator transforms', () => {
    // TypeScript `experimentalDecorators` and Babel `decorators-legacy` only
    // accept decorators before the `export` keyword.
    const { reference } =
      compileRouteModules(`${head}@observable export class Store { @observable count = 0 }
export const Route = createFileRoute('/')({ component: () => <div /> })
`).modules
    expect(reference).toMatch(/@observable\s+export class Store\b/)
  })
})
