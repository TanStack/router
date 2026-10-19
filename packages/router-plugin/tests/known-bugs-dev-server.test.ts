/**
 * Known router plugin bugs that only show on a running dev server, after
 * edits. Each pin asserts correct behaviour for a bug on main and is marked
 * .fails; remove .fails when the bug is fixed. Each pin has a control test
 * that runs the same harness on a case that works.
 */
import * as React from 'react'
import * as jsxDevRuntime from 'react/jsx-dev-runtime'
import * as jsxRuntime from 'react/jsx-runtime'
import { describe, expect, test } from 'vitest'
import { evaluateServed } from '@tanstack/compiler-test-utils/dev-server'
import {
  expectExportedRouteOptions,
  expectSharedOverloads,
  exportedComponentsLostWhenSplit,
  renderRouteComponent,
  rootRoute,
  routerDevServer,
} from './dev-server'
import { head, importRequests } from './regression-helpers'
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
   * its chunks requests them: the dev server compiles each one now.
   */
  async function loadRouteModules(server: DevServer) {
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
   * Loads the served route module as a page does (`evaluateServed`: the
   * client environment's modules as the dev server last compiled them,
   * linked as ES modules, split chunks imported when the router loads
   * them), and renders its `component` and, when the route has one, its
   * `errorComponent` with React, once loaded. The router package is the
   * one the SSR environment loads, and React this process's (which the SSR
   * environment loads too): the same packages a page gets.
   */
  async function renderServedRoute(server: DevServer) {
    const packages: Array<[RegExp, Record<string, unknown>]> = [
      [
        /\/react-router\/dist\/esm\/index(?:\.dev)?\.js$/,
        await server.import('@tanstack/react-router'),
      ],
      [/\/react\/jsx-dev-runtime\.js$/, jsxDevRuntime],
      [/\/react\/jsx-runtime\.js$/, jsxRuntime],
      [/\/react\/index\.js$/, React],
    ]
    const { Route } = await evaluateServed(server, route, {
      skip: /^\/@fs\//,
      fallbackStub: (specifier) => {
        const found = packages.find(([url]) => url.test(specifier))
        if (!found) {
          throw new Error(`the route imports ${specifier}`)
        }
        return found[1]
      },
    })
    const rendered = [await renderRouteComponent(Route.options.component)]
    if (Route.options.errorComponent) {
      rendered.push(await renderRouteComponent(Route.options.errorComponent))
    }
    return rendered
  }

  /**
   * Serves `before` as `routes/page.tsx`, loads the route's modules as a
   * page does, edits the route to `after`, requests the route's modules
   * again in the order `reorder` gives (a page re-requests the modules the
   * edit invalidated; unbundled Vite dev fetches them in parallel, in no
   * fixed order, and keeps each result until the next edit), then loads the
   * route as a page does and renders its components.
   */
  async function editOutOfOrder(
    reorder: (urls: Array<string>) => Array<string>,
    before: string,
    after: string,
  ) {
    const server = await routerDevServer({
      files: { 'routes/page.tsx': before },
    })
    const urls = await loadRouteModules(server)
    expect(urls.length).toBeGreaterThan(1)
    await server.edit({ 'routes/page.tsx': after })
    for (const url of reorder(urls)) {
      await server.transform(url)
    }
    return renderServedRoute(server)
  }

  /** The route module after the modules of the route file it imports. */
  const routeModuleLast = (urls: Array<string>) => [...urls.slice(1), route]

  /**
   * A route whose split `component` and `errorComponent` render the cards
   * `CardA` and, with `cardB`, `CardB`, which counts its renders in module
   * state: the two chunks share it.
   */
  const cards = (cardB: boolean) => `${head}function CardA() { return <b>A</b> }
${cardB ? 'let renders = 0\nfunction CardB() { renders++; return <i>{"B" + renders}</i> }\n' : ''}export const Route = createFileRoute('/page')({
  component: () => <p><CardA />${cardB ? '<CardB />' : ''}</p>,
  errorComponent: () => <p><CardA />${cardB ? '<CardB />' : ''}</p>,
})
`

  // Controls for the pins below (same harness): requested in import order.
  test.each([
    {
      name: 'removing a component two split options render',
      before: cards(true),
      after: cards(false),
      expected: ['<p><b>A</b></p>', '<p><b>A</b></p>'],
    },
    {
      name: 'adding a component two split options render',
      before: cards(false),
      after: cards(true),
      expected: ['<p><b>A</b><i>B1</i></p>', '<p><b>A</b><i>B2</i></p>'],
    },
  ])(
    'a page loading the route module first renders the edited route after $name',
    async ({ before, after, expected }) => {
      expect(await editOutOfOrder((urls) => urls, before, after)).toEqual(
        expected,
      )
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
  // of shared (two module states: each chunk's `CardB` counts its own
  // renders).
  // Source: gap DV8 (gaps/dev-hmr.md); #8504 code-splitter-plugin-pipeline
  // .test.ts ("a dev server compiling an edited route out of order").
  // Any fix passes: the page renders the edited route, with one module
  // state for what the split options share.
  test.fails.each([
    {
      name: 'removing a component two split options render',
      before: cards(true),
      after: cards(false),
      expected: ['<p><b>A</b></p>', '<p><b>A</b></p>'],
    },
    {
      name: 'adding a component two split options render',
      before: cards(false),
      after: cards(true),
      expected: ['<p><b>A</b><i>B1</i></p>', '<p><b>A</b><i>B2</i></p>'],
    },
  ])(
    'a page loading the modules of the route file before the route module renders the edited route after $name',
    async ({ before, after, expected }) => {
      expect(await editOutOfOrder(routeModuleLast, before, after)).toEqual(
        expected,
      )
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
    'a page loading the modules of the route file before the route module renders the edited route after removing a helper of an exported component a split component renders',
    async () => {
      expect(
        await editOutOfOrder(
          routeModuleLast,
          `${head}const prefix = 'a'
const suffix = 'b'
export function Card() { return <b>{prefix}{suffix}</b> }
export const Route = createFileRoute('/page')({ component: () => <Card /> })
`,
          `${head}const prefix = 'a'
export function Card() { return <b>{prefix}</b> }
export const Route = createFileRoute('/page')({ component: () => <Card /> })
`,
        ),
      ).toEqual(['<b>a</b>'])
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
   * The route the app's generated route tree (`routeTree.gen.ts`) matches
   * at `pathname`: the real router over the tree, in the dev server's SSR
   * environment, after `router.load()`.
   */
  async function matchedRoute(server: DevServer, pathname: string) {
    const { routeTree } = await server.import('/routeTree.gen.ts')
    const { createMemoryHistory, createRouter } = await server.import(
      '@tanstack/react-router',
    )
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [pathname] }),
    })
    await router.load()
    return router.state.matches.at(-1)?.fullPath
  }

  /**
   * Starts with `tsr.config.json` reading the routes from `routes/`, then
   * points it to `pages/`, with `edits`. Returns the route the route tree
   * matches at `/about` afterwards (none before: `/about` is in `pages/`).
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
    expect(await matchedRoute(server, '/about')).not.toBe('/about')
    await server.edit({ 'tsr.config.json': config('./pages') })
    await server.edit(edits)
    return matchedRoute(server, '/about')
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
      ).toBe('/about')
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
      expect(await moveRoutesDirectory()).toBe('/about')
    },
    timeout,
  )
})
