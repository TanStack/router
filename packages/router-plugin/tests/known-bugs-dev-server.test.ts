/**
 * Known router plugin bugs that only show on a running dev server, after
 * edits. Each pin asserts correct behaviour for a bug on main and is marked
 * .fails; remove .fails when the bug is fixed. Each pin has a control test
 * that runs the same harness on a case that works.
 */
import { describe, expect, test } from 'vitest'
import {
  expectExportedRouteOptions,
  expectSharedOverloads,
  exportedComponentsLostWhenSplit,
  rootRoute,
  routerDevServer,
} from './dev-server'
import {
  exportedNames,
  head,
  importRequests,
  importedNames,
} from './regression-helpers'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'

const timeout = 30_000

describe('a dev server compiling an edited route out of order', () => {
  const route = '/routes/page.tsx'

  /** Without the HMR timestamps an edit adds to import URLs. */
  const withoutTimestamps = (code: string) =>
    code.replace(/([?&])t=\d+(&?)/g, (_, before, after) =>
      after ? before : '',
    )

  /**
   * The route module and the modules of the route file it reaches through
   * static and dynamic imports (its split chunks and the modules they share,
   * whatever their URLs), breadth first, as a page loading the route and
   * its chunks requests them.
   */
  async function routeModuleUrls(server: DevServer) {
    const urls = [route]
    for (let index = 0; index < urls.length; index++) {
      const code = withoutTimestamps(await server.transform(urls[index]!))
      for (const { specifier } of importRequests(code)) {
        if (
          specifier.replace(/\?.*$/, '') === route &&
          !urls.includes(specifier)
        ) {
          urls.push(specifier)
        }
      }
    }
    return urls
  }

  /**
   * Requests `urls` in order (modules of the route file): errors, exports
   * and the names imported from each of the other modules of the route file
   * (`modules`), by URL.
   */
  async function inspect(
    server: DevServer,
    urls: Array<string>,
    modules: Array<string>,
  ) {
    const inspected: Record<
      string,
      {
        errors: Array<string>
        exports: Array<string>
        fromRouteModules: Record<string, Array<string>>
      }
    > = {}
    for (const url of urls) {
      const code = withoutTimestamps(await server.transform(url))
      inspected[url] = {
        errors: await getModuleErrors(code),
        exports: exportedNames(code),
        fromRouteModules: Object.fromEntries(
          modules
            .filter((imported) => imported !== url)
            .map((imported) => [imported, importedNames(code, imported)]),
        ),
      }
    }
    return inspected
  }

  const twoCards = `${head}function CardA() { return <b>A</b> }
function CardB() { return <i>B</i> }
export const Route = createFileRoute('/page')({
  component: () => <p><CardA /><CardB /></p>,
  errorComponent: () => <p><CardA /><CardB /></p>,
})
`
  const oneCard = `${head}function CardA() { return <b>A</b> }
export const Route = createFileRoute('/page')({
  component: () => <p><CardA /></p>,
  errorComponent: () => <p><CardA /></p>,
})
`

  /**
   * Loads the route modules in order (the URLs the route module imports, as
   * the first load finds them), edits the route from `before` to `after`
   * (default `twoCards` to `oneCard`), requests them again in the order
   * `reorder` gives, and compares them with what a dev server started after
   * the edit compiles.
   */
  async function editAndCompare(
    reorder: (urls: Array<string>) => Array<string>,
    { before = twoCards, after = oneCard } = {},
  ) {
    const server = await routerDevServer({
      files: { 'routes/page.tsx': before },
    })
    // The page loads: the route module first, then the modules it imports
    const urls = await routeModuleUrls(server)
    expect(urls.length).toBeGreaterThan(1)
    await inspect(server, urls, urls)
    await server.edit({ 'routes/page.tsx': after })
    const edited = await inspect(server, reorder(urls), urls)

    const fresh = await routerDevServer({
      files: { 'routes/page.tsx': after },
    })
    const expected = await inspect(fresh, urls, urls)
    for (const module of Object.values(expected)) {
      expect(module.errors).toEqual([])
    }
    expect(edited).toEqual(expected)
  }

  // Control for the pin below (same harness): requested in import order.
  test(
    'compiles the shared module and chunks requested after the route module from the edited source',
    async () => {
      await editAndCompare((urls) => urls)
    },
    timeout,
  )

  // Bug: the route module's transform computes the bindings that go to the
  // shared module (`?tsr-shared=1`) and stores them by file; the shared and
  // split transforms read that stored set instead of deriving it from the
  // code they compile (router-code-splitter-plugin.ts `sharedBindingsMap`).
  // After an edit, the browser requests the invalidated modules again in no
  // fixed order (unbundled Vite dev fetches them in parallel), and Vite keeps
  // each result until the next edit.
  // Impact: a shared or split module requested before the route module
  // compiles the new source with the previous set: a removed binding is still
  // exported ("Export 'CardB' is not defined") and the page stays broken until
  // the next edit or a restart; an added one is copied into each chunk instead
  // of shared (two module states).
  // Source: gap DV8 (gaps/dev-hmr.md); #8504 code-splitter-plugin-pipeline
  // .test.ts ("a dev server compiling an edited route out of order").
  test.fails.each([
    {
      name: 'removing a component two split options render',
      before: twoCards,
      after: oneCard,
    },
    {
      name: 'adding a component two split options render',
      before: oneCard,
      after: twoCards,
    },
  ])(
    'compiles the shared module and chunks requested before the route module from the edited source after $name',
    async ({ before, after }) => {
      await editAndCompare((urls) => [...urls.slice(1), route], {
        before,
        after,
      })
    },
    timeout,
  )

  // The same race for an exported component a split component renders,
  // whose private helper the edit removes: main keeps the exported component
  // and its helpers in the route module, so nothing is stored for them.
  // An implementation that moves them to a module the chunk shares must not
  // reach the race. Source: the #8504 probe (hybrid shared modules; #8504
  // code-splitter-plugin-pipeline.test.ts, first row).
  test(
    'compiles the modules requested before the route module from the edited source after removing a helper of an exported component a split component renders',
    async () => {
      await editAndCompare((urls) => [...urls.slice(1), route], {
        before: `${head}const prefix = 'a'
const suffix = 'b'
export function Card() { return <b>{prefix}{suffix}</b> }
export const Route = createFileRoute('/page')({ component: () => <Card /> })
`,
        after: `${head}const prefix = 'a'
export function Card() { return <b>{prefix}</b> }
export const Route = createFileRoute('/page')({ component: () => <Card /> })
`,
      })
    },
    timeout,
  )
})

