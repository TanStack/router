import { transformWithOxc } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import {
  compileRouteModules,
  componentChunk,
  declarationOf,
  evaluateModule,
  expectValidModules,
  exportedNames,
  head,
  importSources,
  importedNames,
  loadRouteModules,
  requestedSources,
  transformWithRouteHmrPlugin,
} from './regression-helpers'

describe('each module imports only the specifiers it reads', () => {
  // Source: React Router route-chunks-test.ts "functions referencing their own
  // identifiers"; babel-dead-code-elimination dead-code-elimination.test.ts
  // "import" > "mixed default and named" and "namespace"
  it('splits default, named and namespace specifiers between the modules', async () => {
    const { modules, sharedBindings } =
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
    expect(sharedBindings).toEqual([])
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
    { name: 'function', declaration: 'function () {\n  return null\n}' },
    { name: 'class', declaration: 'class {\n  x = 1\n}' },
  ])(
    'keep an anonymous default-exported $name valid in every module',
    async ({ declaration }) => {
      const { modules } = compileRouteModules(`${head}const cache = new Map()
function Page() {
  return <div>{cache.size}</div>
}
export const Route = createFileRoute('/')({
  loader: () => cache.get('x'),
  component: Page,
})
export default ${declaration}
`)
      expect(Object.keys(modules)).toContain('shared')
      await expectValidModules(modules)
    },
  )

  // Source: Next.js ssg/getStaticProps/issue-31855 and multi-declarator-export
  it('are imported by the chunk when declared in one statement', async () => {
    const { modules } = compileRouteModules(`${head}export const a = 1,
  b = 2
export const Route = createFileRoute('/')({
  component: () => <div>{a + b}</div>,
})
`)
    expect(exportedNames(modules.reference!)).toEqual(['Route', 'a', 'b'])
    const chunk = modules['virtual component']!
    // From the route module, or from the shared module the route module
    // re-exports them from.
    expect(
      [
        ...importedNames(chunk, 'route.tsx'),
        ...importedNames(chunk, 'route.tsx?tsr-shared=1'),
      ].sort(),
    ).toEqual(['a', 'b'])
    expect(chunk).not.toMatch(declarationOf('a'))
    expect(chunk).not.toMatch(declarationOf('b'))
    await expectValidModules(modules)
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

  // A chunk that re-exported `export *` would depend on all of `./lib`
  // through the opaque namespace of its dynamic import, which defeats
  // tree-shaking of it.
  it('keep module-level export * out of the split chunks', () => {
    const { modules } = compileRouteModules(`${head}export * from './lib'
export const Route = createFileRoute('/')({
  component: () => <p>index</p>,
})`)
    expect(requestedSources(modules.reference!)).toContain('./lib')
    const chunksRequestingLib = Object.keys(modules).filter(
      (name) =>
        name.startsWith('virtual ') &&
        requestedSources(modules[name]!).includes('./lib'),
    )
    expect(chunksRequestingLib).toEqual([])
  })

  // Source: Next.js ssg/getStaticProps/should-remove-extra-named-export-speicifers,
  // should-support-full-re-export and should-support-class-exports
  it('keep re-exports and a default-exported class out of the split chunks', async () => {
    const { modules } =
      compileRouteModules(`${head}import * as React from 'react'
export { getPaths, a as getProps } from './lib'
export { foo, bar as baz } from './lib'
export { helper } from './default-lib'
export default class Test extends React.Component {
  render() {
    return <div>test</div>
  }
}
export const Route = createFileRoute('/')({
  component: () => <div>home</div>,
})
`)
    expect(exportedNames(modules.reference!)).toEqual([
      'Route',
      'baz',
      'default',
      'foo',
      'getPaths',
      'getProps',
      'helper',
    ])
    for (const name of [
      'virtual component',
      'virtual errorComponent',
      'virtual notFoundComponent',
    ]) {
      expect(requestedSources(modules[name]!)).not.toContain('./lib')
      expect(requestedSources(modules[name]!)).not.toContain('./default-lib')
      expect(modules[name]).not.toMatch(declarationOf('Test'))
    }
    await expectValidModules(modules)
  })

  // Source: Next.js ssg/getStaticProps/should-not-crash-for-class-declarations
  it('keep an exported class component in the route module', async () => {
    const { modules } =
      compileRouteModules(`${head}import * as React from 'react'
export class Page extends React.Component {
  render() {
    return <div>page</div>
  }
}
export const Route = createFileRoute('/')({ component: Page })
`)
    expect(modules.reference).toMatch(declarationOf('Page'))
    expect(exportedNames(modules.reference!)).toContain('Page')
    await expectValidModules(modules)
  })

  // Source: Next.js ssg/getStaticProps/should-remove-re-exported-function-declarations,
  // should-support-named-export-as-default and
  // should-support-export-named-as-default-with-a-class
  it.each([
    {
      name: 'export { Page as default }',
      code: `function Page() {
  return <div>page</div>
}
export { Page as default }`,
    },
    {
      name: 'export { Page as default, a } with a class',
      code: `import * as React from 'react'
class Page extends React.Component {
  render() {
    return <div>page</div>
  }
}
const a = 5
export { Page as default, a }`,
    },
    {
      name: 'export { Page as Renamed, kept as keptRenamed }',
      code: `const Page = () => <div>page</div>
const kept = () => 'kept'
export { Page as Renamed, kept as keptRenamed }`,
    },
  ])(
    'keep a component exported through $name in the route module',
    async ({ code }) => {
      const { modules } = compileRouteModules(`${head}${code}
export const Route = createFileRoute('/')({ component: Page })
`)
      expect(modules.reference).toMatch(declarationOf('Page'))
      await expectValidModules(modules)
    },
  )

  // Inputs adapted from the React Compiler fixture corpus
  // (compiler/packages/babel-plugin-react-compiler/src/__tests__/fixtures/compiler)
  it.each([
    {
      // FIXTURE_ENTRYPOINT in complex-while.js and most fixtures
      name: 'an exported object',
      exports: 'export const meta = { fn: Page, params: [{}] }',
    },
    {
      // gating/gating-use-before-decl.js
      name: 'an exported call',
      exports: 'export default memo(Page)',
    },
    {
      // uid-collision-across-functions.js
      name: 'an export list',
      exports: 'export { Page, Fallback }',
    },
  ])(
    'keep a component that $name references in the route module',
    async ({ exports }) => {
      const { modules } =
        compileRouteModules(`${head}import { memo } from 'react'
function Page() {
  return <div>page</div>
}
function Fallback() {
  return <div>error</div>
}
${exports}
export const Route = createFileRoute('/')({ component: Page, errorComponent: Fallback })
`)
      expect(modules.reference).toMatch(declarationOf('Page'))
      await expectValidModules(modules)
    },
  )

  // Source: Next.js ssg/getStaticProps/should-not-crash-for-class-declarations
  it('are imported by the chunk when exported by specifier or as a class', async () => {
    const { modules } = compileRouteModules(`${head}function getPaths() {
  return []
}
export { getPaths }
export class MyClass {}
function Page() {
  return <div>{getPaths().length}{String(new MyClass())}</div>
}
export const Route = createFileRoute('/')({ component: Page })
`)
    const component = modules['virtual component']!
    // A copied class would break `instanceof MyClass` checks across modules
    expect(component).not.toMatch(declarationOf('MyClass'))
    expect(component).not.toMatch(declarationOf('getPaths'))
    expect(importedNames(component, 'route.tsx')).toEqual([
      'MyClass',
      'getPaths',
    ])
    await expectValidModules(modules)
  })

  // A second initialization in the chunk would be another instance than the
  // one other modules import, even when it is built from a private call
  // result that the chunk reads as well.
  it('are imported by the chunk when built from a private call result', async () => {
    const chunk = componentChunk(`${head}import { load } from './data'
const initial = load()
export const cache = new Map(initial)
function Page() {
  return <p>{cache.size === initial.length ? 'fresh' : 'changed'}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`)
    expect(chunk).not.toMatch(declarationOf('cache'))
    expect(importedNames(chunk, 'route.tsx')).toContain('cache')
    await expectValidModules({ chunk })
  })

  // Inputs adapted from React Compiler gating/gating-test-export-default-function.js
  it('are imported by the chunk of another component that renders the default-exported component', async () => {
    const { modules } =
      compileRouteModules(`${head}export default function Bar(props) {
  return <div>{props.bar}</div>
}
function NoForget(props) {
  return <Bar>{props.noForget}</Bar>
}
export const Route = createFileRoute('/')({ component: Bar, errorComponent: NoForget })
`)
    const chunk = modules['virtual errorComponent']!
    expect(chunk).not.toMatch(declarationOf('Bar'))
    // From the route module (its default export) or the shared module
    expect([
      ...importedNames(chunk, 'route.tsx'),
      ...importedNames(chunk, 'route.tsx?tsr-shared=1'),
    ]).toEqual([expect.stringMatching(/^(?:Bar|default)$/)])
    await expectValidModules(modules)
  })
})

describe('TypeScript-only syntax', () => {
  it('erases type-only imports and exports from the split modules', async () => {
    const { modules } =
      compileRouteModules(`${head}import type { User } from './types'
import { type Settings, defaults } from './settings'
export type * from './types'
export type { User }
const current: User | Settings = defaults
export const Route = createFileRoute('/')({
  loader: () => current,
  component: () => <div>{String(current)}</div>,
})
`)
    expect(importedNames(modules['virtual component']!, './types')).toEqual([])
    expect(importedNames(modules.shared!, './types')).toEqual([])
    expect(importedNames(modules.shared!, './settings')).toEqual(['defaults'])
    await expectValidModules(modules)
  })

  // An import the code only references from types (without `import type`)
  // stays only where such a reference does, for TypeScript to erase.
  it.each([
    {
      name: 'the loader',
      options: `loader: (): Framework => 'react',
  component: () => <p>index</p>,`,
      importers: ['reference'],
    },
    {
      name: 'the split component',
      options: `loader: () => 'data',
  component: () => {
    const [framework] = useState<Framework>('react')
    return <p>{framework}</p>
  },`,
      importers: ['virtual component'],
    },
  ])(
    'imports a binding only types reference in $name only where they do',
    async ({ options, importers }) => {
      const { modules } =
        compileRouteModules(`${head}import { useState } from 'react'
import { Framework } from './projects'
export const Route = createFileRoute('/')({
  ${options}
})
`)
      expect(
        Object.keys(modules).filter((name) =>
          importSources(modules[name]!).includes('./projects'),
        ),
      ).toEqual(importers)
      await expectValidModules(modules)
    },
  )

  // Ambient declarations (`declare ...`) have no runtime binding: the
  // environment provides the value (a <script> tag, a bundler define, a global).
  it.each([
    {
      name: 'a declare function',
      declaration: 'declare function track(event: string): void',
      use: 'track("x")',
    },
    {
      name: 'an exported declare function',
      declaration: 'export declare function track(event: string): void',
      use: 'track("x")',
    },
    {
      name: 'a declare enum',
      declaration: 'declare enum Flags { On = 1 }',
      use: 'Flags.On',
    },
    {
      name: 'a declare namespace',
      declaration:
        'declare namespace Analytics { function track(event: string): void }',
      use: 'Analytics.track("x")',
    },
  ])(
    'does not share $name that the loader and the component read',
    async ({ declaration, use }) => {
      const { modules, sharedBindings } =
        compileRouteModules(`${head}${declaration}
export const Route = createFileRoute('/ambient')({
  loader: () => ${use},
  component: () => <button onClick={() => ${use}}>track</button>,
})
`)
      expect(sharedBindings).toEqual([])
      await expectValidModules(modules)
    },
  )

  // For example a constant injected with Vite's `define`: no module exports it.
  it('leaves an ambient declare const read by the loader and the split component a global', async () => {
    vi.stubGlobal('APP_VERSION', '1.0')
    try {
      const { options, chunks } =
        await loadRouteModules(`${head}declare const APP_VERSION: string
export const Route = createFileRoute('/')({
  loader: () => APP_VERSION,
  component: () => <p>{APP_VERSION}</p>,
})`)
      expect([options.loader(), chunks.component!.component()]).toEqual([
        '1.0',
        '<p>1.0</p>',
      ])
    } finally {
      vi.unstubAllGlobals()
    }
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

  it('gives the split component the namespace it uses', async () => {
    const { modules } =
      compileRouteModules(`${head}namespace Labels { export const quiet = 'quiet' }
export const Route = createFileRoute('/')({
  component: () => <p>{Labels.quiet}</p>,
})
`)
    await expectValidModules(modules)
    const chunk = await evaluateModule(modules['virtual component']!)
    expect(chunk.component!()).toBe('<p>quiet</p>')
  })

  // Source: @vitejs/plugin-rsc transform tests, typescript-eslint
  // type-assertion/increment/as-increment.js,
  // type-assertion/increment/non-null-increment.js and type-assertion/satisfies.js
  it('keeps the parentheses around asserted update operands in a split component', async () => {
    const chunk = componentChunk(`${head}let count = 0
function Page() {
  ;(count as number)++
  ;(count satisfies number)++
  count!++
  ;(count as any) += 1
  return count
}
export const Route = createFileRoute('/')({ component: Page })
`)
    await expectValidModules({ chunk })
    expect((await evaluateModule(chunk)).component!()).toBe(4)
  })

  // TypeScript lets a type and a value share a name; exporting both is valid.
  it('exports a type and a value with the same name', async () => {
    const code = `${head}export type Post = { id: string }
function Post(id: string): Post {
  return { id }
}
export { Post }
export const Route = createFileRoute('/posts')({
  component: () => <p>posts</p>,
})
`
    const { modules } = compileRouteModules(code)
    expect(exportedNames(modules.reference!)).toContain('Post')
    expect(exportedNames(transformWithRouteHmrPlugin(code))).toContain('Post')
    await expectValidModules(modules)
  })

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
