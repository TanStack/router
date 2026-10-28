/**
 * Imports and exports of a split route file, loaded the way an app loads it
 * (`route-app.ts`: the public router plugin in a real Vite dev server, the
 * route run in a page of the test process's browser). What each module imports is
 * judged by what loads and works (requests, rendered output, the instances
 * other modules of the app import), and by J2.5 checks of user code absent
 * from a module (decoded user markers), never by the spelling of import
 * statements. The attribute of an import moved into a chunk is judged by a
 * bundler that honours it: integration/code-splitter-import-attributes.test.ts.
 */
import { parse as parseWithBabel } from '@babel/core'
import { describe, expect, it } from 'vitest'
import {
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import {
  expectValidModules,
  head,
  holdsMarker,
  loadRoute,
} from '../../route-app'
import type { Plugin } from 'vite'
import type { RouteApp } from '../../route-app'

/** A package of the app's `node_modules`, as files of the app. */
const packageFiles = (name: string, source: string) => ({
  [`node_modules/${name}/package.json`]: JSON.stringify({
    name,
    type: 'module',
    exports: './index.js',
  }),
  [`node_modules/${name}/index.js`]: source,
})

/**
 * The code of every module of the route as the dev server serves it,
 * following the dev server's own module graph from the route module (the
 * modules it imports, statically or lazily, that are files of the app or
 * derived from them, or virtual modules), without running them: for code
 * the browser cannot run yet.
 */
async function servedGraph(route: RouteApp) {
  const graph = route.host.dev.vite.environments.client.moduleGraph
  const modules: Record<string, string> = {}
  const queue = [route.url]
  while (queue.length > 0) {
    const url = queue.shift()!
    if (url in modules) {
      continue
    }
    modules[url] = await route.transform(url)
    const node = await graph.getModuleByUrl(url)
    for (const imported of node?.importedModules ?? []) {
      if (
        // A virtual module (a plugin's id: a compiler's support module)
        imported.id?.startsWith('\0') ||
        (imported.file?.startsWith(route.host.root) &&
          !imported.file.includes('/node_modules/'))
      ) {
        queue.push(imported.url)
      }
    }
  }
  return modules
}

describe('each module imports only the specifiers it reads', () => {
  // Source: React Router route-chunks-test.ts "functions referencing their own
  // identifiers"; babel-dead-code-elimination dead-code-elimination.test.ts
  // "import" > "mixed default and named" and "namespace"
  it('splits default, named and namespace specifiers between the modules', async () => {
    const route = await loadRoute(
      `${head}import defaultMessage, { targetMessage, otherMessage } from './messages'
import * as messages from './messages'
import other, * as ns from './other'
const getDefault = () => ({ marker: 'MARK_GET_DEFAULT', value: defaultMessage }).value
const getTarget = () => ({ marker: 'MARK_GET_TARGET', value: targetMessage }).value
const getOther = () => ['MARK_LOADER', otherMessage]
function getNamespaced() {
  return { marker: 'MARK_GET_NAMESPACED', value: messages.namespaced }.value
}
export const Route = createFileRoute('/')({
  loader: () => [...getOther(), other],
  component: () => <div title="MARK_COMPONENT">{getDefault()}{ns.x}</div>,
  errorComponent: () => <div title="MARK_ERROR">{getNamespaced()}</div>,
  notFoundComponent: () => <div title="MARK_NOT_FOUND">{getTarget()}</div>,
})
`,
      {
        files: {
          'messages.ts': `export default 'default'
export const targetMessage = 'target'
export const otherMessage = 'other'
export const namespaced = 'namespaced'
`,
          'other.ts': `export default 'otherDefault'\nexport const x = 'x'\n`,
        },
      },
    )
    // Nothing that loads with the route module (the route module and the
    // modules it imports statically) holds what only the split
    // components read, and no split chunk holds what only the loader reads
    // (SPEC J2.5: the user code, found by its markers).
    const eager = await route.eagerModules()
    for (const marker of [
      'MARK_COMPONENT',
      'MARK_ERROR',
      'MARK_NOT_FOUND',
      // The helpers only one split component reads (the default, named
      // and namespace imports they read leave with them)
      'MARK_GET_DEFAULT',
      'MARK_GET_TARGET',
      'MARK_GET_NAMESPACED',
    ]) {
      expect(
        eager.some((code) => holdsMarker(code, marker)),
        marker,
      ).toBe(false)
    }
    // Each component and helper loads with the component that reads it
    for (const [option, marker] of [
      ['component', 'MARK_COMPONENT'],
      ['errorComponent', 'MARK_ERROR'],
      ['notFoundComponent', 'MARK_NOT_FOUND'],
      ['component', 'MARK_GET_DEFAULT'],
      ['errorComponent', 'MARK_GET_NAMESPACED'],
      ['notFoundComponent', 'MARK_GET_TARGET'],
    ] as const) {
      expect(
        (await route.loadedBy(option)).some((code) =>
          holdsMarker(code, marker),
        ),
        `${option} loads ${marker}`,
      ).toBe(true)
    }
    for (const option of ['component', 'errorComponent', 'notFoundComponent']) {
      const loaded = await route.loadedBy(option)
      expect(
        loaded.some((code) => holdsMarker(code, 'MARK_LOADER')),
        option,
      ).toBe(false)
    }
    // ... which loads with the route module
    expect(eager.some((code) => holdsMarker(code, 'MARK_LOADER'))).toBe(true)
    await expectValidModules(route)
    expect(
      await route.run(`return [
  options.loader(),
  await render('component'),
  await render('errorComponent'),
  await render('notFoundComponent'),
]`),
    ).toEqual([
      ['MARK_LOADER', 'other', 'otherDefault'],
      '<div title="MARK_COMPONENT">defaultx</div>',
      '<div title="MARK_ERROR">namespaced</div>',
      '<div title="MARK_NOT_FOUND">target</div>',
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
      {
        files: {
          'page.ts': `export const Page = () => 'page'\nexport const title = 'title'\n`,
        },
      },
    )
    await expectValidModules(route)
    expect(await route.isLazy('component')).toBe(true)
    expect(
      await route.run(`return [options.loader(), await render('component')]`),
    ).toEqual(['title', 'page'])
  })

  it('moves a specifier with a string name into the chunk', async () => {
    const route = await loadRoute(
      `${head}import { "kebab-name" as Kebab } from './icons'
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <Kebab />,
})
`,
      {
        files: {
          'icons.ts': `const kebab = () => 'kebab'\nexport { kebab as 'kebab-name' }\n`,
        },
      },
    )
    // Nothing the route module loads requests what only the component reads.
    expect(await route.requested()).not.toContain('/icons.ts')
    await expectValidModules(route)
    expect(await route.run(`return render('component')`)).toBe('kebab')
  })

  // Source: babel-dead-code-elimination dead-code-elimination.test.ts "import" >
  // "mixed default and named: none used" and "side-effect"
  it.each([{ hmr: false }, { hmr: true }])(
    'removes an import whose specifiers all moved instead of leaving a side-effect import (hmr: $hmr)',
    async ({ hmr }) => {
      // React HMR rewrites the route module before unused code is removed.
      // (Where a route's CSS import loads: start-plugin-core
      // tests/integration/known-bugs-route-css.test.ts.)
      const route = await loadRoute(
        `${head}import a, { b } from 'pkg'
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{a}{b}</p>,
})
`,
        {
          hmr,
          files: packageFiles(
            'pkg',
            `globalThis.pkgLoads = (globalThis.pkgLoads ?? 0) + 1
export default 'a'
export const b = 'b'
`,
          ),
        },
      )
      // What only the component reads does not load with the route.
      expect(await route.run(`return globalThis.pkgLoads ?? 0`)).toBe(0)
      await expectValidModules(route)
      expect(
        await route.run(
          `return [await render('component'), globalThis.pkgLoads]`,
        ),
      ).toEqual(['<p>ab</p>', 1])
    },
  )

  // Import attributes change what a module is (`type: 'json'`, a bundler
  // macro), so they move with the import. Vite gives an attribute no
  // meaning: here the moved import keeps working; that the attribute
  // still applies in the chunk is judged where a bundler honours it
  // (integration/code-splitter-import-attributes.test.ts, webpack).
  it('keeps an import with attributes working when it moves into the chunk', async () => {
    const route = await loadRoute(
      `${head}import { test } from './test' with { type: 'macro' }
export const Route = createFileRoute('/')({
  component: () => test,
})
`,
      { files: { 'test.ts': `export const test = 'macro value'\n` } },
    )
    // Nothing that loads with the route module (whichever modules a
    // compiler emits) requests `./test`; the component gets it.
    expect(await route.requested()).not.toContain('/test.ts')
    expect(await route.run(`return render('component')`)).toBe('macro value')
    await expectValidModules(route)
  })

  // Import assertions (`assert { type: 'json' }`) are the deprecated form of
  // import attributes (SPEC J2.17). Here: the route keeps working
  // and the JSON module moves with the component. That the attribute keeps
  // its meaning in the chunk: integration/code-splitter-import-attributes.test.ts.
  it('keeps an import assertion of a route file working', async () => {
    const route = await loadRoute(
      `${head}import data from './data.json' assert { type: 'json' }
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{data.title}</p>,
})
`,
      { files: { 'data.json': '{ "title": "from json" }' } },
    )
    expect(await route.requested()).not.toContain('/data.json')
    expect(await route.run(`return render('component')`)).toBe(
      '<p>from json</p>',
    )
    await expectValidModules(route)
  })

  // With React's classic JSX runtime, JSX compiles to `React.createElement`,
  // so a React import that the TypeScript code only uses in types must stay:
  // the app's own classic transform runs on what the router plugin emits,
  // and the page renders the component.
  it.each([
    { name: 'split component modules', pluginOptions: undefined },
    {
      name: 'route module compiled for HMR',
      pluginOptions: { autoCodeSplitting: false },
    },
  ])(
    'keeps the React import of the $name for classic JSX',
    async ({ pluginOptions }) => {
      const route = await loadRoute(
        `import * as React from 'react'
${head}function Page({ title = 'classic' }: { title?: React.ReactNode }) {
  return <p>{title}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
        {
          frameworkPluginOptions: { jsxRuntime: 'classic' },
          pluginOptions,
          hmr: pluginOptions !== undefined,
        },
      )
      // `React.createElement` reads an imported `React`.
      expect(await route.run(`return render('component')`)).toBe(
        '<p>classic</p>',
      )
      await expectValidModules(route)
    },
  )

  it('keeps the React import of the split component modules with inline JSX when only a top-level type reads React', async () => {
    const route = await loadRoute(
      `import * as React from 'react'
${head}type Title = React.ReactNode
export const Route = createFileRoute('/')({ component: () => <p>classic</p> })
`,
      { frameworkPluginOptions: { jsxRuntime: 'classic' } },
    )
    expect(await route.isLazy('component')).toBe(true)
    expect(await route.run(`return render('component')`)).toBe('<p>classic</p>')
    await expectValidModules(route)
  })
})

// A route created through a namespace import of the router package
// (`Router.createFileRoute`) is a route like one created through a named
// import (SPEC J2.1, G15): its options split and work.
it('splits a route created through a namespace import of the router package', async () => {
  const route = await loadRoute(
    `import * as Router from '@tanstack/react-router'
export const Route = Router.createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>MARK_NAMESPACE_COMPONENT</p>,
})
`,
  )
  await expectValidModules(route)
  expect(await route.isLazy('component')).toBe(true)
  expect(
    (await route.eagerModules()).some((code) =>
      code.includes('MARK_NAMESPACE_COMPONENT'),
    ),
  ).toBe(false)
  expect(
    await route.run(`return [options.loader(), await render('component')]`),
  ).toEqual(['data', '<p>MARK_NAMESPACE_COMPONENT</p>'])
})

describe('exports of the route file', () => {
  it.each([
    { name: 'as-is', exports: 'export { Foo }', exported: 'Foo' },
    { name: 'renamed', exports: 'export { Foo as Bar }', exported: 'Bar' },
  ])(
    'are not redeclared when they re-export an import $name',
    async ({ exports, exported }) => {
      const route = await loadRoute(
        `${head}import { Foo } from './foo'
${exports}
export const Route = createFileRoute('/')({ component: Page })
function Page() {
  return <Foo />
}
`,
        {
          files: {
            'foo.ts': `export const Foo = () => 'foo'\n`,
            // Another module of the app imports the re-export (SPEC G9, J2.4)
            'importer.ts': `export { ${exported} } from './route'\n`,
          },
        },
      )
      await expectValidModules(route)
      expect(
        await route.run(`const importer = await app('importer.ts')
return [importer.${exported} === (await app('foo.ts')).Foo, await render('component')]`),
      ).toEqual([true, 'foo'])
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
      {
        files: {
          'stuff.ts': `export const getStuff = () => ({ a: 'A', b: 'B' })\n`,
          'importer.ts': `export { a } from './route'\n`,
        },
      },
    )
    await expectValidModules(route)
    expect(
      await route.run(
        `return [(await app('importer.ts')).a, await render('component')]`,
      ),
    ).toEqual(['A', '<div>AB</div>'])
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
      const route = await loadRoute(
        `${head}const cache = new Map()
function Page() {
  return <div>{cache.size}</div>
}
export const Route = createFileRoute('/')({
  loader: () => cache.get('x'),
  component: Page,
})
export default ${declaration}
`,
        // As another module of the app imports it.
        { files: { 'importer.ts': `export { default } from './route'\n` } },
      )
      await expectValidModules(route)
      expect(
        await route.run(`const { default: exported } = await app('importer.ts')
return [
  typeof exported,
  ${type === 'class' ? 'new exported().x' : 'exported()'},
  await render('component'),
]`),
      ).toEqual(['function', type === 'class' ? 1 : null, '<div>0</div>'])
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
      {
        files: {
          'store.ts': `export const createStore = () => ({ get: () => 'value' })\n`,
          'importer.ts': `export { Route, title } from './route'\n`,
        },
      },
    )
    expect(
      await route.run(`const other = await app('importer.ts')
return [other.title, other.Route === Route, options.loader(), await render('component')]`),
    ).toEqual(['title', true, 'value', '<p>value</p>'])
    await expectValidModules(route)
  })

  // Source: Next.js ssg/getStaticProps/issue-31855 and multi-declarator-export
  it('keep one instance when declared in one statement and read by the chunk', async () => {
    const route = await loadRoute(
      `${head}export const a = { n: 0 },
  b = { n: 10 }
export const Route = createFileRoute('/')({
  component: () => {
    a.n++
    return <div>{a.n + b.n}</div>
  },
})
`,
      {
        files: {
          'importer.ts': `import { a, b } from './route'
export const read = () => [a.n, b.n]
`,
        },
      },
    )
    // The component updated the object other modules import.
    expect(
      await route.run(`const other = await app('importer.ts')
return [await render('component'), other.read()]`),
    ).toEqual(['<div>11</div>', [1, 10]])
    await expectValidModules(route)
  })

  // Source: #8504.
  it('keep working when the route module reassigns a binding declared with what the split component reads', async () => {
    const route = await loadRoute(
      `${head}let { title, visits } = { title: 'Home', visits: 0 }
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
`,
      { files: { 'importer.ts': `export { reset } from './route'\n` } },
    )
    await expectValidModules(route)
    expect(
      await route.run(`const { reset } = await app('importer.ts')
return [reset(), await render('component')]`),
    ).toEqual([0, '<h1>Home</h1>'])
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
      {
        files: {
          'lib.ts': `export const value = 'lib value'\n`,
          'importer.ts': `import { value, lib } from './route'
export const read = () => [value, lib.value]
`,
        },
      },
    )
    expect(
      await route.run(`const other = await app('importer.ts')
return [other.read(), options.loader(), await render('component')]`),
    ).toEqual([['lib value', 'lib value'], 0, '<div>0</div>'])
    await expectValidModules(route)
  })

  // An extracted exported component's module is a static dependency of the
  // route module (`export { Page } from './route?tsr-split=export~Page'`), so
  // it evaluates before the route module's body: a declaration that moves
  // with it must not read, at module evaluation, a binding the route module
  // keeps (G3: no TDZ a user never wrote; found by differential fuzzing).
  const keptBindings = [
    {
      name: 'a class',
      kept: `class Model { static label = 'model' }
export const label = Model.label`,
      read: `const config = { model: Model }`,
      value: 'config.model.label',
      expected: 'model',
    },
    {
      name: 'a const object',
      kept: `const defaults = { label: 'defaults' }
export const label = defaults.label`,
      read: `const config = { ...defaults }`,
      value: 'config.label',
      expected: 'defaults',
    },
    {
      name: 'an enum',
      kept: `enum Mode { Fast = 'fast' }
export const label = Mode.Fast`,
      read: `const config = { mode: Mode.Fast }`,
      value: 'config.mode',
      expected: 'fast',
    },
  ]
  it.each(keptBindings)(
    'an exported component reading, through a declaration only it uses, $name the route module keeps',
    async ({ kept, read, value, expected }) => {
      const route = await loadRoute(
        `${head}${kept}
${read}
export function Page() {
  return <p>{${value}}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
        { files: { 'importer.ts': `export { Page, label } from './route'\n` } },
      )
      expect(
        await route.run(`const other = await app('importer.ts')
return [await render('component'), other.label, typeof other.Page]`),
      ).toEqual([`<p>${expected}</p>`, expected, 'function'])
      await expectValidModules(route)
    },
  )

  // An exported split option keeps working and keeps its identity (the
  // component the route renders records itself with `see`: it is the one
  // other modules import), and the other options are still split.
  // Splitting it anyway is the goal, decided by the build (pinned in
  // known-bugs-code-splitter.test.ts, "page code exported from the route
  // file loads with its chunk").
  const exportedOptions = [
    {
      name: 'an exported component, with the errorComponent split',
      code: `${head}import { see } from './see'
export function Page() {
  see(Page)
  return <p>page</p>
}
export const Route = createFileRoute('/')({
  component: Page,
  errorComponent: () => <p>error</p>,
})
`,
      routeId: '/',
      split: 'errorComponent',
      option: 'component',
      binding: 'Page',
      value: '<p>page</p>',
    },
    {
      name: 'a default-exported component, with the notFoundComponent split',
      code: `${head}import { see } from './see'
export const Route = createFileRoute('/home')({
  component: Home,
  notFoundComponent: NotFoundComponent,
})
function NotFoundComponent() {
  return <div>Not Found</div>
}
export default function Home() {
  see(Home)
  return <h1>home</h1>
}
`,
      routeId: '/home',
      split: 'notFoundComponent',
      option: 'component',
      binding: 'default',
      value: '<h1>home</h1>',
    },
    {
      name: 'an exported loader, with the loader split',
      code: `${head}import { see } from './see'
export function loaderFn() {
  see(loaderFn)
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
      routeId: '/_layout',
      split: 'component',
      option: 'loader',
      binding: 'loaderFn',
      value: { foo: 'bar' },
    },
    {
      name: 'a component default-exported by name, with the errorComponent split',
      code: `${head}import { see } from './see'
const Page = () => {
  see(Page)
  return <p>page</p>
}
export default Page
export const Route = createFileRoute('/')({
  component: Page,
  errorComponent: () => <p>error</p>,
})
`,
      routeId: '/',
      split: 'errorComponent',
      option: 'component',
      binding: 'default',
      value: '<p>page</p>',
    },
  ]

  const seeFile = `export const seen: Array<unknown> = []
export const see = (value: unknown) => seen.push(value)
`

  const runExported = (
    route: RouteApp,
    option: string,
  ): Promise<[unknown, number]> =>
    route.run(`const result = ${
      option === 'loader'
        ? `await (await load('loader'))()`
        : `await render(${JSON.stringify(option)})`
    }
const { seen } = await app('see.ts')
return [result, seen.length]`)
  it.each(exportedOptions)(
    'keep working: $name',
    async ({ code, routeId, split, option, binding, value }) => {
      const route = await loadRoute(code, {
        routeId,
        files: {
          'see.ts': seeFile,
          'importer.ts': `export { ${binding} as exported } from './route'\n`,
        },
      })
      await expectValidModules(route)
      const [result, seen] = await runExported(route, option)
      expect([result, seen]).toEqual([value, 1])
      expect(await route.isLazy(split)).toBe(true)
      // Left unsplit, the option is reported once, naming the route file
      // (SPEC J2.8, J2.19)
      if (!(await route.isLazy(option))) {
        expectDiagnostic(await route.diagnostics(), {
          severity: 'warning',
          file: route.url.slice(1),
          root: route.host.root,
          times: 1,
        })
      }
    },
  )

  // With route HMR, as a dev server has it: an exported component that
  // another route imports is split, or the user is told once per file
  // (SPEC J2.8, J2.19), however often the route module and its split
  // modules are served and transformed.
  it('an exported component another route imports is split, or reported once naming the file, with route HMR', async () => {
    const route = await loadRoute(
      `${head}export function Page() {
  return <p>page</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
      {
        hmr: true,
        files: {
          'about.tsx': `${head}import { Page } from './route'
export const Route = createFileRoute('/about')({ component: () => <Page /> })
`,
        },
      },
    )
    expect(
      await route.run(`await app('about.tsx')
return render('component')`),
    ).toBe('<p>page</p>')
    const split = await route.isLazy('component')
    await route.transform()
    expect(await route.run(`return render('component')`)).toBe('<p>page</p>')
    if (!split) {
      expectDiagnostic(await route.diagnostics(), {
        severity: 'warning',
        file: route.url.slice(1),
        root: route.host.root,
        times: 1,
      })
    }
  })

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
      await expectValidModules(route)
      expect(await route.isLazy('component')).toBe(true)
      expect(await route.run(`return render('component')`)).toBe('<p>page</p>')
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
      const route = await loadRoute(
        `${head}${declaration}
export function NotFound() {
  return <i>nf</i>
}
export const Route = createFileRoute('/')({
  component: () => <p>{helper()}</p>,
  notFoundComponent: NotFound,
})
`,
        { files: { 'importer.ts': `export { helper } from './route'\n` } },
      )
      expect(
        await route.run(
          `return [await render('component'), (await app('importer.ts')).helper()]`,
        ),
      ).toEqual(['<p>h</p>', 'h'])
    },
  )

  // The chunk of a split option holds only what that option needs: an
  // exported component of another option is not copied into it (J2.5: its
  // code, found by its marker).
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
      expect(
        await route.run(
          `return [await render('component'), await render('notFoundComponent')]`,
        ),
      ).toEqual(['<p>page</p>', '<i>MARK_NF</i>'])
      const loaded = await route.loadedBy('component')
      expect(loaded.some((code) => holdsMarker(code, 'MARK_NF'))).toBe(false)
      // ... but in what the notFoundComponent needs: its split code, or the
      // modules that load with the route (left in the route module, J2.8, or
      // an exported binding a split chunk imports back from it)
      const notFound = [
        ...(await route.eagerModules()),
        ...((await route.isLazy('notFoundComponent'))
          ? await route.loadedBy('notFoundComponent')
          : []),
      ]
      expect(notFound.some((code) => holdsMarker(code, 'MARK_NF'))).toBe(true)
    },
  )
})

