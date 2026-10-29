// Slow-tier half of this suite: the tests that need a real tool. Its
// page tests are in pages/known-bugs-code-splitter.test.ts.
/**
 * Known code-splitter bugs. Each test asserts the correct behaviour for a bug
 * main had, which today's compiler fixes (a regression test,
 * oracle/KNOWN-BUGS.md).
 */
import { describe, expect, test } from 'vitest'
import {
  build,
  buildAndRun,
  head,
  routeApp,
  ssrRenderEntry,
} from '../build-harness'
import { loadRoute } from '../route-app'

describe('module state shared with split chunks', () => {
  // Bug: a `let` that code in another module than its declaration reassigns
  // is imported there, read-only: a `let` the loader reassigns is shared, so
  // the route module assigns to an import of the shared module; an exported
  // `let` the split component reassigns stays in the route module, which the
  // chunk imports it from ("Cannot assign to import").
  // Impact: the route cannot be built as soon as code splitting is on.
  // A real build, as the user sees it: the bundler rejects the assignment.
  // (Evaluated without a bundler, as in code-splitter-scope.test.ts, the
  // first row throws "Assignment to constant variable" on load.)
  test.each([
    {
      name: 'the loader reassigns',
      route: `${head}let count = 0
export const Route = createFileRoute('/')({
  loader: () => { count++; return count },
  component: () => <p>{count}</p>,
})`,
      script: `const loaded = [await entry.Route.options.loader({}), await entry.Route.options.loader({})]
return [...loaded, await entry.render(entry.Route.options.component)]`,
      expected: [1, 2, '<p>2</p>'],
    },
  ])(
    'a let $name stays writable and the split component reads its value',
    async ({ route, script, expected }) => {
      expect(await buildAndRun(route, script)).toEqual(expected)
    },
    30_000,
  )
  // The entry re-exports `count` next to `Route`, as the script reads it.
  test.each([
    {
      name: 'the split component reassigns (exported)',
      route: `${head}export let count = 0
function Page() {
  count++
  return <p>{count}</p>
}
export const Route = createFileRoute('/')({ component: Page })`,
      script: `const component = entry.Route.options.component
return [await entry.render(component), await entry.render(component), entry.count]`,
      expected: ['<p>1</p>', '<p>2</p>', 2],
    },
  ])(
    'a let $name stays writable and the split component reads its value',
    async ({ route, script, expected }) => {
      expect(
        await buildAndRun(route, script, {
          files: {
            'entry.ts': ssrRenderEntry.replace(
              "export { Route } from './routes/index'",
              "export { Route, count } from './routes/index'",
            ),
          },
        }),
      ).toEqual(expected)
    },
    30_000,
  )
})

describe('split route options', () => {
  /** Loads `/` with a real router and returns each match's loader data. */
  const routerEntry = `import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export async function load() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return router.state.matches.map((match) => match.loaderData ?? null)
}`

  function loadWithSplitLoader(loader: string, declarations = '') {
    return buildAndRun(
      `${head}${declarations}export const Route = createFileRoute('/')({
  loader: ${loader},
  component: () => <p>index</p>,
})`,
      `return await entry.load()`,
      {
        files: { 'entry.ts': routerEntry },
        groupings: [['loader'], ['component']],
      },
    )
  }

  // Control for the object-form loader pin below (same harness).
  test('a split loader loads route data', async () => {
    expect(await loadWithSplitLoader(`() => 'loaded'`)).toEqual([
      null,
      'loaded',
    ])
  }, 30_000)

  // Bug: the object form `loader: { handler }` cannot be split: the virtual
  // compiler throws "Unexpected splitNode type ☝️: ObjectExpression".
  // Splitting only the handler, or keeping the object in the route module,
  // are both valid fixes.
  // Impact: a route with an object-form loader cannot be built once the
  // loader is split.
  test.each([
    { name: 'an arrow handler', loader: `{ handler: () => 'loaded' }` },
    { name: 'a method handler', loader: `{ handler() { return 'loaded' } }` },
    {
      name: 'a spread after the handler',
      loader: `{ handler: () => 'loaded', ...defaults }`,
      declarations: `const defaults = { staleReloadMode: 'blocking' as const }\n`,
    },
  ])(
    'a split loader in object form with $name loads route data',
    async ({ loader, declarations }) => {
      expect(await loadWithSplitLoader(loader, declarations)).toEqual([
        null,
        'loaded',
      ])
    },
    30_000,
  )

  // Bug: an object-form loader passed by reference (`loader` holding
  // `{ handler }`) is split as if it were the loader function, so the route
  // calls the object ("... is not a function").
  // Impact: the route's data never loads once the loader is split.
  test('a split loader in object form passed by reference loads route data', async () => {
    expect(
      await loadWithSplitLoader(
        'loader',
        `const loader = { handler: () => 'loaded' }\n`,
      ),
    ).toEqual([null, 'loaded'])
  }, 30_000)
})

