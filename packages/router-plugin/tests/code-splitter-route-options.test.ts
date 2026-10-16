import { describe, expect, it } from 'vitest'
import {
  compileRouteModules,
  declarationOf,
  expectValidModules,
  head,
  importSources,
  importedNames,
  loadRoute,
} from './regression-helpers'
import type { CodeSplitGroupings } from '../src/core/constants'

/**
 * The router package with a route that records how many times it was
 * created and answers the hooks split components call on `Route`.
 */
function routeStub(hooks: Record<string, unknown> = {}) {
  const state = { created: 0 }
  const route = (options: unknown) => {
    state.created++
    return { options, ...hooks }
  }
  return {
    state,
    stubs: {
      '@tanstack/react-router': {
        createFileRoute: () => route,
        createRootRoute: route,
        createRootRouteWithContext: () => route,
      },
    },
  }
}

describe('route options', () => {
  it('are split when declared in a variable', async () => {
    const { state, stubs } = routeStub({ useLoaderData: () => ['a', 'b'] })
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
      { stubs: { ...stubs, './api': { fetchPosts: () => 'posts' } } },
    )
    const { modules } = route
    expect(route.isLazy('component')).toBe(true)
    expect(modules.reference).not.toMatch(declarationOf('Posts'))
    expect(importedNames(modules.reference!, './api')).toEqual(['fetchPosts'])
    expect(importSources(modules['virtual component']!)).not.toContain('./api')
    await expectValidModules(modules)
    // The split component reads the route the route module created.
    expect([
      route.options.loader(),
      (await route.load('component'))(),
      state.created,
    ]).toEqual(['posts', '<ul>2</ul>', 1])
  })

  it('that repeat a split key are split like the runtime object: the last one wins', async () => {
    const { modules } =
      compileRouteModules(`${head}export const Route = createFileRoute('/')({
  component: () => <div>first-marker</div>,
  component: () => <div>last-marker</div>,
})
`)
    expect(modules['virtual component']).toContain('last-marker')
    expect(modules['virtual component']).not.toContain('first-marker')
    await expectValidModules(modules)
  })

  it.each([
    { option: 'errorComponent', value: false },
    { option: 'pendingComponent', value: null },
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
    expect(route.isLazy(option)).toBe(false)
  })
})

describe('route option values', () => {
  const react = {
    memo: (component: unknown) => component,
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
      rendered: '<div>imported</div>',
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
      rendered: '<div>false</div>',
      loaded: 'false-loader',
    },
  ])(
    'render when the component is $name',
    async ({ code, rendered, others = {}, loaded }) => {
      const route = await loadRoute(`${code}\n`, {
        stubs: {
          react: { default: react, ...react },
          './imported': { importedComponent: () => '<div>imported</div>' },
          './feature-flags': { isEnabled: false },
          './true-component': {
            default: { Component: () => 'true', loader: () => 'true-loader' },
          },
          './false-component': {
            FalseComponent: () => '<div>false</div>',
            falseLoader: () => 'false-loader',
          },
        },
      })
      await expectValidModules(route.modules)
      expect(route.isLazy('component')).toBe(true)
      expect((await route.load('component'))()).toBe(rendered)
      for (const [option, html] of Object.entries(others)) {
        expect((await route.load(option))()).toBe(html)
      }
      if (loaded) {
        expect(route.options.loader()).toBe(loaded)
      }
    },
  )

  it('keep the loader-only import of a conditional loader in the route module', () => {
    const { modules } =
      compileRouteModules(`${head}import { isEnabled } from './feature-flags'
import TrueImport from './true-component'
import { FalseComponent, falseLoader } from './false-component'
export const Route = createFileRoute('/posts')({
  component: isEnabled ? TrueImport.Component : FalseComponent,
  loader: isEnabled ? TrueImport.loader : falseLoader,
})
`)
    expect(importedNames(modules.reference!, './false-component')).toEqual([
      'falseLoader',
    ])
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
                component: () => '<div>About</div>',
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
      (await route.load('component'))(),
      calls,
    ]).toEqual([{ message: 'hello' }, '<div>About</div>', 1])
  })

  // Spread and computed option keys are split on a best-effort basis; the
  // route must keep working either way.
  it.each([
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
  ])('render a component given through $name', async ({ code }) => {
    const route = await loadRoute(`${head}${code}\n`)
    await expectValidModules(route.modules)
    expect((await route.load('component'))()).toBe('<p>C</p>')
  })
})

