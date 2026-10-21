// Second half of code-splitter-route-options.test.ts (split for the fast
// tier's per-file time): code-split groupings, source text the split route
// keeps, options that read the Route singleton, root routes and code next
// to the route options.
import { describe, expect, it } from 'vitest'
import {
  diagnosticsOf,
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import {
  expectValidModules,
  head,
  holdsMarker,
  loadRoute,
} from '../../route-app'
import { directivesOfFunctionsHolding } from '../../served-code'
import type { Diagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import type { RouteApp, RouteAppOptions } from '../../route-app'
import type { CodeSplittingOptions } from '../../../src/vite'

type CodeSplitGroupings = NonNullable<CodeSplittingOptions['defaultBehavior']>

describe('code-split groupings', () => {
  const route = (
    groupings = '',
  ) => `${head}export const Route = createFileRoute('/')({
${groupings}  loader: () => 'data',
  component: () => <p>page</p>,
  errorComponent: () => <p>error</p>,
})
`

  /** The route works: its loader and both components. */
  const works = (loaded: RouteApp) =>
    loaded.run(`return [
  await options.loader(),
  await render('component'),
  await render('errorComponent'),
]`)

  /**
   * Which options load lazily, grouped by what loads together (`groups`),
   * once the route still works.
   */
  async function lazyGroups(code: string, options: RouteAppOptions = {}) {
    const loaded = await loadRoute(code, options)
    expect(await works(loaded)).toEqual(['data', '<p>page</p>', '<p>error</p>'])
    return loaded.groups()
  }

  /**
   * Compiles the route module: what compiling it threw (none: `undefined`),
   * with everything the dev server reported, on every channel.
   */
  async function compileOutcome(loaded: RouteApp) {
    let thrown: Array<Diagnostic> | undefined
    try {
      await loaded.transform()
    } catch (error) {
      thrown = diagnosticsOf(error)
    }
    return { thrown, diagnostics: await loaded.diagnostics() }
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

  // Type-invalid input (TS2322 against the real `codeSplitGroupings` type:
  // an array of option names where groups are expected), so a
  // never-fail-silently diagnostic control (SPEC §8, G5), not supported
  // grouping coverage: an error naming codeSplitGroupings, or a working
  // route that is either reported (naming the file or codeSplitGroupings)
  // or split safely (unsplit, or the one group `[['loader']]` the input
  // spells). Valid groupings: the tests around this one. The error is read
  // with every channel of the dev server (§5.7: the thrown error may point
  // at a report logged next to it).
  it('of the route that are not arrays of arrays (type-invalid) are refused, reported or applied safely', async () => {
    const loaded = await loadRoute(route(`  codeSplitGroupings: ['loader'],\n`))
    const { thrown, diagnostics } = await compileOutcome(loaded)
    if (thrown) {
      expectDiagnostic([...thrown, ...diagnostics], {
        severity: 'error',
        names: ['codeSplitGroupings'],
      })
      return
    }
    expect(await works(loaded)).toEqual(['data', '<p>page</p>', '<p>error</p>'])
    const reported = await loaded.diagnostics()
    // (a warning: the route works, so it was not refused)
    const told =
      findDiagnostics(reported, {
        severity: 'warning',
        names: ['codeSplitGroupings'],
      }).length > 0 ||
      findDiagnostics(reported, {
        severity: 'warning',
        file: 'route.tsx',
        root: loaded.host.root,
      }).length > 0
    if (!told) {
      expect([[], [['loader']]]).toContainEqual(await loaded.groups())
    }
  })

  // Honouring groupings declared in a module-level constant is pinned in
  // known-bugs-code-splitter.test.ts; until then the route is refused
  // clearly (an error naming codeSplitGroupings, on any channel), never
  // split with other groupings.
  it('of the route given through a variable are honoured or refused with an error naming codeSplitGroupings', async () => {
    const loaded =
      await loadRoute(`${head}const groupings: Array<Array<'loader' | 'component'>> = [['loader'], ['component']]
export const Route = createFileRoute('/')({
  codeSplitGroupings: groupings,
  loader: () => 'data',
  component: () => <p>page</p>,
})
`)
    const { thrown, diagnostics } = await compileOutcome(loaded)
    if (thrown) {
      expectDiagnostic([...thrown, ...diagnostics], {
        severity: 'error',
        names: ['codeSplitGroupings'],
      })
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
// and attributes as the JSX transform reads them). The untouched file is the
// same source as another module of the app, which no route registers: the
// project's own transform, without the router's compilers.
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
    const route = await loadRoute(code, {
      files: { 'untouched.tsx': code },
    })
    await expectValidModules(route)
    expect(await route.isLazy('component')).toBe(true)
    const [split, untouched, lazyUntouched] = await route.run<
      [unknown, unknown, boolean]
    >(`const untouched = (await app('untouched.tsx')).Route.options
return [
  [options.loader(), await render('component')],
  [untouched.loader(), await renderComponent(untouched.component)],
  'preload' in untouched.component,
]`)
    // The control is not compiled by the router (no lazy component).
    expect(lazyUntouched).toBe(false)
    expect(split).toEqual(untouched)
    expect((split as Array<unknown>)[0]).toBe('first\nsecond')
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
  expect(
    await route.run(`return [options.loader(), await render('component')]`),
  ).toEqual([{ data: 'Usuário🤠' }, '<div>标题: Usuário 🤡</div>'])
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
  return [prefix + 1].filter((item) => item !== 'MARK_FETCH_POSTS')
}
export const Route = createFileRoute('/posts')({
  loader: () => [fetchPosts(), format(0)],
  component: ${component},
})
`,
        { routeId: '/posts' },
      )
      // D5: the split component's modules hold neither `fetchPosts` nor
      // `prefix` (their user markers).
      const chunk = await route.loadedBy('component')
      expect(
        chunk.some(
          (code) =>
            holdsMarker(code, 'MARK_FETCH_POSTS') || holdsMarker(code, 'post:'),
        ),
      ).toBe(false)
      // ... what loads with the route module (the loader's) holds both
      const eager = await route.eagerModules()
      expect(
        ['MARK_FETCH_POSTS', 'post:'].filter((marker) =>
          eager.some((code) => holdsMarker(code, marker)),
        ),
      ).toEqual(['MARK_FETCH_POSTS', 'post:'])
      await expectValidModules(route)
      // The loader's data has two items; the search has `page=2`.
      expect(
        await route.run(`return [
  options.loader(),
  await renderRoute({ at: '/posts?page=2' }),
]`),
      ).toEqual([[['post:1'], '0'], '<p>2</p>'])
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
    await expectValidModules(route)
    expect(await route.run('return renderRoute()')).toBe('<p>updated</p>')
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
    await expectValidModules(route)
    expect(
      await route.run(`return [options.loader(), await render('component')]`),
    ).toEqual([0, '<div>0function</div>'])
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
      await expectValidModules(route)
      // The router gives the route it loads its path: every option reads it
      // from that one route.
      expect(
        await route.run(`return [
  await renderRoute(),
  await options.loader(),
  await render('errorComponent'),
]`),
      ).toEqual([
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
        files: {
          'state.ts': `export let calls = 0
export const init = (value: number) => {
  calls++
  return value
}
`,
        },
      },
    )
    await expectValidModules(route)
    expect(
      await route.run(`return [
  options.beforeLoad(),
  await render('component'),
  await render('errorComponent'),
  await render('notFoundComponent'),
  (await app('state.ts')).calls,
]`),
    ).toEqual([42, '<div>42</div>', '<p>error 42</p>', '<p>not found</p>', 1])
  })
})

describe('code next to the route options', () => {
  // A top-level call on the route after its definition runs once, with the
  // route module, also once a split option loads. Shape of the deleted
  // code-splitter snapshot fixture inline (`Route.addChildren([])`), as an
  // app registers a route with a helper of its own.
  it('runs a top-level call that receives the route once', async () => {
    const route = await loadRoute(
      `${head}import { registerRoute } from './registry'
export const Route = createFileRoute('/')({
  component: () => <p>page</p>,
})
registerRoute(Route)
`,
      {
        files: {
          'registry.ts': `export const registered: Array<unknown> = []
export const registerRoute = (value: unknown) => registered.push(value)
`,
        },
      },
    )
    expect(
      await route.run(`const html = await render('component')
const { registered } = await app('registry.ts')
return [html, registered.length, registered[0] === Route]`),
    ).toEqual(['<p>page</p>', 1, true])
    expect(await route.isLazy('component')).toBe(true)
  })

  // A directive in a function body applies to that function, wherever it
  // moves: here React Compiler's opt-out of a component. Shape of the
  // deleted code-splitter snapshot fixture random-number. Name- and
  // form-independent: every function of the route's modules whose own body
  // renders the chart starts with the directive (SPEC N12: not one
  // FunctionDeclaration named Chart).
  it("keeps a 'use no memo' directive in the body of a component that moves into a chunk", async () => {
    const route = await loadRoute(`${head}function Chart() {
  'use no memo'
  return <p>chart</p>
}
export const Route = createFileRoute('/')({
  component: () => <Chart />,
})
`)
    await expectValidModules(route)
    expect(await route.isLazy('component')).toBe(true)
    expect(await route.run(`return render('component')`)).toBe('<p>chart</p>')

    const { modules } = await route.modules()
    const directives = Object.values(modules).flatMap((code) =>
      directivesOfFunctionsHolding(code, 'chart'),
    )
    expect(directives.length).toBeGreaterThan(0)
    expect(directives).toEqual(directives.map(() => 'use no memo'))
  })
})
