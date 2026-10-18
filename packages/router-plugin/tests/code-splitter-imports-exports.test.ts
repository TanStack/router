import { parseSync as parseWithBabel } from '@babel/core'
import { parseSync, transformWithOxc } from 'vite'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import { build, clientMountEntry, routeApp } from './build-harness'
import {
  compileRouteModules,
  componentChunk,
  declaredNames,
  evaluateModule,
  expectValidModules,
  head,
  importSources,
  importedNames,
  loadRoute,
  routeSpecifier,
  transformWithRouteHmrPlugin,
} from './regression-helpers'

describe('each module imports only the specifiers it reads', () => {
  // Source: React Router route-chunks-test.ts "functions referencing their own
  // identifiers"; babel-dead-code-elimination dead-code-elimination.test.ts
  // "import" > "mixed default and named" and "namespace"
  it('splits default, named and namespace specifiers between the modules', async () => {
    const route = await loadRoute(
      `${head}import defaultMessage, { targetMessage, otherMessage } from './messages'
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
`,
      {
        stubs: {
          './messages': {
            default: 'default',
            targetMessage: 'target',
            otherMessage: 'other',
            namespaced: 'namespaced',
          },
          './other': { default: 'otherDefault', x: 'x' },
        },
      },
    )
    // The route module imports nothing only the split components read, and
    // no split chunk imports what only the loader reads.
    expect(importedNames(route.modules.reference!, './messages')).toEqual([
      'otherMessage',
    ])
    expect(importedNames(route.modules.reference!, './other')).toEqual([
      'default',
    ])
    for (const option of ['component', 'errorComponent', 'notFoundComponent']) {
      const chunk = route.chunkOf(option)
      expect(importedNames(chunk, './messages'), option).not.toContain(
        'otherMessage',
      )
      expect(importedNames(chunk, './other'), option).not.toContain('default')
    }
    await expectValidModules(route.modules)
    expect([
      route.options.loader(),
      (await route.load('component'))(),
      (await route.load('errorComponent'))(),
      (await route.load('notFoundComponent'))(),
    ]).toEqual([
      ['other', 'otherDefault'],
      '<div>defaultx</div>',
      '<div>namespaced</div>',
      '<div>target</div>',
    ])
  })

  it('keeps the other specifiers of the import a split component comes from', async () => {
    const route = await loadRoute(
      `${head}import { Page, title } from './page'
export const Route = createFileRoute('/')({
  loader: () => title,
  component: Page,
})
`,
      { stubs: { './page': { Page: () => '<p>page</p>', title: 'title' } } },
    )
    await expectValidModules(route.modules)
    expect(route.isLazy('component')).toBe(true)
    expect([route.options.loader(), (await route.load('component'))()]).toEqual(
      ['title', '<p>page</p>'],
    )
  })

  it('moves a specifier with a string name into the chunk', async () => {
    const route = await loadRoute(
      `${head}import { "kebab-name" as Kebab } from './icons'
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <Kebab />,
})
`,
      { stubs: { './icons': { 'kebab-name': () => 'kebab' } } },
    )
    expect(importSources(route.modules.reference!)).not.toContain('./icons')
    await expectValidModules(route.modules)
    expect((await route.load('component'))()).toBe('kebab')
  })

  // Source: babel-dead-code-elimination dead-code-elimination.test.ts "import" >
  // "mixed default and named: none used" and "side-effect"
  it.each([{ hmr: false }, { hmr: true }])(
    'removes an import whose specifiers all moved instead of leaving a side-effect import (hmr: $hmr)',
    async ({ hmr }) => {
      // React HMR rewrites the route module before unused code is removed.
      const route = await loadRoute(
        `${head}import a, { b } from 'pkg'
import './styles.css'
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{a}{b}</p>,
})
`,
        { hmr, stubs: { pkg: { default: 'a', b: 'b' }, './styles.css': {} } },
      )
      expect(importSources(route.modules.reference!)).toContain('./styles.css')
      expect(importSources(route.modules.reference!)).not.toContain('pkg')
      await expectValidModules(route.modules)
      expect((await route.load('component'))()).toBe('<p>ab</p>')
    },
  )

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
    // Every module that imports `./test` imports it with the attribute.
    const attributes = Object.values(modules).flatMap((code) =>
      parseSync('module.tsx', code, { sourceType: 'module' })
        .program.body.filter(
          (statement) =>
            statement.type === 'ImportDeclaration' &&
            statement.source.value === './test',
        )
        .map((statement: any) =>
          Object.fromEntries(
            statement.attributes.map((attribute: any) => [
              attribute.key.name ?? attribute.key.value,
              attribute.value.value,
            ]),
          ),
        ),
    )
    expect(attributes.length).toBeGreaterThan(0)
    expect(attributes).toEqual(attributes.map(() => ({ type: 'macro' })))
    await expectValidModules(modules)
  })

  // Import assertions (`assert { type: 'json' }`) are the deprecated form of
  // import attributes; the modules the code splitter emits use the `with`
  // keyword, which current runtimes and bundlers accept. Supporting `assert`
  // can be dropped (with this test) once nobody uses it (decision D9).
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
      compile: async (code: string) => transformWithRouteHmrPlugin(code),
    },
  ])(
    'keeps the React import of the $name for classic JSX',
    async ({ compile }) => {
      const output = await compile(`import * as React from 'react'
${head}function Page({ title = 'classic' }: { title?: React.ReactNode }) {
  return <p>{title}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`)
      const { code } = await transformWithOxc(output, 'module.tsx', {
        jsx: { runtime: 'classic' },
      })
      // `React.createElement` reads an imported `React`.
      expect(await getModuleErrors(code)).toEqual([])
    },
  )

  it('keeps the React import of a split chunk with inline JSX when only a top-level type reads React', async () => {
    const chunk = await componentChunk(`import * as React from 'react'
${head}type Title = React.ReactNode
export const Route = createFileRoute('/')({ component: () => <p>classic</p> })
`)
    const { code } = await transformWithOxc(chunk, 'module.tsx', {
      jsx: { runtime: 'classic' },
    })
    expect(await getModuleErrors(code)).toEqual([])
  })
})

