/**
 * Known router plugin bugs that only show on a running dev server, after
 * edits. Each pin asserts correct behaviour for a bug on main and is marked
 * .fails; remove .fails when the bug is fixed. Each pin has a control test
 * that runs the same harness on a case that works.
 */
import { describe, expect, test } from 'vitest'
import { rootRoute, routerDevServer } from './dev-server'
import { exportedNames, head, importedNames } from './regression-helpers'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'

const timeout = 30_000

describe('a dev server compiling an edited route out of order', () => {
  const route = '/routes/page.tsx'
  const shared = `${route}?tsr-shared=1`
  const ids = [
    route,
    shared,
    `${route}?tsr-split=component`,
    `${route}?tsr-split=errorComponent`,
  ]

  /** Without the HMR timestamps an edit adds to import URLs. */
  const withoutTimestamps = (code: string) =>
    code.replace(/([?&])t=\d+(&?)/g, (_, before, after) =>
      after ? before : '',
    )

  /**
   * Requests `urls` in order (the route module, its shared module and its
   * chunks): errors, exports and imports from the shared module by URL.
   */
  async function inspect(server: DevServer, urls: Array<string>) {
    const modules: Record<
      string,
      {
        errors: Array<string>
        exports: Array<string>
        fromShared: Array<string>
      }
    > = {}
    for (const url of urls) {
      const code = withoutTimestamps(await server.transform(url))
      modules[url] = {
        errors: await getModuleErrors(code),
        exports: exportedNames(code),
        fromShared: importedNames(code, shared),
      }
    }
    return modules
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
   * Loads the route modules in order, edits the route from `twoCards` to
   * `oneCard`, requests them again in `order`, and compares them with what a
   * dev server started after the edit compiles.
   */
  async function editAndCompare(order: Array<string>) {
    const server = await routerDevServer({
      files: { 'routes/page.tsx': twoCards },
    })
    // The page loads: the route module first, then the modules it imports
    await inspect(server, ids)
    await server.edit({ 'routes/page.tsx': oneCard })
    const edited = await inspect(server, order)

    const fresh = await routerDevServer({
      files: { 'routes/page.tsx': oneCard },
    })
    const expected = await inspect(fresh, ids)
    for (const module of Object.values(expected)) {
      expect(module.errors).toEqual([])
    }
    expect(edited).toEqual(expected)
  }

  // Control for the pin below (same harness): requested in import order.
  test(
    'compiles the shared module and chunks requested after the route module from the edited source',
    async () => {
      await editAndCompare(ids)
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
  // Source: gap DV8 (gaps/dev-hmr.md); #8504 fixes it and tests it in
  // code-splitter-plugin-pipeline.test.ts ("a dev server compiling an edited
  // route out of order").
  test.fails(
    'compiles the shared module and chunks requested before the route module from the edited source',
    async () => {
      await editAndCompare([...ids.slice(1), route])
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
