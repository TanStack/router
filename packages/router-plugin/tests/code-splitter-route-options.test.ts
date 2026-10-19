import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  compileRouteModules,
  declaredNames,
  evaluateModule,
  expectValidModules,
  head,
  importSources,
  importedNames,
  loadRoute,
  parseModule,
  renderComponent,
} from './regression-helpers'

import type { CodeSplitGroupings } from '../src/core/constants'

describe('route options', () => {
  it('are split when declared in a variable', async () => {
    const route = await loadRoute(
      `${head}import { fetchPosts } from './api'
function Posts() {
  return <ul>{Route.useLoaderData().length}</ul>
}
const options = {
  loader: () => fetchPosts(),
  component: Posts,
}
export const Route = createFileRoute('/posts')(options)
`,
      {
        routeId: '/posts',
        stubs: { './api': { fetchPosts: () => ['a', 'b'] } },
      },
    )
    const { modules } = route
    expect(await route.isLazy('component')).toBe(true)
    expect(declaredNames(modules.reference!)).not.toContain('Posts')
    expect(
      (await route.loadedBy('component')).flatMap(importSources),
    ).not.toContain('./api')
    await expectValidModules(modules)
    // The split component reads the route the router loaded: the one the
    // route module created.
    expect(await route.renderRoute()).toBe('<ul>2</ul>')
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
    await expectValidModules(route.modules)
    expect(option in route.options).toBe(true)
    expect(route.options[option]).toBe(value)
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
    await expectValidModules(route.modules)
    expect(await route.render('component')).toBe('<p>page</p>')
    expect([
      await (await route.load('loader'))(),
      route.options.errorComponent,
      route.options.pendingComponent,
      route.options.notFoundComponent,
    ]).toEqual(['data', false, undefined, undefined])
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
  expect(
    Object.fromEntries(
      await Promise.all(
        options.map(async (option) => [option, await route.isLazy(option)]),
      ),
    ),
  ).toEqual({
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
  const page = {
    default: () => 'page',
    ErrorView: () => 'error',
    Pending: () => 'pending',
    loadData: () => 'data',
    fallback: () => 'fallback',
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
    const route = await loadRoute(`${head}${code}\n`, {
      stubs: { './page': page, './flags': { isEnabled: true } },
    })
    await expectValidModules(route.modules)
    // Nothing the route module loads requests what only split options read.
    expect(route.eager).not.toContain('./page')
    const lazy = []
    for (const option of [...Object.keys(expected), 'loader']) {
      lazy.push(await route.isLazy(option))
    }
    expect(lazy).toEqual(lazy.map(() => true))
    for (const [option, html] of Object.entries(expected)) {
      expect(await route.render(option), option).toBe(html)
    }
    expect(await route.options.loader()).toBe(loaded)
  })

  it('load the module a split loader is imported from with the loader only', async () => {
    const log: Array<string> = []
    const route = await loadRoute(
      `${head}import { loadData } from './loader'
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['component']],
  loader: loadData,
  component: () => <p>page</p>,
})
`,
      {
        stubs: {
          './loader': {
            get loadData() {
              log.push('./loader')
              return () => 'data'
            },
          },
        },
      },
    )
    expect(await route.isLazy('loader')).toBe(true)
    const before = [...log]
    expect([before, await route.options.loader(), log]).toEqual([
      [],
      'data',
      ['./loader'],
    ])
  })

  it('split a loader declared as a local function without a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    onTestFinished(() => warn.mockRestore())
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
    expect(await route.options.loader()).toBe('data')
    expect(warn.mock.calls).toEqual([])
  })
})

describe('route option values', () => {
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
    },
  ])(
    'render when the component is $name',
    async ({ code, rendered, others = {}, loaded }) => {
      const route = await loadRoute(`${code}\n`, {
        stubs: {
          './imported': { importedComponent: () => 'imported' },
          './feature-flags': { isEnabled: false },
          './true-component': {
            default: { Component: () => 'true', loader: () => 'true-loader' },
          },
          './false-component': {
            FalseComponent: () => 'false',
            falseLoader: () => 'false-loader',
          },
        },
      })
      await expectValidModules(route.modules)
      expect(await route.isLazy('component')).toBe(true)
      expect(await route.render('component')).toBe(rendered)
      for (const [option, html] of Object.entries(others)) {
        expect(await route.render(option)).toBe(html)
      }
      if (loaded) {
        expect(route.options.loader()).toBe(loaded)
      }
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
      {
        stubs: {
          './feature-flags': { isEnabled: false },
          './true-component': {
            default: { Component: () => 'true', loader: () => 'true-loader' },
          },
          './false-component': {
            FalseComponent: () => 'false',
            falseLoader: () => 'false-loader',
          },
        },
      },
    )
    expect(
      (await route.loadedBy('component')).flatMap((code) =>
        importedNames(code, './false-component'),
      ),
    ).not.toContain('falseLoader')
    expect([route.options.loader(), await route.render('component')]).toEqual([
      'false-loader',
      'false',
    ])
  })

  // TypeScript erases the cast: the value is the component.
  it('split a component wrapped in `as`', async () => {
    const route = await loadRoute(`${head}function Page() {
  return <p>page</p>
}
export const Route = createFileRoute('/')({ component: Page as any })
`)
    await expectValidModules(route.modules)
    expect(await route.isLazy('component')).toBe(true)
    expect(await route.render('component')).toBe('<p>page</p>')
  })

  // Whether such options are split is pinned in known-bugs-code-splitter.test.ts
  // ("route options destructured from a call result are split or reported").
  it('created by a destructuring with defaults evaluate the call once', async () => {
    let calls = 0
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
        stubs: {
          './bits': {
            createBits: () => {
              calls++
              return {
                component: () => 'About',
                loader: () => ({ message: 'hello' }),
              }
            },
          },
        },
      },
    )
    await expectValidModules(route.modules)
    expect([
      (await route.load('loader'))(),
      await route.render('component'),
      calls,
    ]).toEqual([{ message: 'hello' }, 'About', 1])
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
    await expectValidModules(route.modules)
    expect(await route.isLazy('errorComponent')).toBe(true)
    expect([
      route.options.loader().count,
      await route.render('component'),
      await route.render('errorComponent'),
    ]).toEqual([1, '<div>component 1</div>', '<div>error</div>'])
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
    await expectValidModules(route.modules)
    expect(await route.render('component')).toBe('<p>C</p>')
    if (split) {
      expect(await route.isLazy('component')).toBe(true)
    }
  })
})

