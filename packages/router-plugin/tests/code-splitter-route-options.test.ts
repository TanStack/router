import { describe, expect, it } from 'vitest'
import { expectNoProblems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
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
    // SPEC J2.5: the component's code does not load with the route module, and its
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

  // A leading comment (a triple-slash directive) belongs to the first
  // statement; when that import statement loses a name only the split
  // component reads, the route module still declares each generated binding
  // once. Source: the react-start and solid-start e2e apps (their root
  // routes start with `/// <reference types="vite/client" />`).
  it('are split when the route module starts with a comment before an import the component shares', async () => {
    const route = await loadRoute(
      `/// <reference types="vite/client" />
import { createFileRoute, useRouter } from '@tanstack/react-router'
function Page() {
  return <p data-mark="MARK_PAGE">{typeof useRouter()}</p>
}
export const Route = createFileRoute('/')({
  component: Page,
})
`,
    )
    expect(await route.isLazy('component')).toBe(true)
    await expectValidModules(route)
    expect(await route.run('return renderRoute()')).toBe(
      '<p data-mark="MARK_PAGE">object</p>',
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
describe('deleted options', () => {
  // A server route's only option is `server` (deleted on the client, Start's
  // list): the client module must still parse. Source: the perf harness app
  // (`/api/*` routes compiled in the client dev environment).
  it('erase the only option together with its trailing comma', async () => {
    const route = await loadRoute(
      `${head}export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => Response.json({ ok: true }),
    },
  },
})
`,
      { deleteNodes: ['server'], routeId: '/api/health' },
    )
    await expectValidModules(route)
    const { modules } = await route.modules()
    expect(modules.reference).not.toContain('handlers')
    expectNoProblems(await route.diagnostics())
  })

  // SPEC G16 through destructuring: a binding only the deleted option read
  // leaves its pattern, and the module only its default reads is not
  // requested; the binding the loader reads stays (loaders stay in the
  // route module under the default groupings).
  it('take with them a destructured binding only they read', async () => {
    const route = await loadRoute(
      `${head}import { secret } from './secret'
const config: Record<string, string | undefined> = { label: 'page' }
const { token = secret(), label } = config
export const Route = createFileRoute('/')({
  server: {
    handlers: {
      GET: () => new Response(String(token)),
    },
  },
  loader: () => label,
})
`,
      {
        deleteNodes: ['server'],
        files: { 'secret.ts': `export const secret = () => 'secret'\n` },
      },
    )
    await expectValidModules(route)
    expect(await route.run('return options.loader()')).toBe('page')
    expect(await route.requested()).not.toContain('/secret.ts')
  })
})

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
    // SPEC J2.5: the split component's modules do not read the loader's binding
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

  // A CSS module import is a value import like any other: it follows the
  // split component that reads it (only a bare `import './x.css'` stays in
  // the route module).
  it('take the CSS module only the split component reads with the component', async () => {
    const route = await loadRoute(
      `${head}import styles from './page.module.css'
export const Route = createFileRoute('/')({
  component: () => <p className={styles.title}>page</p>,
})
`,
      { files: { 'page.module.css': '.title { color: rgb(1, 2, 3); }\n' } },
    )
    await expectValidModules(route)
    expect(await route.requested()).not.toContain('/page.module.css')
    expect(
      (await route.loadedBy('component')).some((code) =>
        readsImport(code, '/page.module.css'),
      ),
    ).toBe(true)
    expect(await route.run(`return render('component')`)).toMatch(
      /^<p class="[^"]*title[^"]*">page<\/p>$/,
    )
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
    // The input under test reaches the compiler with its whitespace (the
    // generator leaves a route file whose path is right as it is; the quote
    // character of the path is the generator's, J1.2).
    expect(await route.host.dev.read('route.tsx')).toMatch(
      /createFileRoute \((['"`])\/x\1\)/,
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

// Issue #8688: the router calls a route callback as a method of the options
// object (`options.loader(...)`), so a method or function-expression callback
// may read `this`. A split chunk's `lazyFn` wrapper calls the chunk's export
// detached (`this` undefined): such a callback stays in the route module,
// with a warning naming the file (SPEC J2.8: informed, never broken). An
// arrow function has the module's `this` wherever it evaluates and splits.
describe('route callbacks reading this (#8688)', () => {
  it.each([
    [
      'a method',
      `loader() { return this !== undefined && 'loader' in this ? 'MARK_THIS' : 'MARK_OTHER' },`,
    ],
    [
      'a function expression',
      `loader: function () { return this !== undefined && 'loader' in this ? 'MARK_THIS' : 'MARK_OTHER' },`,
    ],
  ])('keeps %s in the route module and warns', async (_name, option) => {
    const route = await loadRoute(
      `${head}export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['component']],
  ${option}
  component: () => <p>page</p>,
})
`,
    )
    await expectValidModules(route)
    expect(await route.isLazy('loader')).toBe(false)
    expect(await route.isLazy('component')).toBe(true)
    expect(await route.run('return options.loader()')).toBe('MARK_THIS')
    expectDiagnostic(await route.diagnostics(), {
      severity: 'warning',
      file: 'route.tsx',
      root: route.host.root,
    })
  })

  it('splits a method whose nested functions read their own this', async () => {
    const route = await loadRoute(
      `${head}export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['component']],
  loader() { return [1].map(function () { return this === undefined ? 'MARK_OWN' : 'MARK_OTHER' }) },
  component: () => <p>page</p>,
})
`,
    )
    await expectValidModules(route)
    expect(await route.isLazy('loader')).toBe(true)
    expect(await route.run('return options.loader()')).toEqual(['MARK_OWN'])
    expectNoProblems(await route.diagnostics())
  })
})

describe('option values the route module reassigns or shares', () => {
  // The options object holds the value a binding had when the route was
  // created; a split chunk could only re-export the live binding, which a
  // later assignment changes. Such an option stays in the route module,
  // with a warning.
  it('render the component a reassigned binding held when the route was created', async () => {
    const route = await loadRoute(`${head}const A = () => <a>A</a>
const B = () => <b>B</b>
let Page = A
function swap() {
  Page = B
}
export const Route = createFileRoute('/')({ component: Page })
swap()
`)
    await expectValidModules(route)
    expect(await route.run(`return render('component')`)).toBe('<a>A</a>')
    expect(await route.isLazy('component')).toBe(false)
    expectDiagnostic(await route.diagnostics(), {
      severity: 'warning',
      file: 'route.tsx',
      root: route.host.root,
    })
  })

  // `loader.staleReloadMode` is read from the route module's loader object;
  // only the handler of an object-form loader is lazy.
  it('split the handler of an object-form loader passed by reference and keep its other options', async () => {
    const route = await loadRoute(`${head}const loader = {
  handler: () => 'loaded',
  staleReloadMode: 'blocking' as const,
}
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['component']],
  loader,
  component: () => <p>C</p>,
})
`)
    await expectValidModules(route)
    expect(await route.isLazy('loader')).toBe(true)
    expect(
      await route.run(
        `return [options.loader.staleReloadMode, await options.loader.handler()]`,
      ),
    ).toEqual(['blocking', 'loaded'])
  })

  // A regex literal is an object with state (`lastIndex`): one instance,
  // shared by the route module and the split options.
  it('share one regex literal between the route module and a split component', async () => {
    const route = await loadRoute(`${head}const re = /x/g
export const Route = createFileRoute('/')({
  loader: () => {
    re.lastIndex = 5
    return re.lastIndex
  },
  component: () => <p>{re.lastIndex}</p>,
})
`)
    await expectValidModules(route)
    expect(await route.isLazy('component')).toBe(true)
    expect(
      await route.run(`options.loader()
return render('component')`),
    ).toBe('<p>5</p>')
  })

  // An exported `let` and the exported function assigning it leave the
  // route module together when only a split option reads them; another
  // module importing either name still gets the live binding.
  it('keep an exported let and its setter importable when a split component reads them', async () => {
    const route = await loadRoute(
      `${head}export let theme = 'light'
export const setTheme = (t: string) => {
  theme = t
}
export const Route = createFileRoute('/')({ component: () => <p>{theme}</p> })
`,
      {
        files: {
          'theme-consumer.ts': `import { theme, setTheme } from './route'
export const read = () => theme
export { setTheme }
`,
        },
      },
    )
    await expectValidModules(route)
    expect(await route.isLazy('component')).toBe(true)
    expect(
      await route.run(`const consumer = await app('theme-consumer.ts')
const before = consumer.read()
consumer.setTheme('dark')
return [before, consumer.read(), await render('component')]`),
    ).toEqual(['light', 'dark', '<p>dark</p>'])
  })
})

describe('deleteNodes, with route HMR', () => {
  // The deleted option is the route's only option and a method: its removal
  // spans what route HMR would hoist for React Refresh. It is removed with
  // what only it reads.
  it('removes a component option written as a method', async () => {
    const route = await loadRoute(
      `${head}import { readSecret } from './secret'
export const Route = createFileRoute('/')({ pendingComponent() { return <p>{readSecret()}</p> } })
`,
      {
        hmr: true,
        deleteNodes: ['pendingComponent'],
        files: {
          'secret.ts': `export const readSecret = () => 'MARK_SECRET'\n`,
        },
      },
    )
    await expectValidModules(route)
    expect(await route.run(`return 'pendingComponent' in options`)).toBe(false)
    expect(
      (await route.eagerModules()).some((code) =>
        holdsMarker(code, 'readSecret'),
      ),
    ).toBe(false)
  })
})
