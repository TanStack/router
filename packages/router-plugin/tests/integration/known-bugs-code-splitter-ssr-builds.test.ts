/**
 * Known code-splitter bugs. Each test asserts correct behaviour for a bug on
 * main and is marked .fails; remove .fails when the bug is fixed.
 */
import { BuildError } from '@tanstack/compiler-test-utils/build-harness'
import { describe, expect, test } from 'vitest'
import { build, routeApp } from '../build-harness'
import { buildAndRun, head } from '../regression-helpers'
import type { CodeSplitGroupings } from '../../src/core/constants'

describe('module state shared with split chunks', () => {
  // Bug: a `let` that code in another module than its declaration reassigns
  // is imported there, read-only: a `let` the loader reassigns is shared, so
  // the route module assigns to an import of the shared module; an exported
  // `let` the split component reassigns stays in the route module, which the
  // chunk imports it from ("Cannot assign to import").
  // Impact: the route cannot be built as soon as code splitting is on.
  // Needs a real build: imports are live bindings, and the in-process harness
  // snapshots them, so even a correct fix would read a stale value there.
  test.fails.each([
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
      expect(await buildAndRun(route, script)).toEqual(expected)
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
  test.fails.each([
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
  test.fails(
    'a split loader in object form passed by reference loads route data',
    async () => {
      expect(
        await loadWithSplitLoader(
          'loader',
          `const loader = { handler: () => 'loaded' }\n`,
        ),
      ).toEqual([null, 'loaded'])
    },
    30_000,
  )
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
  test.fails.each([
    {
      // An instance another module creates is an instance of the class the
      // split component reads
      name: 'class (instanceof)',
      route: `export class Store {}
function Page() {
  return <p>{String((globalThis as any).__store instanceof Store)}</p>
}`,
      imports: 'Store',
      setup: ';(globalThis as any).__store = new Store()',
      expected: ['<p>true</p>'],
    },
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
    {
      name: 'function component',
      route: `export function Card() {
  return <b>card</b>
}
function Page() {
  return <p>{String((globalThis as any).__Card === Card)}</p>
}`,
      imports: 'Card',
      setup: ';(globalThis as any).__Card = Card',
      expected: ['<p>true</p>'],
    },
    {
      name: 'component and its private state',
      route: `const registry = new Set<string>()
function size() {
  return registry.size
}
export function Card({ id }: { id: string }) {
  registry.add(id)
  return <b>{size()}</b>
}
function Page() {
  return (
    <p>
      {String((globalThis as any).__Card === Card)}
      <Card id="page" />
    </p>
  )
}`,
      imports: 'Card',
      setup: ";(globalThis as any).__Card = Card\nCard({ id: 'entry' })",
      expected: ['<p>true<b>2</b></p>'],
    },
  ])(
    'the split component and other modules share an exported $name',
    async ({ route, imports, setup, expected }) => {
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
    },
    30_000,
  )
})

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
  test.fails(
    'an app in a directory with # in its name builds and preloads a split component',
    async () => {
      expect(
        await buildAndRun(route, script, { prefix: '.regression-build-#' }),
      ).toBe('<p>index</p>')
    },
    30_000,
  )

  // Bug: the code splitter compiles every module whose id contains
  // `tsr-split` (path text, not its query) as a split chunk, and throws "The
  // split value for the virtual route ... was not found" for the modules of
  // an app in a directory named like `tsr-split-demo`.
  // Source: round-3 mutation testing (splitter-hosts P3).
  // Impact: an app in such a directory cannot be built.
  test.fails(
    'an app in a directory whose name contains tsr-split builds and preloads a split component',
    async () => {
      expect(
        await buildAndRun(route, script, {
          prefix: '.regression-build-tsr-split-',
        }),
      ).toBe('<p>index</p>')
    },
    30_000,
  )

  // Bug: the route module's chunk importers are built by pasting the
  // absolute file path into a single-quoted string
  // (`import('${splitUrl}')`), so a `'` in the path ends the string early.
  // Source: #7754.
  // Impact: an app in a directory whose name contains `'` (e.g. a user
  // folder) cannot be built or served once code splitting is on: every route
  // fails with a syntax error.
  test.fails(
    "an app in a directory with ' in its name builds and preloads a split component",
    async () => {
      expect(
        await buildAndRun(route, script, { prefix: ".regression-build-it's-" }),
      ).toBe('<p>index</p>')
    },
    30_000,
  )
})

describe('code that reads a split binding', () => {
  // Bug: same root cause as above, in a real build.
  // Impact: the server render of the route throws "PostsPage is not defined"
  // when it runs head().
  test.fails.each(['vite', 'rspack'] as const)(
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

describe('`this` in split callbacks', () => {
  /** Whether a message names the route file and `this`. */
  const reportsThis = (message: string) =>
    message.includes('routes/index.tsx') && /\bthis\b/.test(message)

  /**
   * Builds an app whose `/` route has `loader`, with the given groupings,
   * loads `/` with a real router and returns the route's loader data; or
   * `reported` when the build fails or warns about `this`.
   */
  async function loadWithLoader(loader: string, groupings: CodeSplitGroupings) {
    let app
    try {
      app = await build({
        bundler: 'vite',
        env: 'ssr',
        minify: false,
        files: routeApp(
          `${head}export const Route = createFileRoute('/')({
  loader: ${loader},
  component: () => <p>index</p>,
})`,
          {
            files: {
              'entry.ts': `import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export async function load() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return router.state.matches.at(-1)?.loaderData
}`,
            },
          },
        ),
        pluginOptions: { codeSplittingOptions: { defaultBehavior: groupings } },
      })
    } catch (error) {
      if (error instanceof BuildError && reportsThis(error.message)) {
        return 'reported'
      }
      throw error
    }
    if ([...app.warnings, ...app.consoleMessages].some(reportsThis)) {
      return 'reported'
    }
    return (await app.run('return await entry.load()')).result
  }

  const readsThis = `function () {
  return this === undefined ? 'no this' : 'this: ' + Object.keys(this).join()
}`

  // Control for the pin below: the router calls an unsplit loader without a
  // `this`.
  test('an unsplit loader is called without a `this`', async () => {
    expect(await loadWithLoader(readsThis, [['component']])).toBe('no this')
  }, 60_000)

  // Bug: a split loader is called as a method of its chunk's module
  // namespace (`lazyFn` calls `imported[key](...args)`), so its `this` is
  // the chunk's exports, where the router calls an unsplit loader without a
  // `this`. Source: #8688.
  // Impact: a loader that reads `this` behaves differently once split,
  // without any diagnostic.
  test.fails(
    'a split loader sees the same `this` as an unsplit one, or the build reports it',
    async () => {
      expect(['no this', 'reported']).toContain(
        await loadWithLoader(readsThis, [['loader'], ['component']]),
      )
    },
    60_000,
  )
})