describe('route factories', () => {
  it('split a file route whose factory call has whitespace before its path', async () => {
    const route =
      await loadRoute(`${head}export const Route = createFileRoute ('/x')({
  component: () => <p>spaced</p>,
})
`)
    expect(await route.isLazy('component')).toBe(true)
    expect(await route.render('component')).toBe('<p>spaced</p>')
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
    await expectValidModules(route.modules)
    expect(await route.render('component')).toBe('<p>root</p>')
  })
})

describe('code-split groupings', () => {
  const route = (
    groupings = '',
  ) => `${head}export const Route = createFileRoute('/')({
${groupings}  loader: () => 'data',
  component: () => <p>page</p>,
  errorComponent: () => <p>error</p>,
})
`

  /**
   * Which options load lazily, grouped by what loads together (`groups`),
   * once the route still works.
   */
  async function lazyGroups(
    code: string,
    pluginOptions: Parameters<typeof loadRoute>[1] = {},
  ) {
    const loaded = await loadRoute(code, pluginOptions)
    expect([
      await loaded.options.loader(),
      await loaded.render('component'),
      await loaded.render('errorComponent'),
    ]).toEqual(['data', '<p>page</p>', '<p>error</p>'])
    return loaded.groups()
  }

  it('of the route split the options of a group into one module', async () => {
    expect(
      await lazyGroups(
        route(`  codeSplitGroupings: [['loader', 'component']],\n`),
      ),
    ).toEqual([['component', 'loader']])
  })

  it('of the route split nothing when empty', async () => {
    expect(await lazyGroups(route(`  codeSplitGroupings: [],\n`))).toEqual([])
  })

  it('of the route that are not arrays of arrays are refused with an error naming codeSplitGroupings', async () => {
    await expect(
      compileRouteModules(route(`  codeSplitGroupings: ['loader'],\n`)),
    ).rejects.toThrow(/codeSplitGroupings/)
  })

  // Honouring groupings declared in a module-level constant is pinned in
  // known-bugs-code-splitter.test.ts; until then the route is refused
  // clearly, never split with other groupings.
  it('of the route given through a variable are honoured or refused with an error naming codeSplitGroupings', async () => {
    const code = `${head}const groupings: Array<Array<'loader' | 'component'>> = [['loader'], ['component']]
export const Route = createFileRoute('/')({
  codeSplitGroupings: groupings,
  loader: () => 'data',
  component: () => <p>page</p>,
})
`
    let loaded
    try {
      loaded = await loadRoute(code)
    } catch (error) {
      expect(String(error)).toMatch(/codeSplitGroupings/)
      return
    }
    expect(await loaded.groups()).toEqual([['component'], ['loader']])
  })

  const defaultBehavior: CodeSplitGroupings = [['loader', 'errorComponent']]
  it.each([
    {
      name: 'the route option over splitBehavior and defaultBehavior',
      groupings: `  codeSplitGroupings: [['component', 'errorComponent']],\n`,
      splitBehavior: () => [['loader']] as CodeSplitGroupings,
      expected: [['component', 'errorComponent']],
    },
    {
      name: 'splitBehavior over defaultBehavior',
      splitBehavior: () => [['loader', 'component']] as CodeSplitGroupings,
      expected: [['component', 'loader']],
    },
    {
      name: 'defaultBehavior when splitBehavior returns undefined',
      splitBehavior: () => undefined,
      expected: [['errorComponent', 'loader']],
    },
  ])('apply $name', async ({ groupings, splitBehavior, expected }) => {
    expect(
      await lazyGroups(route(groupings), {
        pluginOptions: {
          codeSplittingOptions: { defaultBehavior, splitBehavior },
        },
      }),
    ).toEqual(expected)
  })
})