describe('exported bindings', () => {
  /**
   * An entry that imports `Route` and, like another module of the app,
   * `imports` from the route file, then runs `setup` before any split chunk
   * loads.
   */
  const entryImporting = (
    imports: string,
    setup: string,
  ) => `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { Route, ${imports} } from './routes/index'
export { Route }
${setup}
export async function render(component: any) {
  await component.preload?.()
  return renderToString(createElement(component))
}
`

  // Bug: a split chunk declares its own copy of the exported functions and
  // classes of the route file it reads (and of the private state they read),
  // so another module of the app that imports them gets other instances than
  // the split component. Build-level form of "module state that the
  // reference module keeps for a binding read by an exported function".
  // Source: #8504 (code-splitter-exported-bindings-identity.test.ts), where
  // they pass.
  // Impact: `instanceof` checks, registries and counters see two copies
  // once code splitting is on; module state is created twice.
  // (R77: a pure exported function, class or component is copied by rule;
  // state is one instance.)
  const exportedBindings = [
    {
      // One state: the entry's call is the first, the split component's the
      // second
      name: 'function over module state',
      route: `let count = 0
export function next() {
  return ++count
}
function Page() {
  return <p>{next()}</p>
}`,
      imports: 'next',
      setup: 'next()',
      expected: ['<p>2</p>'],
    },
    {
      // Created once and kept. The module that holds the state then has a
      // top-level call, so the bundler has to keep it where it is imported
      name: 'function over created state',
      route: `import { init } from '../state'
const state = init({ count: 0 })
export function increment() {
  return ++state.count
}
function Page() {
  return <p>{increment()}</p>
}`,
      imports: 'increment',
      setup: 'increment()',
      expected: ['<p>2</p>', 1],
    },
  ]
  const shareExported = async ({
    route,
    imports,
    setup,
    expected,
  }: (typeof exportedBindings)[number]) => {
    const result = await buildAndRun(
      `${head}${route}
export const Route = createFileRoute('/')({ component: Page })
`,
      `const html = await entry.render(entry.Route.options.component)
return globalThis.__inits === undefined ? [html] : [html, globalThis.__inits]`,
      {
        files: {
          'entry.ts': entryImporting(imports, setup),
          'state.ts': `export function init<T>(value: T) {
  ;(globalThis as any).__inits = ((globalThis as any).__inits ?? 0) + 1
  return value
}
`,
        },
      },
    )
    expect(result).toEqual(expected)
  }
  test.each(exportedBindings)(
    'the split component and other modules share an exported $name',
    shareExported,
    30_000,
  )
})

/**
 * The names a directory could share with the ids of the modules the
 * compilers emit for a route's split component: the query keys of those
 * modules' requests on a real dev server (`?tsr-split=component` gives
 * `tsr-split`), else the file name of a request whose path is not the
 * route file's. Read from the requests a page makes (`loadRoute`), so the
 * probe follows the compiler's own id scheme (assumed to hold the same
 * names in a build), each name cut into the parts a directory name can
 * hold (`virtual:tsr-split` gives `virtual` and `tsr-split`).
 */
async function splitIdNames(route: string) {
  const loaded = await loadRoute(route, { filename: 'routes/index.tsx' })
  const { ids } = await loaded.modules()
  const names = new Set<string>()
  for (const [label, id] of Object.entries(ids)) {
    if (label === 'reference') {
      continue
    }
    const url = new URL(id, 'http://app.invalid')
    const keys = [...url.searchParams.keys()]
    if (keys.length > 0) {
      keys.forEach((key) => names.add(key))
    } else if (url.pathname !== loaded.url) {
      names.add(
        url.pathname
          .split('/')
          .at(-1)!
          .replace(/\.[^.]*$/, ''),
      )
    }
  }
  return [
    ...new Set([...names].flatMap((name) => name.match(/[\w.-]+/g) ?? [])),
  ]
}