describe('TypeScript-only syntax', () => {
  it('erases type-only imports and exports from the split modules', async () => {
    // `./types` is no file of the app: a module that still imported a value
    // from it would fail to load in the page.
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
      { files: { 'settings.ts': `export const defaults = 'defaults'\n` } },
    )
    await expectValidModules(route)
    expect(
      await route.run(`const result = [options.loader(), await render('component')]
return [...result, (await requested()).filter((request) => request.startsWith('/types'))]`),
    ).toEqual(['defaults', '<div>defaults</div>', []])
  })

  // Ambient declarations (`declare ...`) have no runtime binding: the
  // environment provides the value (a <script> tag, a bundler define, a global).
  it.each([
    {
      name: 'a declare function',
      declaration: 'declare function track(event: string): void',
      use: 'track("x")',
      global: 'globalThis.track = (event) => `tracked ${event}`',
      expected: 'tracked x',
    },
    {
      name: 'an exported declare function',
      declaration: 'export declare function track(event: string): void',
      use: 'track("x")',
      global: 'globalThis.track = (event) => `tracked ${event}`',
      expected: 'tracked x',
    },
    {
      name: 'a declare enum',
      declaration: 'declare enum Flags { On = 1 }',
      use: 'Flags.On',
      global: 'globalThis.Flags = { On: 1 }',
      expected: 1,
    },
    {
      name: 'a declare namespace',
      declaration:
        'declare namespace Analytics { function track(event: string): void }',
      use: 'Analytics.track("x")',
      global: 'globalThis.Analytics = { track: (event) => `tracked ${event}` }',
      expected: 'tracked x',
    },
  ])(
    'reads $name that the loader and the component use from the environment',
    async ({ declaration, use, global, expected }) => {
      const route = await loadRoute(
        `${head}${declaration}
export const Route = createFileRoute('/ambient')({
  loader: () => ${use},
  component: () => <button onClick={() => ${use}}>{String(${use})}</button>,
})
`,
        { routeId: '/ambient', pageScript: global },
      )
      await expectValidModules(route)
      expect(
        await route.run(`return [options.loader(), await render('component')]`),
      ).toEqual([expected, `<button>${expected}</button>`])
    },
  )

  // An import the code only references from types (without `import type`)
  // is not imported by the route module when only the split component's
  // types reference it. (When only the loader's types do, the chunks import
  // it: pinned in known-bugs-code-splitter.test.ts.) Source: #8504.
  it('leaves an import only the split component references from types out of the route module', async () => {
    const route = await loadRoute(
      `${head}import { useState } from 'react'
import { Framework } from './projects'
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => {
    const [framework] = useState<Framework>('react')
    return <p>{framework}</p>
  },
})
`,
      { files: { 'projects.ts': `export const Framework = 'Framework'\n` } },
    )
    expect(await route.requested()).not.toContain('/projects.ts')
    await expectValidModules(route)
    expect(await route.run(`return render('component')`)).toBe('<p>react</p>')
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
    await expectValidModules(route)
    expect(await route.run(`return render('component')`)).toBe('<p>3|7</p>')
  })

  // An ambient var merged with an interface has no runtime declaration:
  // a declaration the loader and the split component share reads the
  // global. Source: TypeScript conformance test
  // expressions/functionCalls/overloadResolutionConstructors.ts; #8504.
  async function readsAmbientVar(verbatimModuleSyntax: boolean) {
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
      {
        tsconfig: { verbatimModuleSyntax },
        pageScript: `globalThis.readVersion = () => '1.0'`,
      },
    )
    await expectValidModules(route)
    expect(
      await route.run(`return [options.loader(), await render('component')]`),
    ).toEqual(['1.0', '<p>1.0</p>'])
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
  it('reads an ambient var merged with an interface from the environment in a shared declaration, with verbatimModuleSyntax', async () => {
    await readsAmbientVar(true)
  })

  it('keeps the namespace import that an import alias refers to', async () => {
    const route = await loadRoute(
      `${head}import * as lib from './lib'
import Helper = lib.Helper
export const Route = createFileRoute('/')({
  component: () => <div>{Helper.x}</div>,
})
`,
      { files: { 'lib.ts': `export const Helper = { x: 'helper' }\n` } },
    )
    await expectValidModules(route)
    expect(await route.run(`return render('component')`)).toBe(
      '<div>helper</div>',
    )
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
    await expectValidModules(route)
    expect(await route.run(`return render('component')`)).toBe(
      '<p>LOUD|label:x</p>',
    )
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
      await expectValidModules(route)
      expect(await route.run(`return render('component')`)).toBe(
        `<p>${expected}</p>`,
      )
    },
  )

  // TypeScript lets a type and a value share a name; exporting both is
  // valid: another module of the app imports the value, from the split
  // route module and from the route module the route HMR plugin compiles
  // (automatic code splitting off).
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
      const files = { 'importer.ts': `export { Post } from './route'\n` }
      const read = `return (await app('importer.ts')).Post('1')`
      const route = await loadRoute(code, { routeId: '/posts', files })
      await expectValidModules(route)
      expect(await route.run(read)).toEqual({ id: '1' })
      const hmr = await loadRoute(code, {
        routeId: '/posts',
        files,
        hmr: true,
        pluginOptions: { autoCodeSplitting: false },
      })
      expect(await hmr.run(read)).toEqual({ id: '1' })
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
      { files: { 'server-thing.ts': `export const secret = 'server'\n` } },
    )
    await expectValidModules(route)
    expect(await route.requested()).not.toContain('/server-thing.ts')
    expect(await route.run(`return render('component')`)).toBe('<p>server</p>')
  })

  it('keeps decorators before `export` for legacy decorator transforms', async () => {
    // TypeScript `experimentalDecorators` and Babel `decorators-legacy` only
    // accept decorators before the `export` keyword: every module the
    // router plugin emits must still parse with them. The app runs Babel's
    // parser with `decorators-legacy` on every module of the app right
    // after the router plugin (as a Babel step of an app's pipeline would),
    // then Vite's legacy decorator transform (`experimentalDecorators`).
    const legacyDecorators: Plugin = {
      name: 'app:decorators-legacy',
      enforce: 'pre',
      transform(code, id) {
        if (
          id.includes('/node_modules/') ||
          /\.(?:css|json)(?:\?|$)/.test(id)
        ) {
          return null
        }
        parseWithBabel(code, {
          babelrc: false,
          configFile: false,
          filename: 'module.tsx',
          parserOpts: { plugins: ['typescript', 'jsx', 'decorators-legacy'] },
        })
        return null
      },
    }
    const route = await loadRoute(
      `${head}import { injectable } from 'tsyringe'
import { observable } from 'mobx'
@injectable() export class Store { @observable count = 0 }
export const Route = createFileRoute('/')({
  loader: () => new Store().count,
  component: () => <div />,
})
`,
      {
        tsconfig: { experimentalDecorators: true },
        plugins: { after: [legacyDecorators] },
        files: {
          ...packageFiles(
            'tsyringe',
            `export const injectable = () => (target) => target\n`,
          ),
          ...packageFiles('mobx', `export const observable = () => {}\n`),
        },
      },
    )
    expect(await route.isLazy('component')).toBe(true)
    await expectValidModules(route)
    expect(
      await route.run(`return [options.loader(), await render('component')]`),
    ).toEqual([0, '<div></div>'])
  })

  // Auto-accessor fields (TypeScript 4.9+, ES decorators; MobX 6 and Lit use
  // them). Compiled only: the browser does not run `accessor` yet, so the
  // modules are read from the dev server's own module graph.
  it('compiles a class with an auto-accessor field that the split component uses', async () => {
    const route = await loadRoute(`${head}class Store { accessor count = 1 }
const store = new Store()
export const Route = createFileRoute('/')({
  loader: () => store,
  component: () => <p>{store.count}</p>,
})
`)
    const modules = await servedGraph(route)
    expect(Object.keys(modules).length).toBeGreaterThan(0)
    await expectValidModules(modules)
  })
})