// Windows checkouts with `autocrlf` give route files CRLF line endings: the
// split route keeps the values the file has untouched (a template literal's
// line break is LF in its value, whatever the file's line ending; JSX text
// and attributes as the JSX transform reads them).
it('keeps the runtime values of a route file with CRLF line endings', async () => {
  const lines = (code: string) => code.replaceAll('\n', '\r\n')
  const source = `${head}const banner = \`first
second\`
export const Route = createFileRoute('/')({
  loader: () => banner,
  component: () => (
    <p title="a
b">
      text
      more
    </p>
  ),
})
`
  for (const code of [source, lines(source)]) {
    const route = await loadRoute(code)
    await expectValidModules(route.modules)
    expect(await route.isLazy('component')).toBe(true)
    const untouched = ((await evaluateModule(code)) as Record<string, any>)
      .Route.options
    expect([route.options.loader(), await route.render('component')]).toEqual([
      untouched.loader(),
      await renderComponent(untouched.component),
    ])
    expect(route.options.loader()).toBe('first\nsecond')
  }
})

// Source: TanStack/router#2361 and #3183, where non-ASCII text in a route
// file was printed as escape sequences, which JSX text and attributes do not
// interpret.
it('keeps non-ASCII characters of strings, JSX text and JSX attributes', async () => {
  const route = await loadRoute(`${head}function Labelled({ title, children }) {
  return <div>{title}: {children}</div>
}
export const Route = createFileRoute('/')({
  loader: () => ({ data: 'Usuário🤠' }),
  component: () => <Labelled title="标题">Usuário 🤡</Labelled>,
})
`)
  expect(await route.isLazy('component')).toBe(true)
  expect([route.options.loader(), await route.render('component')]).toEqual([
    { data: 'Usuário🤠' },
    '<div>标题: Usuário 🤡</div>',
  ])
})

describe('split options that read the Route singleton', () => {
  // `Route` stays in the reference module, so reading it from a split option
  // must not attribute every dependency of the route options to that option.
  it.each([
    {
      name: 'an inline arrow component',
      component: `() => <p>{format(Route.useLoaderData().length)}</p>`,
    },
    {
      name: 'an inline named function component',
      component: `function Posts() {
    const { page } = Route.useSearch()
    return <p>{format(page)}</p>
  }`,
    },
  ])(
    'keep in the route module what only the loader reads, next to $name',
    async ({ component }) => {
      const route = await loadRoute(
        `${head}const format = (value: unknown) => String(value)
const prefix = 'post:'
function fetchPosts() {
  return [prefix + 1]
}
export const Route = createFileRoute('/posts')({
  loader: () => [fetchPosts(), format(0)],
  component: ${component},
})
`,
        { routeId: '/posts' },
      )
      const { modules } = route
      const chunk = (await route.loadedBy('component')).flatMap((code) => [
        ...declaredNames(code),
      ])
      expect(chunk).not.toContain('fetchPosts')
      expect(chunk).not.toContain('prefix')
      await expectValidModules(modules)
      // The loader's data has two items; the search has `page=2`.
      expect([
        route.options.loader(),
        await route.renderRoute({ at: '/posts?page=2' }),
      ]).toEqual([[['post:1'], '0'], '<p>2</p>'])
    },
  )

  // An imported binding is read-only: `label = ...` would throw at runtime.
  it('keep a reassigned loader-only binding writable', async () => {
    const route = await loadRoute(
      `${head}let label = 'initial'
label = 'updated'
export const Route = createFileRoute('/label')({
  loader: () => label,
  component: () => <p>{Route.useLoaderData()}</p>,
})
`,
      { routeId: '/label' },
    )
    await expectValidModules(route.modules)
    expect(await route.renderRoute()).toBe('<p>updated</p>')
  })

  // That the loader and the component share one `cache` is pinned in
  // known-bugs-code-splitter.test.ts ("a destructuring whose sibling reads
  // Route").
  it('keep a destructuring whose sibling reads Route working', async () => {
    const route = await loadRoute(`${head}const getRoute = () => Route
const [cache, routeGetter] = [new Map(), getRoute]
export const Route = createFileRoute('/')({
  loader: () => cache.size,
  component: () => <div>{cache.size}{typeof routeGetter}</div>,
})
`)
    await expectValidModules(route.modules)
    expect([route.options.loader(), await route.render('component')]).toEqual([
      0,
      '<div>0function</div>',
    ])
  })

  it.each([
    {
      name: 'directly',
      helpers: `const HEADER = 'Page'
function usePageTitle() {
  return \`\${HEADER} - \${Route.fullPath}\`
}`,
    },
    {
      name: 'through a helper declared later',
      helpers: `const usePageTitle = () => useTitle()
const useTitle = () => HEADER + ' - ' + Route.fullPath
const HEADER = 'Page'`,
    },
  ])(
    'give the loader and the component a helper that reads Route $name, created once',
    async ({ helpers }) => {
      const route = await loadRoute(
        `${head}${helpers}
export const Route = createFileRoute('/about')({
  loader: async () => ({ title: usePageTitle() }),
  component: () => <div>{usePageTitle()}</div>,
  errorComponent: () => <p>{usePageTitle()}</p>,
})
`,
        { routeId: '/about' },
      )
      await expectValidModules(route.modules)
      // The router gives the route it loads its path: every option reads it
      // from that one route.
      expect([
        await route.renderRoute(),
        await route.options.loader(),
        await route.render('errorComponent'),
      ]).toEqual([
        '<div>Page - /about</div>',
        { title: 'Page - /about' },
        '<p>Page - /about</p>',
      ])
    },
  )
})

