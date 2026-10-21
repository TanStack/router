import { describe, expect, it } from 'vitest'
import { expectNoProblems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { expectValidModules, head, holdsMarker, loadRoute } from './route-app'
import { readsImport, servedImports } from './served-code'

describe('route options', () => {
  it('are split when declared in a variable', async () => {
    const route = await loadRoute(
      `${head}import { fetchPosts } from './api'
function Posts() {
  return <ul data-mark="MARK_POSTS">{Route.useLoaderData().length}</ul>
}
const options = {
  loader: () => fetchPosts(),
  component: Posts,
}
export const Route = createFileRoute('/posts')(options)
`,
      {
        routeId: '/posts',
        files: { 'api.ts': `export const fetchPosts = () => ['a', 'b']\n` },
      },
    )
    expect(await route.isLazy('component')).toBe(true)
    // D5: the component's code does not load with the route module, and its
    // chunk does not import what only the loader reads.
    expect(
      (await route.eagerModules()).some((code) =>
        holdsMarker(code, 'MARK_POSTS'),
      ),
    ).toBe(false)
    expect(
      (await route.loadedBy('component')).some((code) =>
        holdsMarker(code, 'MARK_POSTS'),
      ),
    ).toBe(true)
    expect(
      (await route.loadedBy('component')).flatMap(servedImports),
    ).not.toContain('/api.ts')
    await expectValidModules(route)
    // The split component reads the route the router loaded: the one the
    // route module created.
    expect(await route.run('return renderRoute()')).toBe(
      '<ul data-mark="MARK_POSTS">2</ul>',
    )
  })

  it.each([
    { option: 'errorComponent', value: false },
    { option: 'errorComponent', value: null },
    { option: 'pendingComponent', value: undefined },
    { option: 'component', value: undefined },
    { option: 'notFoundComponent', value: undefined },
    { option: 'loader', value: undefined },
  ])('keep $option: $value as written', async ({ option, value }) => {
    const route = await loadRoute(
      `${head}export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['component'], ['errorComponent'], ['pendingComponent'], ['notFoundComponent']],
  ${option}: ${String(value)},
  ${option === 'component' ? 'errorComponent' : 'component'}: () => <p>other</p>,
})
`,
    )
    await expectValidModules(route)
    expect(
      await route.run(`return {
  present: ${JSON.stringify(option)} in options,
  value: String(options[${JSON.stringify(option)}]),
  type: typeof options[${JSON.stringify(option)}],
}`),
    ).toEqual({ present: true, value: String(value), type: typeof value })
    expect(await route.isLazy(option)).toBe(false)
  })

  // A documented grouping: every option in one chunk.
  it('keep literal and method options grouped with a split option as written', async () => {
    const route =
      await loadRoute(`${head}export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader', 'component', 'errorComponent', 'pendingComponent', 'notFoundComponent']],
  loader() { return 'data' },
  component: () => <p>page</p>,
  errorComponent: false,
  pendingComponent: undefined,
  notFoundComponent: undefined,
})
`)
    await expectValidModules(route)
    expect(
      await route.run(`return [
  await render('component'),
  await (await load('loader'))(),
  options.errorComponent,
  String(options.pendingComponent),
  String(options.notFoundComponent),
]`),
    ).toEqual(['<p>page</p>', 'data', false, 'undefined', 'undefined'])
  })
})

// The groupings a route gets without any option (`defaultCodeSplitGroupings`,
// documented): each component that only renders on some navigations loads
// lazily on its own; the loader and the pendingComponent, which render
// before the route's data arrives, stay in the route module.
it('split the component, errorComponent and notFoundComponent, each on its own, by default', async () => {
  const route =
    await loadRoute(`${head}export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>page</p>,
  errorComponent: () => <p>error</p>,
  notFoundComponent: () => <p>not found</p>,
  pendingComponent: () => <p>pending</p>,
})
`)
  const options = [
    'loader',
    'component',
    'errorComponent',
    'notFoundComponent',
    'pendingComponent',
  ]
  const lazy: Record<string, boolean> = {}
  for (const option of options) {
    lazy[option] = await route.isLazy(option)
  }
  expect(lazy).toEqual({
    loader: false,
    component: true,
    errorComponent: true,
    notFoundComponent: true,
    pendingComponent: false,
  })
  // Each loads on its own.
  expect(await route.groups()).toEqual([
    ['component'],
    ['errorComponent'],
    ['notFoundComponent'],
  ])
})

// Route options given by reference to imported or local bindings move with
// their own module: the route module no longer imports what only split
// options read, and each lazy option resolves to the same value.
// Shapes of the deleted code-splitter snapshot fixtures imported*,
// imported-default-component*, imported-errorComponent,
// imported-notFoundComponent, imported-pendingComponent, arrow-function,
// function-declaration and conditional-properties.
describe('route options given by reference', () => {
  const files = {
    'page.ts': `const Page = () => 'page'
export default Page
export const ErrorView = () => 'error'
export const Pending = () => 'pending'
export const loadData = () => 'data'
export const fallback = () => 'fallback'
`,
    'flags.ts': `export const isEnabled = true\n`,
  }
  const groupings = `[['loader'], ['component'], ['errorComponent'], ['pendingComponent']]`

  it.each([
    {
      name: 'imports',
      code: `import Page, { ErrorView, Pending, loadData } from './page'
export const Route = createFileRoute('/')({
  codeSplitGroupings: ${groupings},
  loader: loadData,
  component: Page,
  errorComponent: ErrorView,
  pendingComponent: Pending,
})`,
      expected: {
        component: 'page',
        errorComponent: 'error',
        pendingComponent: 'pending',
      },
      loaded: 'data',
    },
    {
      name: 'a loader declared as a local function',
      code: `import Page, { loadData } from './page'
function load() {
  return loadData()
}
export const Route = createFileRoute('/')({
  codeSplitGroupings: ${groupings},
  loader: load,
  component: Page,
})`,
      expected: { component: 'page' },
      loaded: 'data',
    },
    {
      name: 'a conditional loader',
      code: `import { isEnabled } from './flags'
import Page, { loadData, fallback } from './page'
export const Route = createFileRoute('/')({
  codeSplitGroupings: ${groupings},
  loader: isEnabled ? loadData : fallback,
  component: Page,
})`,
      expected: { component: 'page' },
      loaded: 'data',
    },
  ])('split $name', async ({ code, expected, loaded }) => {
    const route = await loadRoute(`${head}${code}\n`, { files })
    await expectValidModules(route)
    // Nothing the route module loads requests what only split options read.
    expect(await route.requested()).not.toContain('/page.ts')
    const lazy = []
    for (const option of [...Object.keys(expected), 'loader']) {
      lazy.push(await route.isLazy(option))
    }
    expect(lazy).toEqual(lazy.map(() => true))
    expect(
      await route.run(`const rendered = {}
for (const option of ${JSON.stringify(Object.keys(expected))}) {
  rendered[option] = await render(option)
}
return { rendered, loaded: await options.loader() }`),
    ).toEqual({ rendered: expected, loaded })
  })

  it('load the module a split loader is imported from with the loader only', async () => {
    const route = await loadRoute(
      `${head}import { loadData } from './loader'
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['component']],
  loader: loadData,
  component: () => <p>page</p>,
})
`,
      {
        files: {
          'log.ts': `export const log: Array<string> = []\n`,
          'loader.ts': `import { log } from './log'
log.push('./loader')
export const loadData = () => 'data'
`,
        },
      },
    )
    expect(
      await route.run(`const { log } = await app('log.ts')
const before = [...log]
return [before, await options.loader(), log]`),
    ).toEqual([[], 'data', ['./loader']])
    expect(await route.isLazy('loader')).toBe(true)
  })

  it('split a loader declared as a local function without a warning', async () => {
    const route = await loadRoute(`${head}function load() {
  return 'data'
}
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['component']],
  loader: load,
  component: () => <p>page</p>,
})
`)
    expect(await route.isLazy('loader')).toBe(true)
    expect(await route.run('return options.loader()')).toBe('data')
    await expectValidModules(route)
    expectNoProblems(await route.diagnostics())
  })
})

describe('route option values', () => {
  const files = {
    'imported.ts': `export const importedComponent = () => 'imported'\n`,
    'feature-flags.ts': `export const isEnabled = false\n`,
    'true-component.ts': `export default { Component: () => 'true', loader: () => 'true-loader' }\n`,
    'false-component.ts': `export const FalseComponent = () => 'false'
export const falseLoader = () => 'false-loader'
`,
  }

  it.each([
    {
      name: 'memo() of a local component',
      code: `import { memo } from 'react'
${head}export const Route = createFileRoute('/')({
  component: memo(Component),
})
function Component() {
  return <div>Component</div>
}`,
      rendered: '<div>Component</div>',
    },
    {
      name: 'React.memo() of a local component',
      code: `import React from 'react'
${head}export const Route = createFileRoute('/')({
  component: React.memo(Component),
})
function Component() {
  return <div>Component</div>
}`,
      rendered: '<div>Component</div>',
    },
    {
      name: 'React.memo() of an imported component',
      code: `import React from 'react'
${head}import { importedComponent } from './imported'
export const Route = createFileRoute('/')({
  component: React.memo(importedComponent),
})`,
      rendered: 'imported',
    },
    {
      name: 'a lowercase function declaration',
      code: `${head}export const Route = createFileRoute('/')({
  component,
  pendingComponent,
  errorComponent,
})
function component() {
  return <div>component</div>
}
function pendingComponent() {
  return <div>pending</div>
}
function errorComponent() {
  return <div>error</div>
}`,
      rendered: '<div>component</div>',
      others: {
        pendingComponent: '<div>pending</div>',
        errorComponent: '<div>error</div>',
      },
    },
    {
      name: 'a conditional expression',
      code: `${head}import { isEnabled } from './feature-flags'
import TrueImport from './true-component'
import { FalseComponent, falseLoader } from './false-component'
export const Route = createFileRoute('/posts')({
  component: isEnabled ? TrueImport.Component : FalseComponent,
  loader: isEnabled ? TrueImport.loader : falseLoader,
})`,
      rendered: 'false',
      loaded: 'false-loader',
      routeId: '/posts',
    },
  ])(
    'render when the component is $name',
    async ({ code, rendered, others = {}, loaded, routeId }) => {
      const route = await loadRoute(`${code}\n`, { files, routeId })
      await expectValidModules(route)
      expect(await route.isLazy('component')).toBe(true)
      expect(
        await route.run(`const others = {}
for (const option of ${JSON.stringify(Object.keys(others))}) {
  others[option] = await render(option)
}
return {
  rendered: await render('component'),
  others,
  loaded: ${loaded ? 'options.loader()' : 'undefined'},
}`),
      ).toEqual({ rendered, others, ...(loaded && { loaded }) })
    },
  )

  it('keep what only a conditional loader reads out of the split component', async () => {
    const route = await loadRoute(
      `${head}import { isEnabled } from './feature-flags'
import TrueImport from './true-component'
import { FalseComponent, falseLoader } from './false-component'
export const Route = createFileRoute('/posts')({
  component: isEnabled ? TrueImport.Component : FalseComponent,
  loader: isEnabled ? TrueImport.loader : falseLoader,
})
`,
      { files, routeId: '/posts' },
    )
    // D5: the split component's modules do not read the loader's binding
    // (an unused import specifier of a module they need is free, §5.9).
    expect(
      (await route.loadedBy('component')).some((code) =>
        readsImport(code, '/false-component.ts', 'falseLoader'),
      ),
    ).toBe(false)
    expect(
      await route.run(`return [options.loader(), await render('component')]`),
    ).toEqual(['false-loader', 'false'])
  })

  // TypeScript erases the cast: the value is the component.
  it('split a component wrapped in `as`', async () => {
    const route = await loadRoute(`${head}function Page() {
  return <p>page</p>
}
export const Route = createFileRoute('/')({ component: Page as any })
`)
    await expectValidModules(route)
    expect(await route.isLazy('component')).toBe(true)
    expect(await route.run(`return render('component')`)).toBe('<p>page</p>')
  })

  // Whether such options are split is pinned in known-bugs-code-splitter.test.ts
  // ("route options destructured from a call result are split or reported").
  it('created by a destructuring with defaults evaluate the call once', async () => {
    const route = await loadRoute(
      `${head}import { createBits } from './bits'
function defaultLoader() {
  return { message: 'default' }
}
function DefaultComponent() {
  return <div>Default</div>
}
const { component: MyComponent = DefaultComponent, loader = defaultLoader } =
  createBits()
export const Route = createFileRoute('/about')({
  component: MyComponent,
  loader,
})
`,
      {
        routeId: '/about',
        files: {
          'bits.ts': `export let calls = 0
export const createBits = () => {
  calls++
  return {
    component: () => 'About',
    loader: () => ({ message: 'hello' }),
  }
}
`,
        },
      },
    )
    await expectValidModules(route)
    expect(
      await route.run(`return [
  (await load('loader'))(),
  await render('component'),
  (await app('bits.ts')).calls,
]`),
    ).toEqual([{ message: 'hello' }, 'About', 1])
  })

  // Splitting a component written as a method is pinned in
  // known-bugs-code-splitter.test.ts ("a component written as a method
  // loads with its chunk"), and so is state shared with a split option
  // ("module state a method option shares with a split option is created
  // once"); split or not, the options keep working.
  // Source: #8504 code-splitter-route-options.test.ts "route options written
  // as methods or accessors" (methods only: no route file writes an option
  // as an accessor).
  it('written as methods keep working next to split options', async () => {
    const route = await loadRoute(`${head}const state = { count: 0 }
export const Route = createFileRoute('/')({
  loader() {
    state.count++
    return state
  },
  component() {
    return <div>component {state.count}</div>
  },
  errorComponent: () => <div>error</div>,
})
`)
    await expectValidModules(route)
    expect(await route.isLazy('errorComponent')).toBe(true)
    expect(
      await route.run(`return [
  options.loader().count,
  await render('component'),
  await render('errorComponent'),
]`),
    ).toEqual([1, '<div>component 1</div>', '<div>error</div>'])
  })

  // Spread and computed option keys are split on a best-effort basis; the
  // route must keep working either way. A string key is a plain key.
  it.each([
    {
      name: 'a string key',
      code: `const C = () => <p>C</p>
export const Route = createFileRoute('/')({ 'component': C })`,
      split: true,
    },
    {
      name: 'a spread',
      code: `const base = { component: () => <p>C</p> }
export const Route = createFileRoute('/')({ ...base })`,
    },
    {
      name: 'a computed key',
      code: `const C = () => <p>C</p>
export const Route = createFileRoute('/')({ ['component']: C })`,
    },
  ])('render a component given through $name', async ({ code, split }) => {
    const route = await loadRoute(`${head}${code}\n`)
    await expectValidModules(route)
    expect(await route.run(`return render('component')`)).toBe('<p>C</p>')
    if (split) {
      expect(await route.isLazy('component')).toBe(true)
    }
  })
})

describe('route factories', () => {
  it('split a file route whose factory call has whitespace before its path', async () => {
    const route = await loadRoute(
      `${head}export const Route = createFileRoute ('/x')({
  component: () => <p>spaced</p>,
})
`,
      { routeId: '/x' },
    )
    // The input under test reaches the compiler as written (the generator
    // leaves a route file whose path is right as it is).
    expect(await route.host.dev.read('route.tsx')).toContain(
      "createFileRoute ('/x')",
    )
    expect(await route.isLazy('component')).toBe(true)
    expect(await route.run(`return render('component')`)).toBe('<p>spaced</p>')
  })

  // A root route created with `createRootRoute ({`, `createRootRouteWithContext
  // <...>()({` and the like is hot-updated on a real page:
  // integration/route-hmr-browser-plugin.test.ts.

  it('keep a root route created with a context type valid when compiled for HMR', async () => {
    const route = await loadRoute(
      `import { createRootRouteWithContext } from '@tanstack/react-router'
type Ctx = { user: string }
export const Route = createRootRouteWithContext<Ctx>()({
  component: () => <p>root</p>,
})
`,
      { hmr: true },
    )
    await expectValidModules(route)
    expect(await route.run(`return render('component')`)).toBe('<p>root</p>')
  })
})
