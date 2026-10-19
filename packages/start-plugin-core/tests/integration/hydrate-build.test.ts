/**
 * `<Hydrate>` in real builds (Start's Vite and Rsbuild plugins) and on Vite
 * and Rsbuild dev servers, with the real `@tanstack/react-start`, React and
 * router. Where the children's code ends up is the bundler's decision (with
 * the side-effect hints of the app), so it is asserted on build output.
 * That the children hydrate is asserted like a browser sees it: the server
 * build renders a page to HTML with `react-dom/server`, a page of headless
 * Chromium loads the client build, hydrates that HTML with `hydrateRoot`
 * (recoverable errors and `console.error` recorded) and clicks each child,
 * whose button then shows that it was clicked: the child hydrated, with its
 * own code, in the boundary the server rendered it in.
 */
import { afterAll, describe, expect, onTestFinished, test } from 'vitest'
import react from '@vitejs/plugin-react'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { originalFrameOf } from '@tanstack/compiler-test-utils/build-harness'
import {
  captureThrow,
  diagnosticPosition,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { buildStart, startBundlers } from '../build-harness'
import { startDevServer } from '../dev-server'
import { startRsbuildDevServer } from '../rsbuild-dev-server'
import { moduleRequests } from '../imports'
import type { StartBuild, StartBundler } from '../build-harness'

const timeout = 60_000

/** A clickable child: `<button>` showing `label`, then `label clicked`. */
const toggleSource = `import { useState } from 'react'
export function Toggle(props: { label: string }) {
  const [clicked, setClicked] = useState(false)
  return <button onClick={() => setClicked(true)}>{props.label}{clicked ? ' clicked' : ''}</button>
}
`

/** The entries of an app whose pages `src/pages.ts` exports (`pages`). */
const pageEntries = {
  'entry-server.ts': `export * as pages from './src/pages'
export { createElement } from 'react'
export { renderToReadableStream } from 'react-dom/server'
`,
  'entry-client.ts': `export * as pages from './src/pages'
export { createElement } from 'react'
export { createRoot, hydrateRoot } from 'react-dom/client'
`,
}
const entry = { client: 'entry-client.ts', ssr: 'entry-server.ts' }

/**
 * Server-renders every export of `pages` (a component) to HTML, like Start's
 * SSR: `renderToReadableStream`, all Suspense boundaries ready. A page whose
 * render fails gives its error.
 */
async function renderPages(build: StartBuild) {
  const { result } = await build.ssr.run(`const html = {}
for (const [name, Page] of Object.entries(entry.pages)) {
  try {
    const stream = await entry.renderToReadableStream(entry.createElement(Page))
    await stream.allReady
    html[name] = await new Response(stream).text()
  } catch (error) {
    html[name] = { error: String(error) }
  }
}
return html`)
  return result as Record<string, string | { error: string }>
}

/** What hydrating a page showed (`hydratePage`). */
interface Hydrated {
  /** The value of the `read` expression after the clicks, if any. */
  read?: unknown
  /** The page's text after the clicks. */
  text: string
  /** Errors given to `onRecoverableError` (e.g. a hydration mismatch). */
  recoverableErrors: Array<string>
  /** What the page logged with `console.error`. */
  consoleErrors: Array<string>
}

/**
 * Hydrates the server HTML of the page `name` (`html`) in a page of the
 * client build, then clicks each button whose text contains a label of
 * `click` (again every 20 ms, while it hydrates) until it shows `<label>
 * clicked`.
 * `read` is an expression the page evaluates last.
 */
async function hydratePage(
  build: StartBuild,
  html: string,
  name: string,
  click: Array<string>,
  read?: string,
): Promise<Hydrated> {
  const { result } = await build.client.run(`const recoverableErrors = []
const consoleErrors = []
const logError = console.error
console.error = (...args) => {
  consoleErrors.push(args.map(String).join(' '))
  logError(...args)
}
const root = document.getElementById('root')
root.innerHTML = ${JSON.stringify(html)}
entry.hydrateRoot(root, entry.createElement(entry.pages[${JSON.stringify(name)}]), {
  onRecoverableError: (error) => recoverableErrors.push(String(error)),
})
const button = (label) =>
  [...root.querySelectorAll('button')].find((candidate) => candidate.textContent.includes(label))
const unclicked = () =>
  ${JSON.stringify(click)}.filter((label) => !button(label)?.textContent.includes(label + ' clicked'))
const deadline = Date.now() + 10_000
while (unclicked().length > 0) {
  if (Date.now() > deadline) {
    throw new Error('children did not respond to clicks: ' + unclicked().join(', ') + ': ' + root.innerHTML)
  }
  for (const label of unclicked()) {
    button(label)?.click()
  }
  await new Promise((resolve) => setTimeout(resolve, 20))
}
return {
  text: root.textContent,
  recoverableErrors,
  consoleErrors,${read ? `\n  read: ${read},` : ''}
}`)
  return result as Hydrated
}

describe.each(startBundlers)('%s build', (bundler: StartBundler) => {
  // One production build (minified, with source maps) of every page below;
  // each test reads its own page (its own markers and modules).
  let shared: Promise<StartBuild> | undefined
  let sharedHtml: ReturnType<typeof renderPages> | undefined
  let disposeShared: (() => Promise<void>) | undefined
  const sharedApp = () =>
    (shared ??= buildStart({
      bundler,
      entry,
      sourcemap: true,
      registerCleanup: (cleanup) => {
        disposeShared = cleanup
      },
      files: { ...pageEntries, ...sharedFiles },
    }))
  afterAll(() => disposeShared?.())

  /** The page `name` of the shared build, hydrated (`hydratePage`). */
  async function hydrateShared(
    name: string,
    click: Array<string>,
    read?: string,
  ) {
    const build = await sharedApp()
    const html = (await (sharedHtml ??= renderPages(build)))[name]
    expect(typeof html, `server render of ${name}`).toBe('string')
    return hydratePage(build, html as string, name, click, read)
  }

  // When the parent's own module-level code (`formatValue('Revenue')`)
  // runs is left open: in the eager code or in the lazy chunk, not both.
  // So is where the chart's code goes when the page also imports the
  // package's barrel eagerly and the package has no side-effect hints: the
  // barrel evaluates the chart module, and whether its code may wait for the
  // chunk is the bundler's call (both keep it eager with the real React).
  // Source: hydrate-split-modules.test.ts "bindings only the split children
  // use leave the parent", "server: bindings only the stripped fallback uses
  // are removed"; hydrate-captures.test.ts "a destructured loop variable…,
  // module helpers move" (placement); gaps "biggest gap 1".
  test.each([
    {
      name: 'a project module',
      page: 'chartProject',
      key: 'project',
      chart: ['lazy'],
    },
    {
      // The barrel is eager (the page logs `Other`).
      name: 'a package without side-effect hints',
      page: 'chartPlainWidgets',
      key: 'plain-widgets',
      chart: ['lazy', 'eager'],
    },
    {
      name: 'a package marked "sideEffects": false',
      page: 'chartPureWidgets',
      key: 'pure-widgets',
      chart: ['lazy'],
    },
  ])(
    'with the chart from $name, the server drops the fallback and the chart hydrates',
    async ({ page, key, chart }) => {
      const build = await sharedApp()
      expect(chart).toContain(build.client.where(`${key}-chart-marker`))
      expect({
        fallback: build.client.where(`${key}-fallback-marker`),
        serverFallback: build.ssr.where(`${key}-fallback-marker`),
      }).toEqual({
        fallback: 'eager',
        serverFallback: 'nowhere',
      })
      expect(['lazy', 'eager']).toContain(
        build.client.where(`${key}-format-marker`),
      )
      expect(await hydrateShared(page, [`${key}-chart-marker`])).toEqual({
        text: `Revenue ${key}-format-marker ${key}-chart-marker clicked`,
        recoverableErrors: [],
        consoleErrors: [],
      })
    },
    timeout,
  )

  // Each boundary loads only its own children's code, and each child
  // hydrates in its own boundary: an `interaction()` boundary hydrates when
  // its server-rendered marker is clicked, which finds the boundary by the
  // identity the server rendered.
  test(
    'two boundaries each load their own children lazily and hydrate on their own interaction',
    async () => {
      const build = await sharedApp()
      const chart = build.client.locate('two-chart-marker')
      const table = build.client.locate('two-table-marker')
      expect({ chart: chart.eager, table: table.eager }).toEqual({
        chart: [],
        table: [],
      })
      expect(chart.lazy).toHaveLength(1)
      expect(table.lazy).toHaveLength(1)
      expect(chart.lazy[0]).not.toBe(table.lazy[0])
      expect(
        await hydrateShared('twoBoundaries', [
          'two-table-marker',
          'two-chart-marker',
        ]),
      ).toEqual({
        text: 'two-chart-marker clicked two-table-marker clicked',
        recoverableErrors: [],
        consoleErrors: [],
      })
    },
    timeout,
  )

  // Module-level code only the children use is in the client once: a
  // helper declaration in the lazy chunk; a destructuring of an import (an
  // initializer, whose timing is left open) in the lazy chunk or the eager
  // code. Either way the children hydrate with its values.
  // Source: hydrate-split-modules.test.ts "the children read a
  // module-level destructuring of an import" (placement), "helpers shared
  // by two boundaries"; Qwik optimizer example_invalid_references
  test(
    'module-level code only the children use is not duplicated',
    async () => {
      const build = await sharedApp()
      expect(build.client.where('helper-marker')).toBe('lazy')
      expect(['lazy', 'eager']).toContain(build.client.where('lib-marker'))
      expect(
        await hydrateShared('moduleLevel', ['lib-markerB helper-marker']),
      ).toEqual({
        text: 'lib-markerB helper-marker clicked',
        recoverableErrors: [],
        consoleErrors: [],
      })
    },
    timeout,
  )

  // A route whose split options (`component` and `pendingComponent`)
  // contain boundaries: each boundary hydrates in the boundary the server
  // rendered (`interaction()`, see above) and loads its own children. The
  // route's groupings are its own (`codeSplitGroupings`); the default ones
  // split `component` only, so `pendingComponent` stays in the route module
  // and only its boundary's children are lazy. One page renders the three
  // routes (their boundaries render at the same time, so their identities
  // must not collide either).
  // Source: gap H10 (round2/oracle-gaps)
  let routes: Promise<Hydrated> | undefined
  test.each([
    { name: 'in their own groupings', route: 'separateGroups' },
    { name: 'in one grouping', route: 'oneGroup' },
    { name: 'split and unsplit (default groupings)', route: 'defaultGroups' },
  ])(
    'boundaries in route options $name hydrate in the boundaries the server renders',
    async ({ route }) => {
      const build = await sharedApp()
      expect(build.client.where(`${route}-page-marker`)).toBe('lazy')
      expect(build.client.where(`${route}-pending-marker`)).toBe('lazy')
      const hydrated = await (routes ??= hydrateShared(
        'routes',
        sharedRoutes.flatMap((name) => [
          `${name}-page-marker`,
          `${name}-pending-marker`,
        ]),
      ))
      expect(hydrated.text).toContain(
        `${route}-pending-marker clicked${route}-page-marker clicked`,
      )
      expect(hydrated).toMatchObject({
        recoverableErrors: [],
        consoleErrors: [],
      })
    },
    timeout,
  )

  // Bug: a split component with a boundary that another route option
  // reads (`head` reads `Page.name`) goes to a module the route module and
  // the chunk share, without the lazy component of its boundary, which
  // stays in the chunk: the shared module reads an undeclared name (the
  // build harness rejects the client output). Root cause: the code
  // splitter takes a JSX tag whose name starts with `_` for an intrinsic
  // element and does not count it as a read of the binding, here a name
  // the `<Hydrate>` transform generates (router-utils/src/
  // compiler-helpers.ts:268; same root cause as the `_Widget` row in
  // router-plugin/tests/code-splitter-jsx.test.ts).
  // Control: the "in their own groupings" row above (same route shape,
  // without `head`).
  // Source: fuzzing (oracle mode, round 2, F4: real Start builds, Vite and
  // Rsbuild).
  // Impact: the route's component throws a ReferenceError when it
  // renders, so the page never renders.
  test.fails(
    'boundaries in split route options that another option reads hydrate in the boundaries the server renders',
    async () => {
      const build = await buildStart({
        bundler,
        entry,
        files: {
          ...pageEntries,
          'src/toggle.tsx': toggleSource,
          ...splitRouteFiles(
            'read',
            `[['component'], ['pendingComponent']]`,
            `\n  head: () => ({ meta: [{ title: Page.name }] }),`,
          ),
          'src/pages.ts': routesPageModule(['read']),
        },
      })
      const html = (await renderPages(build)).routes
      expect(typeof html).toBe('string')
      expect(
        await hydratePage(build, html as string, 'routes', [
          'read-page-marker',
          'read-pending-marker',
        ]),
      ).toEqual({
        text: 'read-pending-marker clickedread-page-marker clicked',
        recoverableErrors: [],
        consoleErrors: [],
      })
    },
    timeout,
  )

  // Control for the pin below (same build): an unused export without a
  // boundary is not in the client.
  test(
    'an unused exported component without a boundary is not in the client',
    async () => {
      const build = await sharedApp()
      expect(build.client.where('unused-plain-marker')).toBe('nowhere')
    },
    timeout,
  )

  // Bug: the client parent declares the lazy component of each boundary
  // with a module-level call (`lazyRouteComponent(() => import(...))`)
  // that bundlers must keep (it is not marked pure), so the children of an
  // unused exported component still ship: the call stays in the eager
  // code, and its chunk is emitted.
  // Source: hydrate-when-transform.ts:653-690 (the call at :676); fuzzing
  // (oracle mode, round 2, F2).
  // Impact: the code of components nothing renders loads in the client.
  test.fails(
    'an unused exported component with a boundary is not in the client',
    async () => {
      const build = await sharedApp()
      expect(build.client.where('unused-hydrated-marker')).toBe('nowhere')
    },
    timeout,
  )

  // An export only the children use, which no other module imports, ends
  // up in the lazy chunk when the bundler may drop its initializer from the
  // parent (a function, or a call marked pure).
  // Source: hydrate-when-transform.test.ts "unwraps exported declarations
  // needed by extracted virtual modules" (N20).
  test.each([
    { name: 'a function', page: 'widgetFunction' },
    { name: 'a pure call', page: 'widgetPureCall' },
  ])(
    'an export only the children use, initialized by $name, loads lazily and hydrates',
    async ({ page }) => {
      const build = await sharedApp()
      expect(build.client.where(`${page}-marker`)).toBe('lazy')
      expect(await hydrateShared(page, [`${page}-marker`])).toEqual({
        text: `${page}-marker clicked`,
        recoverableErrors: [],
        consoleErrors: [],
      })
    },
    timeout,
  )

  // Bug: an initializer with side effects may keep the export in the eager
  // code (no warning is required), but it must run once, and the children
  // must render the one `Widget` it made, while the boundary's own children
  // still load lazily. Today the client chunk gets its own copy of the
  // declaration (hydrate-when-transform.ts:850-851, the module-level
  // declarations the children read are kept in the chunk), and the parent
  // keeps the export (its initializer has a side effect), so the
  // initializer runs twice: once in the parent, again when the chunk loads
  // (both bundlers). Same root cause as known-bugs-hydrate.test.ts "client:
  // an exported declaration the children use has one instance, initialized
  // once" (compiler level); this is its production-build row.
  // Source: hydrate-when-transform.test.ts "unwraps exported declarations
  // needed by extracted virtual modules" (N20); V1 hydrate-rsc 24.
  // Impact: the initializer's side effects run twice, and the children use
  // another instance than the module exports (e.g. another store).
  test.fails(
    'an export only the children use, initialized by a call, is initialized once and hydrates',
    async () => {
      const build = await sharedApp()
      expect(build.client.where('widgetCall-boundary-marker')).toBe('lazy')
      expect(
        await hydrateShared(
          'widgetCall',
          ['widgetCall-marker'],
          'globalThis.__initialized?.widgetCall',
        ),
      ).toEqual({
        text: 'widgetCall-marker clicked widgetCall-boundary-marker',
        recoverableErrors: [],
        consoleErrors: [],
        read: 1,
      })
    },
    timeout,
  )

  // Source maps point at the user's code: a throw in the children, which
  // run from their lazy chunk on the client, maps through the chunk's
  // emitted source map to its line in the page. The column is left out:
  // minifiers map the throw to different tokens of the expression.
  // Source: oracle-gaps M1 (round 2).
  test.each([
    { name: 'minified', minify: true },
    { name: 'unminified', minify: false },
  ])(
    'client: a throw in the children maps to its line in the page ($name)',
    async ({ minify }) => {
      const build = minify
        ? await sharedApp()
        : await buildStart({
            bundler,
            entry,
            minify,
            sourcemap: true,
            files: {
              ...pageEntries,
              'src/pages/throwing.tsx': throwingPage,
              'src/chart.ts': `export const chart: any = {}\n`,
              'src/pages.ts': `export { Page as throwing } from './pages/throwing'\n`,
            },
          })
      expect(build.client.where('MARK_HYDRATE_THROW')).toBe('lazy')
      const { result: stack } = await build.client
        .run(`return await new Promise((resolve) => {
  const root = entry.createRoot(document.getElementById('root'), {
    onUncaughtError: (error) => resolve(error.stack),
  })
  root.render(entry.createElement(entry.pages.throwing))
})`)
      expect(stack).toMatch(/MARK_HYDRATE_THROW/)
      const { file, line } =
        originalFrameOf(build.client, stack as string) ?? {}
      expect({ file, line }).toEqual({
        file: 'src/pages/throwing.tsx',
        line: throwingPage
          .slice(0, throwingPage.indexOf('chart.missing'))
          .split('\n').length,
      })
    },
    timeout,
  )

  // Children the compiler cannot extract fail the build with an error that
  // names the user's file and the line of the boundary, and the unsafe
  // pattern (SPEC J5.5, G5; what the message must say besides:
  // hydrate-boundary-forms.test.ts "children that cannot be split").
  // Source: FIX-PLAN HYD-07 (file + position, A9)
  test.each([
    {
      name: 'a function child',
      children: '{() => <p>child</p>}',
      pattern: /function/i,
    },
    {
      name: 'a hook call',
      children: '<p>{useThing()}</p>',
      pattern: /\bhooks?\b/i,
    },
  ])(
    'client: $name in a boundary fails the build, naming the file and line',
    async ({ children, pattern }) => {
      const page = `import { Hydrate } from '@tanstack/react-start'
import { idle } from '@tanstack/react-start/hydration'
import { useThing } from '../hooks'
export function Page() {
  return (
    <main>
      <Hydrate when={idle()}>${children}</Hydrate>
    </main>
  )
}
`
      const diagnostics = await captureThrow(() =>
        buildStart({
          bundler,
          entry,
          files: {
            ...pageEntries,
            'src/hooks.ts': `import { useId } from 'react'\nexport const useThing = () => useId()\n`,
            'src/pages/unsafe.tsx': page,
            'src/pages.ts': `export { Page as unsafe } from './pages/unsafe'\n`,
          },
        }),
      )
      const diagnostic = expectDiagnostic(diagnostics, {
        severity: 'error',
        file: 'src/pages/unsafe.tsx',
        distinctFrom: ['src/pages.ts'],
        position: { line: diagnosticPosition(page, '<Hydrate').line },
        source: page,
      })
      expect(diagnostic.text).toMatch(pattern)
    },
    timeout,
  )
})

/** A page whose boundary's children throw (`chart.missing` is undefined). */
const throwingPage = `import { Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
import { chart } from '../chart'
const title = 'title'
export function Page() {
  return (
    <Hydrate when={load()}>
      <b>{title}{chart.missing.MARK_HYDRATE_THROW}</b>
    </Hydrate>
  )
}
`

/**
 * The route `/<name>` (`src/routes/<name>.tsx`): its `pendingComponent` and
 * `component` each render an `interaction()` boundary with a `Toggle`, with
 * the route's `codeSplitGroupings` (none: the default ones) and `more` as
 * more route options.
 */
const splitRouteFiles = (name: string, groupings?: string, more = '') => ({
  [`src/routes/${name}.tsx`]: `import { createFileRoute } from '@tanstack/react-router'
import { Hydrate } from '@tanstack/react-start'
import { interaction } from '@tanstack/react-start/hydration'
import { Toggle } from '../toggle'
export const Route = createFileRoute('/${name}')({${groupings ? `\n  codeSplitGroupings: ${groupings},` : ''}
  pendingComponent: Pending,
  component: Page,${more}
})
function Pending() {
  return <Hydrate when={interaction()}><Toggle label="${name}-pending-marker" /></Hydrate>
}
function Page() {
  return <section><Hydrate when={interaction()}><Toggle label="${name}-page-marker" /></Hydrate></section>
}
`,
})

/**
 * A module exporting `routes`, a page that renders the `pendingComponent`
 * and `component` of each route `/<name>` of `names` (the route tree's own,
 * split or not).
 */
const routesPageModule = (
  names: Array<string>,
) => `import { createElement, Fragment } from 'react'
import { routeTree } from './routeTree.gen'
const options = (path: string) =>
  (Object.values((routeTree as any).children) as Array<any>).find(
    (route) => route.options.path === path,
  ).options
const routeOptions = ${JSON.stringify(names.map((name) => `/${name}`))}.map(options)
export function routes() {
  return createElement(
    Fragment,
    null,
    ...routeOptions.flatMap((route) => [
      createElement(route.pendingComponent),
      createElement(route.component),
    ]),
  )
}
`

/** The routes of the shared build (`splitRouteFiles`). */
const sharedRoutes = ['separateGroups', 'oneGroup', 'defaultGroups']

/** `src/pages/chart-<key>.tsx`: a `visible()` boundary around a `Chart`. */
const chartPage = (key: string, chartImport: string) => ({
  [`src/pages/chart-${key}.tsx`]: `import { Hydrate } from '@tanstack/react-start'
import { visible } from '@tanstack/react-start/hydration'
${chartImport}
import { FallbackPane } from './chart-${key}-fallback'
import { formatValue } from './chart-${key}-format'
const chartTitle = formatValue('Revenue')
export function Page() {
  return <Hydrate when={visible()} fallback={<FallbackPane />}><Chart title={chartTitle} /></Hydrate>
}
`,
  [`src/pages/chart-${key}-fallback.tsx`]: `export const FallbackPane = () => <p>${key}-fallback-marker</p>\n`,
  [`src/pages/chart-${key}-format.ts`]: `export const formatValue = (value: string) => value + ' ${key}-format-marker'\n`,
})

/** The package `name` of `node_modules`, with a `Chart` and an `Other`. */
const widgetsPackage = (name: string, manifest: Record<string, unknown>) => ({
  [`node_modules/${name}/package.json`]: JSON.stringify({
    name,
    type: 'module',
    ...manifest,
  }),
  [`node_modules/${name}/chart.js`]: `import { useState } from 'react'
import { jsxs } from 'react/jsx-runtime'
export const Chart = (props) => {
  const [clicked, setClicked] = useState(false)
  return jsxs('button', { onClick: () => setClicked(true), children: [props.title, ' ${name}-chart-marker', clicked ? ' clicked' : ''] })
}
`,
  [`node_modules/${name}/other.js`]: `export const Other = () => 'other'\n`,
  [`node_modules/${name}/index.js`]: `export { Chart } from './chart.js'
export { Other } from './other.js'
`,
})

/**
 * `src/pages/<name>.tsx`: a boundary whose children render `Widget`, an
 * export no other module imports, declared as `export const Widget =
 * <widget>`. `initialize(key, component)` counts its calls by key
 * (`globalThis.__initialized`), so only a purity hint lets the bundler drop
 * a call of it.
 */
const widgetPage = (name: string, widget: string, more = '') => ({
  [`src/pages/${name}.tsx`]: `import { useState } from 'react'
import { Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
import { initialize } from '../initialize'
export const Widget = ${widget}
export function Page() {
  return <Hydrate when={load()}><Widget />${more}</Hydrate>
}
`,
})
const widgetComponent = (name: string) => `function Widget() {
  const [clicked, setClicked] = useState(false)
  return <button onClick={() => setClicked(true)}>${name}-marker{clicked ? ' clicked' : ''}</button>
}`

/** The pages of the shared build of each bundler. */
const sharedFiles: Record<string, string> = {
  'src/toggle.tsx': toggleSource,
  'src/initialize.ts': `export const initialize = <T,>(key: string, component: T) => {
  const counts = ((globalThis as any).__initialized ??= {})
  counts[key] = (counts[key] ?? 0) + 1
  return component
}
`,
  'src/chart.ts': `export const chart: any = {}\n`,
  'src/pages/throwing.tsx': throwingPage,
  ...chartPage('project', `import { Chart } from './chart-project-chart'`),
  'src/pages/chart-project-chart.tsx': `import { useState } from 'react'
export const Chart = (props: { title: string }) => {
  const [clicked, setClicked] = useState(false)
  return <button onClick={() => setClicked(true)}>{props.title} project-chart-marker{clicked ? ' clicked' : ''}</button>
}
`,
  ...chartPage(
    'plain-widgets',
    `import { Chart, Other } from 'plain-widgets'
console.log(Other)`,
  ),
  ...widgetsPackage('plain-widgets', {}),
  ...chartPage(
    'pure-widgets',
    `import { Chart, Other } from 'pure-widgets'
console.log(Other)`,
  ),
  ...widgetsPackage('pure-widgets', { sideEffects: false }),
  'src/pages/two-chart.tsx': `import { useState } from 'react'
export const Chart = () => {
  const [clicked, setClicked] = useState(false)
  return <button onClick={() => setClicked(true)}>two-chart-marker{clicked ? ' clicked' : ''}</button>
}
`,
  'src/pages/two-table.tsx': `import { useState } from 'react'
export const Table = () => {
  const [clicked, setClicked] = useState(false)
  return <button onClick={() => setClicked(true)}>{' '}two-table-marker{clicked ? ' clicked' : ''}</button>
}
`,
  'src/pages/two-boundaries.tsx': `import { Hydrate } from '@tanstack/react-start'
import { interaction } from '@tanstack/react-start/hydration'
import { Chart } from './two-chart'
import { Table } from './two-table'
export function Page() {
  return <><Hydrate when={interaction()}><Chart /></Hydrate><Hydrate when={interaction()}><Table /></Hydrate></>
}
`,
  'src/lib.ts': `export const source = ['lib-marker', { b: 'B' }] as const\n`,
  'src/pages/module-level.tsx': `import { Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
import { source } from '../lib'
import { Toggle } from '../toggle'
const [a, { b }] = source
function helper(value: string) {
  return value + ' helper-marker'
}
export function Page() {
  return <Hydrate when={load()}><Toggle label={helper(a + b)} /></Hydrate>
}
`,
  ...splitRouteFiles('separateGroups', `[['component'], ['pendingComponent']]`),
  ...splitRouteFiles('oneGroup', `[['component', 'pendingComponent']]`),
  ...splitRouteFiles('defaultGroups'),
  // Modules with unused exported components, one with a boundary and one
  // without; the app imports only their used neighbours.
  'src/hydrated-widgets.tsx': `import { Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
export function UnusedHydratedWidget() {
  return <div><Hydrate when={load()}><section>unused-hydrated-marker</section></Hydrate></div>
}
export function UsedHydratedWidget() {
  return <p>used</p>
}
`,
  'src/plain-widgets.tsx': `export function UnusedPlainWidget() {
  return <div><section>unused-plain-marker</section></div>
}
export function UsedPlainWidget() {
  return <p>used</p>
}
`,
  ...widgetPage('widgetFunction', widgetComponent('widgetFunction')),
  ...widgetPage(
    'widgetPureCall',
    `/* @__PURE__ */ initialize('widgetPureCall', ${widgetComponent('widgetPureCall')})`,
  ),
  ...widgetPage(
    'widgetCall',
    `initialize('widgetCall', ${widgetComponent('widgetCall')})`,
    `<i> widgetCall-boundary-marker</i>`,
  ),
  'src/pages.ts': `export { Page as chartProject } from './pages/chart-project'
export { Page as chartPlainWidgets } from './pages/chart-plain-widgets'
export { Page as chartPureWidgets } from './pages/chart-pure-widgets'
export { Page as twoBoundaries } from './pages/two-boundaries'
export { Page as moduleLevel } from './pages/module-level'
export { Page as widgetFunction } from './pages/widgetFunction'
export { Page as widgetPureCall } from './pages/widgetPureCall'
export { Page as widgetCall } from './pages/widgetCall'
export { routes } from './route-pages'
export { UsedHydratedWidget } from './hydrated-widgets'
export { UsedPlainWidget } from './plain-widgets'
export { Page as throwing } from './pages/throwing'
`,
  'src/route-pages.ts': routesPageModule(sharedRoutes),
}

describe('Vite dev server', () => {
  const page = (
    text: string,
  ) => `import { Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
export function Page() {
  return <Hydrate when={load()}><p>${text}</p></Hydrate>
}
`

  // A browser may request a chunk before its parent module was compiled in
  // this dev session (a reload after a server restart), and an edit of the
  // file must reach its chunks. The page is the app's `index.html`, rendered
  // on the client by a real page with Vite's HMR client and React Refresh.
  // Source: hydrate-when-transform.test.ts "invalidates cached Hydrate
  // source for virtual module loads" (gaps H21 / DV42; the compiler half is
  // in hydrate-boundary-forms.test.ts)
  test(
    'client: a chunk requested before its parent module renders the children, and an edit reaches it',
    async () => {
      const files = { 'src/page.tsx': page('Old') }
      // The chunk the parent module imports, learned from another server.
      const first = await startDevServer({ files })
      const [chunkUrl] = moduleRequests(
        await first.transform('/src/page.tsx'),
      ).dynamic
      await first.close()
      expect(chunkUrl).toBeDefined()

      const server = await startDevServer({
        browser: true,
        config: {
          optimizeDeps: {
            include: [
              'react',
              'react/jsx-dev-runtime',
              'react-dom',
              'react-dom/client',
              '@tanstack/react-router',
            ],
          },
        },
        plugins: [react()],
        files: {
          ...files,
          'index.html': `<!doctype html>
<html>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
          // Requests the chunk first, then the page module.
          'src/main.tsx': `import { createRoot } from 'react-dom/client'
await import(/* @vite-ignore */ ${JSON.stringify(chunkUrl)})
const { Page } = await import('./page')
createRoot(document.getElementById('app')!).render(<Page />)
`,
        },
      })
      const browser = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      await browser.waitForText('Old', { selector: '#app' })

      await server.write({ 'src/page.tsx': page('New') })

      await browser.waitForText('New', { selector: '#app' })
      expect(browser.errors).toEqual([])
    },
    timeout,
  )
})

describe('Rsbuild dev server', () => {
  // Rsbuild serves bundles: a chunk is only built through its parent's
  // import, so only the edit half of the Vite test applies.
  test(
    'client: an edit of the file reaches the chunk of its boundary',
    async () => {
      const page = (
        marker: string,
      ) => `import { Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
export function Page() {
  return <Hydrate when={load()}><p>${marker}</p></Hydrate>
}
`
      const server = await startRsbuildDevServer({
        files: {
          'src/page.tsx': page('OLD_MARKER'),
          'src/entry.ts': `import { Page } from './page'\nconsole.log(Page)\n`,
        },
      })
      /** The output files containing each marker. */
      const locate = async () => {
        const outputs = Object.entries(await server.outputs())
        const files = (marker: string) =>
          outputs
            .filter(([, code]) => code.includes(marker))
            .map(([file]) => file)
        return {
          entry: files('console.log(Page)'),
          old: files('OLD_MARKER'),
          new: files('NEW_MARKER'),
        }
      }
      const before = await locate()
      expect(before.old).toHaveLength(1)
      // The children are in a chunk of their own.
      expect(before.entry).not.toContain(before.old[0])

      await server.edit({ 'src/page.tsx': page('NEW_MARKER') })

      expect(server.errors).toEqual([])
      const after = await locate()
      expect({ old: after.old, new: after.new }).toEqual({
        old: [],
        new: [expect.any(String)],
      })
      expect(after.entry).not.toContain(after.new[0])
    },
    timeout,
  )
})