// Whether a root route's error and not-found components are split is pinned
// in known-bugs-code-splitter.test.ts ("a root route's errorComponent and
// notFoundComponent load lazily").
describe('root routes', () => {
  it('keep module state the route options share, created once', async () => {
    let calls = 0
    const route = await loadRoute(
      `import { createRootRoute } from '@tanstack/react-router'
import { init } from './state'
const shared = init(42)
export const Route = createRootRoute({
  beforeLoad: () => shared,
  component: () => <div>{shared}</div>,
  errorComponent: () => <p>error {shared}</p>,
  notFoundComponent: () => <p>not found</p>,
})
`,
      {
        routeId: '__root__',
        stubs: {
          './state': {
            init: (value: number) => {
              calls++
              return value
            },
          },
        },
      },
    )
    await expectValidModules(route.modules)
    expect([
      route.options.beforeLoad(),
      await route.render('component'),
      await route.render('errorComponent'),
      await route.render('notFoundComponent'),
      calls,
    ]).toEqual([42, '<div>42</div>', '<p>error 42</p>', '<p>not found</p>', 1])
  })
})

describe('code next to the route options', () => {
  // A top-level call on the route after its definition runs once, with the
  // route module, also once a split option loads. Shape of the deleted
  // code-splitter snapshot fixture inline (`Route.addChildren([])`), as an
  // app registers a route with a helper of its own.
  it('runs a top-level call that receives the route once', async () => {
    const registered: Array<unknown> = []
    const route = await loadRoute(
      `${head}import { registerRoute } from './registry'
export const Route = createFileRoute('/')({
  component: () => <p>page</p>,
})
registerRoute(Route)
`,
      {
        stubs: {
          './registry': {
            registerRoute: (value: unknown) => registered.push(value),
          },
        },
      },
    )
    expect(await route.render('component')).toBe('<p>page</p>')
    expect(registered).toEqual([route.Route])
    // (After the check: `isLazy` evaluates the route module again in a fork.)
    expect(await route.isLazy('component')).toBe(true)
  })

  // A directive in a function body applies to that function, wherever it
  // moves: here React Compiler's opt-out of a component. Shape of the
  // deleted code-splitter snapshot fixture random-number.
  it("keeps a 'use no memo' directive in the body of a component that moves into a chunk", async () => {
    const route = await loadRoute(`${head}function Chart() {
  'use no memo'
  return <p>chart</p>
}
export const Route = createFileRoute('/')({
  component: () => <Chart />,
})
`)
    await expectValidModules(route.modules)
    expect(await route.isLazy('component')).toBe(true)
    expect(await route.render('component')).toBe('<p>chart</p>')

    // Every module that declares `Chart` keeps the directive first in its
    // body.
    const declaring = Object.entries(route.modules).flatMap(([name, code]) =>
      parseModule(code)
        .body.filter(
          (statement) =>
            statement.type === 'FunctionDeclaration' &&
            statement.id?.name === 'Chart',
        )
        .map((statement) => {
          const [first] = (statement as any).body.body
          return [
            name,
            first?.type === 'ExpressionStatement' ? first.directive : undefined,
          ]
        }),
    )
    expect(declaring.length).toBeGreaterThan(0)
    expect(declaring).toEqual(declaring.map(([name]) => [name, 'use no memo']))
  })
})