// The route module re-exports an exported declaration that moves into a
// module of its own; one that eagerly reads a binding the route module keeps
// would read it before the route module created it (a circular import), so
// it stays. What the route module keeps is decided with every other export
// and every effect: another export the route module keeps, or an effectful
// declaration a chunk needs that stays in the route module, keeps what it
// reads there.
describe('an exported declaration reading what the route module keeps', () => {
  it('stays when another export reads the same binding', async () => {
    const route = await loadRoute(
      `${head}const Shared = () => <p>shared</p>
export const Page = Shared
export const Alias = Shared
export const Route = createFileRoute('/')({ component: Page })
`,
    )
    await expectValidModules(route)
    expect(
      await route.run(
        `return [exports.Page === exports.Alias, await render('component')]`,
      ),
    ).toEqual([true, '<p>shared</p>'])
  })

  it('stays when an effectful declaration the error component reads keeps it', async () => {
    const route = await loadRoute(
      `${head}import { see } from './see'
const Shared = () => <p>shared</p>
const store = see(Shared)
see('after')
export const Page = Shared
const headers = () => ({ store: String(store) })
export const Route = createFileRoute('/')({
  headers,
  component: Page,
  errorComponent: () => <p>{String(store === Shared)}</p>,
})
`,
      {
        files: { 'see.ts': 'export const see = <T,>(value: T): T => value\n' },
        deleteNodes: ['headers'],
      },
    )
    await expectValidModules(route)
    expect(
      await route.run(
        `return [await render('component'), await render('errorComponent')]`,
      ),
    ).toEqual(['<p>shared</p>', '<p>true</p>'])
  })
})