describe('route factories', () => {
  it('split a file route whose factory call has whitespace before its path', async () => {
    const route =
      await loadRoute(`${head}export const Route = createFileRoute ('/x')({
  component: () => <p>spaced</p>,
})
`)
    expect(route.isLazy('component')).toBe(true)
    expect((await route.load('component'))()).toBe('<p>spaced</p>')
  })

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
    expect((await route.load('component'))()).toBe('<p>root</p>')
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
   * Which options load lazily, grouped by the module they load: options
   * loaded together load one module.
   */
  async function lazyGroups(
    code: string,
    pluginOptions: Parameters<typeof loadRoute>[1] = {},
  ) {
    const loaded = await loadRoute(code, pluginOptions)
    const groups: Array<Array<string>> = []
    for (const option of ['loader', 'component', 'errorComponent']) {
      if (!loaded.isLazy(option)) {
        continue
      }
      const before = loaded.evaluated.length
      await loaded.load(option)
      if (loaded.evaluated.length > before) {
        groups.push([option])
      } else {
        groups.at(-1)!.push(option)
      }
    }
    expect([
      (await loaded.load('loader'))(),
      (await loaded.load('component'))(),
      (await loaded.load('errorComponent'))(),
    ]).toEqual(['data', '<p>page</p>', '<p>error</p>'])
    return groups
  }

  it('of the route split the options of a group into one module', async () => {
    expect(
      await lazyGroups(
        route(`  codeSplitGroupings: [['loader', 'component']],\n`),
      ),
    ).toEqual([['loader', 'component']])
  })

  it('of the route split nothing when empty', async () => {
    expect(await lazyGroups(route(`  codeSplitGroupings: [],\n`))).toEqual([])
  })

  it('of the route that are not arrays of arrays are refused with an error naming codeSplitGroupings', () => {
    expect(() =>
      compileRouteModules(route(`  codeSplitGroupings: ['loader'],\n`)),
    ).toThrow(/codeSplitGroupings/)
  })

  // Honouring groupings declared in a module-level constant is pinned in
  // known-bugs-code-splitter.test.ts; until then the route is refused
  // clearly, never split with other groupings.
  it('of the route given through a variable are honoured or refused with an error naming codeSplitGroupings', async () => {
    const code = `${head}const groupings = [['loader'], ['component']]
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
    expect([loaded.isLazy('loader'), loaded.isLazy('component')]).toEqual([
      true,
      true,
    ])
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
      expected: [['loader', 'component']],
    },
    {
      name: 'defaultBehavior when splitBehavior returns undefined',
      splitBehavior: () => undefined,
      expected: [['loader', 'errorComponent']],
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
  expect([route.options.loader(), (await route.load('component'))()]).toEqual([
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
      const { stubs } = routeStub({
        useLoaderData: () => [1, 2],
        useSearch: () => ({ page: 2 }),
      })
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
        { stubs },
      )
      const { modules } = route
      expect(modules.reference).toMatch(declarationOf('fetchPosts'))
      expect(modules.reference).toMatch(declarationOf('prefix'))
      expect(modules['virtual component']).not.toMatch(
        declarationOf('fetchPosts'),
      )
      expect(modules['virtual component']).not.toMatch(declarationOf('prefix'))
      await expectValidModules(modules)
      expect([
        route.options.loader(),
        (await route.load('component'))(),
      ]).toEqual([[['post:1'], '0'], '<p>2</p>'])
    },
  )

  it('do not turn a reassigned loader-only binding into an import', () => {
    const { modules } = compileRouteModules(`${head}let label = 'initial'
label = 'updated'
export const Route = createFileRoute('/label')({
  loader: () => label,
  component: () => <p>{Route.useLoaderData()}</p>,
})
`)
    // An imported binding is read-only: `label = ...` would throw at runtime
    expect(modules.reference).toMatch(declarationOf('label'))
    expect(importSources(modules.reference!)).toEqual([
      '@tanstack/react-router',
    ])
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
    expect([route.options.loader(), (await route.load('component'))()]).toEqual(
      [0, '<div>0function</div>'],
    )
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
    'give the loader and the component a helper that reads Route $name',
    async ({ helpers }) => {
      const { stubs } = routeStub({ fullPath: '/about' })
      const route = await loadRoute(
        `${head}${helpers}
export const Route = createFileRoute('/about')({
  loader: async () => ({ title: usePageTitle() }),
  component: () => <div>{usePageTitle()}</div>,
  errorComponent: () => <p>{usePageTitle()}</p>,
})
`,
        { stubs },
      )
      await expectValidModules(route.modules)
      expect([
        await route.options.loader(),
        (await route.load('component'))(),
        (await route.load('errorComponent'))(),
      ]).toEqual([
        { title: 'Page - /about' },
        '<div>Page - /about</div>',
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
      (await route.load('component'))(),
      (await route.load('errorComponent'))(),
      (await route.load('notFoundComponent'))(),
      calls,
    ]).toEqual([42, '<div>42</div>', '<p>error 42</p>', '<p>not found</p>', 1])
  })
})