describe('app paths', () => {
  const route = `${head}export const Route = createFileRoute('/')({
  component: () => <p>index</p>,
})`
  const script = `return await entry.render(entry.Route.options.component)`

  // Control for the `#` pin below (same app, without `#`).
  test('an app builds and preloads a split component', async () => {
    expect(await buildAndRun(route, script)).toBe('<p>index</p>')
  }, 30_000)

  // Bug: the route module imports its chunks by absolute file path with the
  // split query (`<root>/routes/index.tsx?tsr-split=component`), and a `#`
  // in the path is read as the start of a URL fragment.
  // Impact: an app in a directory whose name contains `#` cannot be built
  // with code splitting ([UNRESOLVED_IMPORT]).
  test('an app in a directory with # in its name builds and preloads a split component', async () => {
    expect(
      await buildAndRun(route, script, { prefix: '.regression-build-#' }),
    ).toBe('<p>index</p>')
  }, 30_000)

  // Bug: the code splitter compiles every module whose id contains the
  // marker of its split ids (today `tsr-split`: path text, not its query)
  // as a split chunk, and throws "The split value for the virtual route ...
  // was not found" for the modules of an app in a directory named like
  // `tsr-split-demo`.
  // Source: mutation testing.
  // Impact: an app in such a directory cannot be built.
  // Fix-agnostic: the directory name holds what the compiler's own split
  // ids hold, read from the modules a dev server serves for the route's
  // split component (`splitIdNames`), whatever the compiler names them.
  test('an app in a directory whose name contains what split module ids contain builds and preloads a split component', async () => {
    const names = await splitIdNames(route)
    if (names.length === 0) {
      // Nothing to probe: the pin passes, so vitest reports it (an
      // expected failure must not come from the probe itself)
      return
    }
    for (const name of names) {
      expect(
        await buildAndRun(route, script, {
          prefix: `.regression-build-${name}-demo-`,
        }),
        `an app in a directory named after ${name}`,
      ).toBe('<p>index</p>')
    }
  }, 60_000)

  // Bug: the route module's chunk importers are built by pasting the
  // absolute file path into a single-quoted string
  // (`import('${splitUrl}')`), so a `'` in the path ends the string early.
  // Source: #7754.
  // Impact: an app in a directory whose name contains `'` (e.g. a user
  // folder) cannot be built or served once code splitting is on: every route
  // fails with a syntax error.
  test("an app in a directory with ' in its name builds and preloads a split component", async () => {
    expect(
      await buildAndRun(route, script, { prefix: ".regression-build-it's-" }),
    ).toBe('<p>index</p>')
  }, 30_000)
})

describe('code that reads a split binding', () => {
  // Bug: same root cause as above, in a real build.
  // Impact: the server render of the route throws "PostsPage is not defined"
  // when it runs head().
  test.each(['vite', 'rspack'] as const)(
    'an imported split component that head() reads renders, and head() reads it (%s build)',
    async (bundler) => {
      const app = await build({
        bundler,
        env: 'ssr',
        minify: false,
        files: routeApp(
          `${head}import { PostsPage } from '../posts-page'
export const Route = createFileRoute('/')({
  component: PostsPage,
  head: () => ({ meta: [{ title: PostsPage.title }] }),
})
`,
          {
            files: {
              'posts-page.tsx': `export function PostsPage() {
  return <p>posts</p>
}
PostsPage.title = 'Posts'
`,
            },
          },
        ),
      })
      const { result } = await app.run(
        `return [entry.Route.options.head().meta[0].title, await entry.render(entry.Route.options.component)]`,
      )
      expect(result).toEqual(['Posts', '<p>posts</p>'])
    },
    60_000,
  )
})

// `this` in split callbacks (a split loader called as a method of its
// chunk's namespace by router-core's `lazyFn`): a runtime cause (#8688),
// not pinned in the compiler tests.