describe('route module exports with automatic code splitting', () => {
  // Controls: react-refresh-route-components.test.ts "route module exports
  // with React HMR and autoCodeSplitting" (same harness), where these cases
  // pass without automatic code splitting.

  // Bug: the code splitter moves a component the route module exports into
  // its chunk and drops its export: a class cannot be split ("Unexpected
  // splitNode type: ClassDeclaration") and loses its `export class`, and an
  // aliased export list (`export { component as View }`) is left without its
  // declaration (known-bugs-code-splitter.test.ts "class components" and "a
  // split component that an export alias reads renders from both").
  // Impact: in development, modules importing the export get `undefined`
  // (Vite SSR) or fail to load (browsers: "Export 'component' is not
  // defined"), and the route's component chunk fails to compile.
  // Source: #8504 react-refresh-route-components ("route module exports with
  // React HMR and autoCodeSplitting=true"), where they pass.
  test.fails.each(exportedComponentsLostWhenSplit)(
    'keep a $name component exported as the route option value',
    async ({ declaration, options, exported }) => {
      await expectExportedRouteOptions(
        `${head}${declaration}
export const Route = createFileRoute('/page')({ ${options} })`,
        exported,
        true,
      )
    },
    timeout,
  )

  // Bug: the overload signatures of a function that the route module and a
  // split loader share stay next to its import, and the alias loses the
  // binding (known-bugs-code-splitter.test.ts "an overloaded function the
  // route module and a split loader share keeps working").
  // Impact: in development, `helperAlias` is undefined (Vite SSR) or the
  // route module fails to load (browsers).
  // Source: #8504 react-refresh-route-components ("keep exported overloads
  // and their aliases that unsplit and split options call"), where it passes.
  test.fails(
    'keep exported overloads and their aliases that unsplit and split options call',
    async () => {
      await expectSharedOverloads(true)
    },
    timeout,
  )
})

describe('router config file', () => {
  /** `tsr.config.json` with the harness's plugin options. */
  const config = (routesDirectory: string) =>
    JSON.stringify({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory,
      generatedRouteTree: './routeTree.gen.ts',
    })

  const route = (
    path: string,
  ) => `${head}export const Route = createFileRoute('${path}')({})
`

  /**
   * Starts with `tsr.config.json` reading the routes from `routes/`, then
   * points it to `pages/`, with `edits`. Returns the route tree afterwards.
   */
  async function moveRoutesDirectory(edits: Record<string, string> = {}) {
    const server = await routerDevServer({
      pluginOptions: null,
      files: {
        'tsr.config.json': config('./routes'),
        'routes/index.tsx': route('/'),
        'pages/__root.tsx': rootRoute,
        'pages/about.tsx': route('/about'),
      },
    })
    expect(await server.read('routeTree.gen.ts')).not.toContain(
      "fullPath: '/about'",
    )
    await server.edit({ 'tsr.config.json': config('./pages') })
    await server.edit(edits)
    return server.read('routeTree.gen.ts')
  }

  // Control for the pin below (same harness): the next route file edit
  // generates the route tree with the new configuration.
  test(
    'a route file edit after a tsr.config.json edit generates the route tree with the new configuration',
    async () => {
      expect(
        await moveRoutesDirectory({
          'pages/about.tsx': route('/about') + '\n',
        }),
      ).toContain("fullPath: '/about'")
    },
    timeout,
  )

  // Bug: on a `tsr.config.json` edit, the generator plugin re-creates the
  // generator with the new configuration and returns without running it
  // (router-generator-plugin.ts `generate`).
  // Impact: a configuration change (routes directory, generated route tree,
  // route file options) is applied to the route tree only on the next route
  // file event, or never if none comes before a restart.
  // Source: gap DV3 (gaps/dev-hmr.md).
  test.fails(
    'a tsr.config.json edit generates the route tree with the new configuration',
    async () => {
      expect(await moveRoutesDirectory()).toContain("fullPath: '/about'")
    },
    timeout,
  )
})
