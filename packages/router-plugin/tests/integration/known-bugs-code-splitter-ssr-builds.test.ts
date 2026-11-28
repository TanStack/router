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
  buildWithRsbuild,
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

  function loadWithSplitLoader(
    loader: string,
    declarations = '',
    files: Record<string, string> = {},
  ) {
    return buildAndRun(
      `${head}${declarations}export const Route = createFileRoute('/')({
  loader: ${loader},
  component: () => <p>index</p>,
})`,
      `return await entry.load()`,
      {
        files: { 'entry.ts': routerEntry, ...files },
        groupings: [['loader'], ['component']],
      },
    )
  }

  // An imported function as the loader is split as main splits it (the
  // e2e code-splitting apps' `loader: fetchPosts`)
  test('a split loader given as an imported function loads route data', async () => {
    expect(
      await loadWithSplitLoader(
        'fetchData',
        `import { fetchData } from '../data'\n`,
        {
          'data.ts': `export async function fetchData() {\n  return 'loaded'\n}\n`,
        },
      ),
    ).toEqual([null, 'loaded'])
  })

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
    // (the route's component is split: its modules have ids to probe)
    expect(names).not.toEqual([])
    for (const name of names) {
      expect(
        await buildAndRun(route, script, {
          prefix: `.regression-build-${name}-demo-`,
        }),
        `an app in a directory named after ${name}`,
      ).toBe('<p>index</p>')
    }
  })
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
  )

  // Bug: an imported component read by a split and an unsplit option: main
  // left the unsplit option naming it and removed the import. Source: #8914.
  // Impact: the built entry throws when it loads ("Page is not defined").
  // The page's code ships once, with the route module: the split option's
  // chunk renders that copy.
  describe.each([
    {
      form: 'a named import, component and pendingComponent',
      importLine: `import { Page } from '../page'`,
      options: ['component', 'pendingComponent'],
    },
    {
      form: 'a default import, component and pendingComponent',
      importLine: `import Page from '../page'`,
      options: ['component', 'pendingComponent'],
    },
    {
      form: 'a named import, pendingComponent and errorComponent',
      importLine: `import { Page } from '../page'`,
      options: ['pendingComponent', 'errorComponent'],
    },
  ])('$form', ({ importLine, options }) => {
    test.each(['vite', 'rsbuild'] as const)(
      'an imported component read by a split and an unsplit option renders from both (%s build)',
      async (bundler) => {
        const files = routeApp(
          `${head}${importLine}
export const Route = createFileRoute('/')({
${options.map((option) => `  ${option}: Page,\n`).join('')}})
`,
          {
            files: {
              'page.tsx': `export function Page() {
  return <p>MARK_PAGE_8914</p>
}
export default Page
`,
            },
          },
        )
        const app =
          bundler === 'vite'
            ? await build({ bundler, env: 'ssr', minify: false, files })
            : await buildWithRsbuild({ files })
        const { result } = await app.run(
          `return [${options.map((option) => `await entry.render(entry.Route.options.${option})`).join(', ')}]`,
        )
        expect({
          rendered: result,
          page: app.locate('MARK_PAGE_8914'),
          split: app.lazy.length > 0,
        }).toEqual({
          rendered: ['<p>MARK_PAGE_8914</p>', '<p>MARK_PAGE_8914</p>'],
          page: { eager: [expect.any(String)], lazy: [] },
          split: true,
        })
      },
    )
  })
})

// `this` in split callbacks (a split loader called as a method of its
// chunk's namespace by router-core's `lazyFn`): a runtime cause (#8688),
// not pinned in the compiler tests.