// An exported component the route file augments (`Page.displayName = …`,
// static props, `preload`) leaves, in a build, for its extracted module with
// its augmentations, under the effect-order rule of every move: a surviving
// effect before the augmentation keeps the component in the route module
// (the extracted module would evaluate before that effect), one after keeps
// its order. Other modules import the augmented component either way, and
// in dev the component stays in the route module whatever the order (R77
// dev: nothing is bundled there).
describe('an exported component with augmentations', () => {
  const augmented = [
    {
      name: 'a displayName',
      code: `${head}export function Page() {
  return <p title="MARK_PAGE">{Page.displayName}</p>
}
Page.displayName = 'PageDisplay'
export const Route = createFileRoute('/')({ component: Page })
`,
      script: `const { Page } = await app('importer.ts')
return [await render('component'), Page.displayName]`,
      expected: ['<p title="MARK_PAGE">PageDisplay</p>', 'PageDisplay'],
      extracted: true,
    },
    {
      name: 'static props',
      code: `${head}export const Page = () => <p title="MARK_PAGE">{Page.label}</p>
Page.label = 'static'
Page.count = 2
export const Route = createFileRoute('/')({ component: Page })
`,
      script: `const { Page } = await app('importer.ts')
return [await render('component'), Page.label, Page.count]`,
      expected: ['<p title="MARK_PAGE">static</p>', 'static', 2],
      extracted: true,
    },
    {
      name: 'a preload',
      code: `${head}export function Page() {
  return <p title="MARK_PAGE">page</p>
}
Page.preload = () => import('./heavy')
export const Route = createFileRoute('/')({ component: Page })
`,
      script: `const { Page } = await app('importer.ts')
const heavy = await Page.preload()
return [await render('component'), heavy.weight]`,
      expected: ['<p title="MARK_PAGE">page</p>', 'heavy'],
      extracted: true,
    },
    {
      name: 'a displayName after a surviving effect (kept in the route module)',
      code: `${head}import { see } from './see'
see('before')
export function Page() {
  return <p title="MARK_PAGE">{Page.displayName}</p>
}
Page.displayName = 'PageDisplay'
export const Route = createFileRoute('/')({ component: Page })
`,
      script: `const { Page } = await app('importer.ts')
const { seen } = await app('see.ts')
return [await render('component'), Page.displayName, seen]`,
      expected: [
        '<p title="MARK_PAGE">PageDisplay</p>',
        'PageDisplay',
        ['before'],
      ],
      extracted: false,
    },
    {
      name: 'a displayName before a surviving effect (the effect keeps its order)',
      code: `${head}import { see } from './see'
export function Page() {
  return <p title="MARK_PAGE">{Page.displayName}</p>
}
Page.displayName = 'PageDisplay'
see('after')
export const Route = createFileRoute('/')({ component: Page })
`,
      script: `const { Page } = await app('importer.ts')
const { seen } = await app('see.ts')
return [await render('component'), Page.displayName, seen]`,
      expected: [
        '<p title="MARK_PAGE">PageDisplay</p>',
        'PageDisplay',
        ['after'],
      ],
      extracted: true,
    },
  ]

  it.each(augmented)(
    'with $name loads with its chunk and keeps it',
    async ({ code, script, expected, extracted }) => {
      const route = await loadRoute(code, {
        files: {
          'see.ts': `export const seen: Array<unknown> = []
export const see = (value: unknown) => seen.push(value)
`,
          'heavy.ts': `export const weight = 'heavy'\n`,
          'importer.ts': `export { Page } from './route'\n`,
        },
      })
      await expectValidModules(route)
      expect(await route.run(script)).toEqual(expected)
      expect(await route.isLazy('component')).toBe(true)
      // in dev the route module holds the component (nothing is extracted
      // there); a production build holds it in the route's chunk only when
      // it left the route module (the extracted module's re-export is unused
      // and dropped), with the route module when it was kept
      expect(holdsMarker(await route.transform(), 'MARK_PAGE')).toBe(true)
      expect((await route.production()).where('MARK_PAGE')).toBe(
        extracted ? 'lazy' : 'eager',
      )
    },
  )
})