describe('exports of the route file', () => {
  it.each([
    { name: 'as-is', exports: 'export { Foo }', exported: 'Foo' },
    { name: 'renamed', exports: 'export { Foo as Bar }', exported: 'Bar' },
  ])(
    'are not redeclared when they re-export an import $name',
    async ({ exports, exported }) => {
      const Foo = () => '<b>foo</b>'
      const route = await loadRoute(
        `${head}import { Foo } from './foo'
${exports}
export const Route = createFileRoute('/')({ component: Page })
function Page() {
  return <Foo />
}
`,
        { stubs: { './foo': { Foo } } },
      )
      await expectValidModules(route.modules)
      // Another module of the app imports the re-export (ruling P1)
      const importer = await route.importFromRoute(
        `export { ${exported} } from '${routeSpecifier}'`,
      )
      expect([importer[exported], (await route.load('component'))()]).toEqual([
        Foo,
        '<b>foo</b>',
      ])
    },
  )

  // That `getStuff` runs once is pinned in known-bugs-code-splitter.test.ts
  // ("module state that the reference module keeps for a destructuring with
  // one exported binding is initialized once"): the chunk calls it again.
  it('are not redeclared when destructured next to a non-exported binding', async () => {
    const route = await loadRoute(
      `${head}import { getStuff } from './stuff'
const { a, b } = getStuff()
export { a }
export const Route = createFileRoute('/')({
  component: () => <div>{a}{b}</div>,
})
`,
      { stubs: { './stuff': { getStuff: () => ({ a: 'A', b: 'B' }) } } },
    )
    await expectValidModules(route.modules)
    const importer = await route.importFromRoute(
      `export { a } from '${routeSpecifier}'`,
    )
    expect([importer.a, (await route.load('component'))()]).toEqual([
      'A',
      '<div>AB</div>',
    ])
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

  // Spec: what other modules import from the route file keeps working, as
  // the instances the route uses (not the route module's export list).
  it('stay importable through an export list next to bindings the route module shares', async () => {
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
    const other = await route.importFromRoute(
      `export { Route, title } from '${routeSpecifier}'`,
    )
    expect([other.title, other.Route]).toEqual(['title', route.Route])
    expect([route.options.loader(), (await route.load('component'))()]).toEqual(
      ['value', '<p>value</p>'],
    )
    await expectValidModules(route.modules)
  })

  it("load the file route's split option without creating the code-based route of the module again", async () => {
    let created = 0
    const route = await loadRoute(
      `import { createFileRoute, createRoute } from '@tanstack/react-router'
import { Route as rootRoute } from './__root'
export const legacy = createRoute({
  getParentRoute: () => rootRoute,
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
          './__root': { Route: { options: {} } },
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
    const other = await route.importFromRoute(
      `import { a, b } from '${routeSpecifier}'
export const read = () => [a.n, b.n]`,
    )
    expect((await route.load('component'))()).toBe('<div>11</div>')
    // The component updated the object other modules import.
    expect(other.read()).toEqual([1, 10])
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

  it('keep module-level re-exports importable', async () => {
    const route = await loadRoute(
      `${head}export * from './lib'
export * as lib from './lib'
export {}
const cache = new Map()
export const Route = createFileRoute('/')({
  loader: () => cache.size,
  component: () => <div>{cache.size}</div>,
})
`,
      { stubs: { './lib': { value: 'lib value' } } },
    )
    const other = await route.importFromRoute(
      `import { value, lib } from '${routeSpecifier}'
export const read = () => [value, lib.value]`,
    )
    expect(other.read()).toEqual(['lib value', 'lib value'])
    expect([route.options.loader(), (await route.load('component'))()]).toEqual(
      [0, '<div>0</div>'],
    )
    await expectValidModules(route.modules)
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
    {
      name: 'a component default-exported by name, with the errorComponent split',
      code: `${head}const Page = () => <p>page</p>
export default Page
export const Route = createFileRoute('/')({
  component: Page,
  errorComponent: () => <p>error</p>,
})
`,
      split: 'errorComponent',
      option: 'component',
      binding: 'default',
      declared: 'Page',
      value: '<p>page</p>',
    },
  ])(
    'keep working, and are reported once when not code-split: $name',
    async ({ code, split, option, binding, value, ...row }) => {
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
        const name =
          'declared' in row
            ? row.declared
            : binding === 'default'
              ? 'Home'
              : binding
        expect(warnings).toEqual([expect.stringContaining(ids.reference!)])
        expect(warnings[0]).toMatch(
          new RegExp(String.raw`\b(?:${name}|${option})\b`),
        )
      }
    },
  )

  it.each([
    {
      name: 'a default export of another binding',
      exports: `const meta = { title: 'home' }
export default meta`,
    },
    {
      name: 'an exported object destructuring',
      exports: `const config = { title: 't' }
export const { title } = config`,
    },
  ])(
    'do not keep an unexported component from being split: $name',
    async ({ exports }) => {
      const route = await loadRoute(`${head}${exports}
function Page() {
  return <p>page</p>
}
export const Route = createFileRoute('/')({ component: Page })
`)
      await expectValidModules(route.modules)
      expect(route.isLazy('component')).toBe(true)
      expect((await route.load('component'))()).toBe('<p>page</p>')
    },
  )

  it.each([
    {
      name: 'export function',
      declaration: `export function helper() {\n  return 'h'\n}`,
    },
    { name: 'export const', declaration: `export const helper = () => 'h'` },
  ])(
    'stay readable by a split component next to an exported option component ($name)',
    async ({ declaration }) => {
      const route = await loadRoute(`${head}${declaration}
export function NotFound() {
  return <i>nf</i>
}
export const Route = createFileRoute('/')({
  component: () => <p>{helper()}</p>,
  notFoundComponent: NotFound,
})
`)
      expect((await route.load('component'))()).toBe('<p>h</p>')
      expect(route.exports.helper()).toBe('h')
    },
  )

  // The chunk of a split option holds only what that option needs: an
  // exported component of another option is not copied into it.
  it.each([
    {
      name: 'export default function',
      declaration: `export default function NotFound() {\n  return <i>MARK_NF</i>\n}`,
    },
    {
      name: 'export default by name',
      declaration: `function NotFound() {\n  return <i>MARK_NF</i>\n}\nexport default NotFound`,
    },
    {
      name: 'export function',
      declaration: `export function NotFound() {\n  return <i>MARK_NF</i>\n}`,
    },
    {
      name: 'export const',
      declaration: `export const NotFound = () => <i>MARK_NF</i>`,
    },
  ])(
    "are not copied into another option's chunk ($name)",
    async ({ declaration }) => {
      const route = await loadRoute(`${head}${declaration}
export const Route = createFileRoute('/')({
  component: () => <p>page</p>,
  notFoundComponent: NotFound,
})
`)
      expect((await route.load('component'))()).toBe('<p>page</p>')
      expect((await route.load('notFoundComponent'))()).toBe('<i>MARK_NF</i>')
      const chunk = route.chunkOf('component')
      expect({
        declares: declaredNames(chunk).has('NotFound'),
        marker: chunk.includes('MARK_NF'),
      }).toEqual({ declares: false, marker: false })
    },
  )
})

describe('TypeScript-only syntax', () => {
  it('erases type-only imports and exports from the split modules', async () => {
    // `./types` has no stub: a module that still imported a value from it
    // would fail to link.
    const route = await loadRoute(
      `${head}import type { User } from './types'
import type * as Types from './types'
import { type Settings, defaults } from './settings'
export type * from './types'
export type * as types from './types'
export type { User }
const current: User | Types.Admin | Settings = defaults
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
  async function readsAmbientVar(verbatimModuleSyntax: boolean) {
    vi.stubGlobal('readVersion', () => '1.0')
    onTestFinished(() => {
      vi.unstubAllGlobals()
    })
    const route = await loadRoute(
      `${head}interface readVersion {
  (): string
}
declare var readVersion: readVersion
const version = readVersion()
export const Route = createFileRoute('/')({
  loader: () => version,
  component: () => <p>{version}</p>,
})
`,
      { verbatimModuleSyntax },
    )
    await expectValidModules(route.modules)
    expect([route.options.loader(), (await route.load('component'))()]).toEqual(
      ['1.0', '<p>1.0</p>'],
    )
  }

  it('reads an ambient var merged with an interface from the environment in a shared declaration', async () => {
    await readsAmbientVar(false)
  })

  // Bug: the route module and the split chunk import the ambient var from
  // the shared module (the interface of the same name stays in them and
  // counts as a read of the shared binding), and the shared module has no
  // runtime binding to export. TypeScript erasure without
  // `verbatimModuleSyntax` drops the unused import by chance.
  // Source: router-plugin src/core/code-splitter/compilers.ts:143-299
  // (shared bindings) and the shared imports it adds to every module.
  // Impact: with `verbatimModuleSyntax` (Vite reads it from tsconfig) the
  // client build fails ([MISSING_EXPORT] "readVersion" is not exported by
  // "routes/index.tsx?tsr-shared=1"); in dev the route module fails to load.
  // NEW (infra-fix H3, 2026-10-18).
  it.fails(
    'reads an ambient var merged with an interface from the environment in a shared declaration, with verbatimModuleSyntax',
    async () => {
      await readsAmbientVar(true)
    },
  )

  it('keeps the namespace import that an import alias refers to', async () => {
    const route = await loadRoute(
      `${head}import * as lib from './lib'
import Helper = lib.Helper
export const Route = createFileRoute('/')({
  component: () => <div>{Helper.x}</div>,
})
`,
      { stubs: { './lib': { Helper: { x: 'helper' } } } },
    )
    await expectValidModules(route.modules)
    expect((await route.load('component'))()).toBe('<div>helper</div>')
  })

  // Source: Qwik optimizer test.rs example_ts_enums, example_exports
  it('gives the split component the enum and the overloaded function it uses', async () => {
    const route = await loadRoute(`${head}enum Tone { Loud = 'LOUD' }
function label(value: string): string
function label(value: unknown) { return 'label:' + String(value) }
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{[Tone.Loud, label('x')].join('|')}</p>,
})
`)
    await expectValidModules(route.modules)
    expect((await route.load('component'))()).toBe('<p>LOUD|label:x</p>')
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
      const route = await loadRoute(`${head}${setup}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{${render}}</p>,
})
`)
      await expectValidModules(route.modules)
      expect((await route.load('component'))()).toBe(`<p>${expected}</p>`)
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
  ])(
    'exports a type and a value with the same name: $name',
    async ({ exports }) => {
      const code = `${head}${exports}
export const Route = createFileRoute('/posts')({
  component: () => <p>posts</p>,
})
`
      const stubs = {
        './post-values': { Post: (id: string) => ({ id }) },
      }
      const route = await loadRoute(code, { stubs })
      await expectValidModules(route.modules)
      const other = await route.importFromRoute(
        `export { Post } from '${routeSpecifier}'`,
      )
      expect(other.Post('1')).toEqual({ id: '1' })
      const hmr = await evaluateModule(transformWithRouteHmrPlugin(code), {
        ...stubs,
        '@tanstack/react-router': {
          createFileRoute: () => (options: unknown) => ({ options }),
        },
      })
      expect(hmr.Post!('2')).toEqual({ id: '2' })
    },
  )

  // Source: TanStack/router#6480 (an exported type that reads an imported
  // value kept the import in the client module); replaces router-utils
  // stripTypeExports "handles the issue #6480 scenario", which never checked
  // the symptom.
  it('drops an import that only an exported type and a split component read from the route module', async () => {
    const route = await loadRoute(
      `${head}import { secret } from './server-thing'
export type Secret = typeof secret
export const Route = createFileRoute('/')({
  component: () => <p>{secret}</p>,
})
`,
      { stubs: { './server-thing': { secret: 'server' } } },
    )
    await expectValidModules(route.modules)
    expect(importSources(route.modules.reference!)).not.toContain(
      './server-thing',
    )
    expect((await route.load('component'))()).toBe('<p>server</p>')
  })

  // With `verbatimModuleSyntax`, TypeScript keeps `import { type Db } from
  // './db'` as `import './db'`. A module a route file imports only for types
  // need not load in the client (ruling L3, 2026-10-17; same as the Start
  // client in start-plugin-core known-bugs-start-compiler.test.ts "a
  // server-only module imported only for a type specifier"). Only Vite reads
  // the app's tsconfig in this harness.
  describe('a module imported only for a type specifier, with verbatimModuleSyntax (vite)', () => {
    const files = {
      'tsconfig.json': JSON.stringify({
        compilerOptions: { verbatimModuleSyntax: true, jsx: 'react-jsx' },
      }),
      'db.ts': `;(globalThis as any).dbLoaded = 'MARK_DB_LOADED_END'
export type Db = { name: string }
`,
    }
    const route = `${head}import { type Db } from '../db'
function Page(props: { db?: Db }) {
  return <p>{props.db ? props.db.name : 'page'}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`

    // Control: the tsconfig is in effect (the same import, in a module the
    // code splitter does not compile, loads `db.ts`).
    it('loads with the module that imports it outside route files', async () => {
      const app = await build({
        bundler: 'vite',
        env: 'client',
        files: routeApp(route, {
          env: 'client',
          files: {
            ...files,
            'entry.ts': `import { type Db } from './db'\n${clientMountEntry}`,
          },
        }),
      })
      expect(app.where('MARK_DB_LOADED_END')).toBe('eager')
    }, 60_000)

    it('does not load in the client of a split route file, which renders', async () => {
      const app = await build({
        bundler: 'vite',
        env: 'client',
        files: routeApp(route, { env: 'client', files }),
      })
      const run = await app.run(
        `await entry.mount(entry.Route.options.component)
return globalThis.dbLoaded ?? null`,
      )
      expect({
        where: app.where('MARK_DB_LOADED_END'),
        loaded: run.result,
        html: run.html,
      }).toEqual({
        where: 'nowhere',
        loaded: null,
        html: '<div id="root"><p>page</p></div>',
      })
    }, 60_000)
  })

  it('keeps decorators before `export` for legacy decorator transforms', () => {
    // TypeScript `experimentalDecorators` and Babel `decorators-legacy` only
    // accept decorators before the `export` keyword: every emitted module
    // must still parse with them.
    const { modules } =
      compileRouteModules(`${head}import { injectable } from 'tsyringe'
import { observable } from 'mobx'
@injectable() export class Store { @observable count = 0 }
export const Route = createFileRoute('/')({
  loader: () => new Store().count,
  component: () => <div />,
})
`)
    expect(Object.keys(modules).length).toBeGreaterThan(1)
    for (const code of Object.values(modules)) {
      expect(() =>
        parseWithBabel(code, {
          babelrc: false,
          configFile: false,
          filename: 'module.tsx',
          parserOpts: { plugins: ['typescript', 'jsx', 'decorators-legacy'] },
        }),
      ).not.toThrow()
    }
  })

  // Auto-accessor fields (TypeScript 4.9+, ES decorators; MobX 6 and Lit use
  // them). Compiled only: the module evaluator does not run `accessor`.
  it('compiles a class with an auto-accessor field that the split component uses', async () => {
    const { modules } =
      compileRouteModules(`${head}class Store { accessor count = 1 }
const store = new Store()
export const Route = createFileRoute('/')({
  loader: () => store,
  component: () => <p>{store.count}</p>,
})
`)
    await expectValidModules(modules)
  })
})