// J2.8: an exported binding a split component needs that cannot leave the
// route module (its initialiser has side effects) is reported once in dev,
// naming the file; a route file exporting only `Route` is not.
describe('an exported binding kept in the route module', () => {
  it('is reported once naming the file when it has side effects, and not when nothing keeps it', async () => {
    const kept = await loadRoute(
      `${head}import { createStore } from './store'
export const store = createStore()
function Page() {
  return <p>{store.value}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
      {
        files: {
          'store.ts': `export const createStore = () => ({ value: 'stored' })\n`,
        },
      },
    )
    expect(await kept.run(`return render('component')`)).toBe('<p>stored</p>')
    expectDiagnostic(await kept.diagnostics(), {
      severity: 'warning',
      file: kept.url.slice(1),
      root: kept.host.root,
      times: 1,
    })
    const free = await loadRoute(
      `${head}import { createStore } from './store'
const store = createStore()
export function Card() {
  return <b>card</b>
}
function Page() {
  return <p>{store.value}<Card /></p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
      {
        files: {
          'store.ts': `export const createStore = () => ({ value: 'stored' })\n`,
        },
      },
    )
    expect(await free.run(`return render('component')`)).toBe(
      '<p>stored<b>card</b></p>',
    )
    expect(
      findDiagnostics(await free.diagnostics(), {
        file: free.url.slice(1),
        root: free.host.root,
      }),
    ).toEqual([])
  })
})

// R77 dev: in dev a pure exported component only the split component
// renders stays in the route module as written (no extracted module to
// request one level deeper), and the route's chunk carries its own copy, as
// in a build; other modules importing it from the route file get the route
// module's instance.
describe('an exported component in dev', () => {
  it('stays in the route module, and the split component renders its own copy', async () => {
    const route = await loadRoute(
      `${head}export function Card() {
  return <b title="MARK_CARD">card</b>
}
function Page() {
  return <Card />
}
export const Route = createFileRoute('/')({ component: Page })
`,
      { files: { 'importer.ts': `export { Card } from './route'\n` } },
    )
    await expectValidModules(route)
    expect(
      await route.run(`const { Card } = await app('importer.ts')
return [await render('component'), typeof Card]`),
    ).toEqual(['<b title="MARK_CARD">card</b>', 'function'])
    expect(holdsMarker(await route.transform(), 'MARK_CARD')).toBe(true)
    const chunk = await route.loadedBy('component')
    expect(chunk.some((code) => holdsMarker(code, 'MARK_CARD'))).toBe(true)
    expect((await route.production()).where('MARK_CARD')).toBe('lazy')
  })
})
