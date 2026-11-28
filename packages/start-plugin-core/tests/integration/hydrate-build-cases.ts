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
import ts from 'typescript'
import { describe, expect, test } from 'vitest'
import { originalFrameOf } from '@tanstack/compiler-test-utils/build-harness'
import { problems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import {
  diagnosticPosition,
  expectDiagnostic,
  expectNoDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { closeAfterAll } from '../file-end'
import { StartBuildError, buildStartShared } from '../build-harness'
import { buildStart } from '../build-start'
import { typeCheck } from './start-compose-app'
import type { StartBuild, StartBundler } from '../build-harness'

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
const requestsAt = []
const deadline = Date.now() + 10_000
for (const label of ${JSON.stringify(click)}) {
  while (!button(label)?.textContent.includes(label + ' clicked')) {
    if (Date.now() > deadline) {
      throw new Error('child did not respond to clicks: ' + label + ': ' + root.innerHTML)
    }
    button(label)?.click()
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  requestsAt.push(performance.getEntriesByType('resource').map((entry) => new URL(entry.name).pathname))
}
return {
  text: root.textContent,
  recoverableErrors,
  consoleErrors,${read ? `\n  read: ${read},` : ''}
}`)
  return result as Hydrated
}

export function hydrateBuildSuite(bundler: StartBundler) {
  describe(`${bundler} build`, () => {
    // One production build (minified, with source maps) of every page below;
    // each test reads its own page (its own markers and modules).
    let shared: Promise<StartBuild> | undefined
    let sharedHtml: ReturnType<typeof renderPages> | undefined
    const sharedApp = () =>
      (shared ??= openShared(() =>
        buildStartShared({
          bundler,
          entry,
          sourcemap: true,
          files: { ...pageEntries, ...sharedFiles },
        }),
      ))
    const openShared = closeAfterAll()

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
    // module helpers move" (placement).
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
    )

    // Each boundary loads only its own children's code, and each child
    // hydrates in its own boundary: an `interaction()` boundary hydrates when
    // its server-rendered marker is clicked, which finds the boundary by the
    // identity the server rendered.
    test('two boundaries each load their own children lazily and hydrate on their own interaction', async () => {
      const build = await sharedApp()
      const chart = build.client.locate('two-chart-marker')
      const table = build.client.locate('two-table-marker')
      expect({ chart: chart.eager, table: table.eager }).toEqual({
        chart: [],
        table: [],
      })
      for (const [first, second, unopened] of [
        ['two-table-marker', 'two-chart-marker', chart.lazy],
        ['two-chart-marker', 'two-table-marker', table.lazy],
      ] as const) {
        const hydrated = await hydrateShared(
          'twoBoundaries',
          [first, second],
          'requestsAt',
        )
        expect(hydrated).toMatchObject({
          text: 'two-chart-marker clicked two-table-marker clicked',
          recoverableErrors: [],
          consoleErrors: [],
        })
        const [afterFirst, afterSecond] = hydrated.read as Array<Array<string>>
        const requested = (urls: Array<string>) =>
          unopened.some((file) => urls.some((url) => url.endsWith('/' + file)))
        expect(requested(afterFirst!)).toBe(false)
        expect(requested(afterSecond!)).toBe(true)
      }
    })

    // Module-level code only the children use is in the client once: a
    // helper declaration in the lazy chunk; a destructuring of an import (an
    // initializer, whose timing is left open) in the lazy chunk or the eager
    // code. Either way the children hydrate with its values.
    // Source: hydrate-split-modules.test.ts "the children read a
    // module-level destructuring of an import" (placement), "helpers shared
    // by two boundaries"; Qwik optimizer example_invalid_references
    test('module-level code only the children use is not duplicated', async () => {
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
    })

    // A route whose split options (`component` and `pendingComponent`)
    // contain boundaries: each boundary hydrates in the boundary the server
    // rendered (`interaction()`, see above) and loads its own children. The
    // route's groupings are its own (`codeSplitGroupings`); the default ones
    // split `component` only, so `pendingComponent` stays in the route module
    // and only its boundary's children are lazy. One page renders the three
    // routes (their boundaries render at the same time, so their identities
    // must not collide either).
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
    )

    // A split component with a boundary that another route option reads
    // (`head` reads `Page.name`): the chunk and the route module agree on
    // where the boundary's lazy component lives.
    // Control: the "in their own groupings" row above (same route shape,
    // without `head`).
    // Source: fuzzing (real Start builds, Vite and Rsbuild).
    test('boundaries in split route options that another option reads hydrate in the boundaries the server renders', async () => {
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
    })

    // A route file exporting the component its boundary's children render
    // (spec-phase2-hydrate r2): the chunk holds its own copy, as on main, so
    // in an app marked `"sideEffects": false` the route module's unused
    // export and its import drop, and the module that component imports
    // loads with the chunk, not with the route module; the boundary
    // hydrates. (Without the hint the route module's import evaluates that
    // module eagerly, on main too.)
    test('an exported component of a route file that only the children render loads its imports with the chunk', async () => {
      const build = await buildStart({
        bundler,
        entry,
        sideEffects: false,
        files: {
          ...pageEntries,
          'src/toggle.tsx': toggleSource,
          'src/comments-chart.tsx': `import { Toggle } from './toggle'
export const CommentsChart = () => <Toggle label="route-export-marker" />
`,
          'src/routes/comments.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { Hydrate } from '@tanstack/react-start'
import { interaction } from '@tanstack/react-start/hydration'
import { CommentsChart } from '../comments-chart'
export function Comments() { return <CommentsChart /> }
function Page() { return <article><Hydrate when={interaction()}><Comments /></Hydrate></article> }
export const Route = createFileRoute('/comments')({ component: Page })
`,
          'src/pages.ts': `import { createElement } from 'react'
import { routeTree } from './routeTree.gen'
const route = (Object.values((routeTree as any).children) as Array<any>).find(
  (candidate) => candidate.options.path === '/comments',
)
export function routes() {
  return createElement(route.options.component)
}
`,
        },
      })
      expect(build.client.where('route-export-marker')).toBe('lazy')
      const html = (await renderPages(build)).routes
      expect(typeof html).toBe('string')
      expect(
        await hydratePage(build, html as string, 'routes', [
          'route-export-marker',
        ]),
      ).toEqual({
        text: 'route-export-marker clicked',
        recoverableErrors: [],
        consoleErrors: [],
      })
    })

    // A hook that needs the browser whose value only the fallback reads, in
    // a route file (its component in a split chunk) and in a component file:
    // the server drops the call with the declaration, as main's split chunk
    // does, and renders the children (main keeps the call outside split
    // route chunks, and the server render throws there).
    // Source: design-hooks-clientonly-hydrate `hy-fb-vp`.
    test('a browser-only hook only the fallback reads lets the server render the children, in a route file and a component file', async () => {
      const fallbackPage = (label: string) => `function Page() {
  const vp = useViewport()
  return <section><p>outside</p><Hydrate when={interaction()} fallback={<p>{vp}</p>}><Toggle label="${label}" /></Hydrate></section>
}`
      const imports = (
        up: string,
      ) => `import { Hydrate } from '@tanstack/react-start'
import { interaction } from '@tanstack/react-start/hydration'
import { Toggle } from '${up}/toggle'
import { useViewport } from '${up}/browser-hook'
`
      const build = await buildStart({
        bundler,
        entry,
        files: {
          ...pageEntries,
          'src/toggle.tsx': toggleSource,
          'src/browser-hook.ts': `import { useState } from 'react'
export function useViewport() {
  const [width] = useState(() => (window.innerWidth > 0 ? 'vp-wide' : 'vp-narrow'))
  return width
}
`,
          'src/routes/viewport.tsx': `import { createFileRoute } from '@tanstack/react-router'
${imports('..')}${fallbackPage('fallback-route-marker')}
export const Route = createFileRoute('/viewport')({ component: Page })
`,
          'src/pages/viewport.tsx': `${imports('..')}export ${fallbackPage('fallback-file-marker')}
`,
          'src/pages.ts': `import { createElement } from 'react'
import { routeTree } from './routeTree.gen'
export { Page as file } from './pages/viewport'
const route = (Object.values((routeTree as any).children) as Array<any>).find(
  (candidate) => candidate.options.path === '/viewport',
)
export function routes() {
  return createElement(route.options.component)
}
`,
        },
      })
      const html = await renderPages(build)
      for (const [name, label] of [
        ['routes', 'fallback-route-marker'],
        ['file', 'fallback-file-marker'],
      ] as const) {
        expect(html[name]).toContain(label)
        expect(
          await hydratePage(build, html[name] as string, name, [label]),
        ).toEqual({
          text: `outside${label} clicked`,
          recoverableErrors: [],
          consoleErrors: [],
        })
      }
    })

    // A helper both the page and the children call, which writes a module
    // `let` (a lazily built cache, a scratch variable): each side holds its
    // own copy, as on main, and both read the right value
    // (review-phase2-fixes 1.2).
    test('a lazily built cache and a scratch variable the page and the children both use build and read their values', async () => {
      const build = await buildStart({
        bundler,
        entry,
        files: {
          ...pageEntries,
          'src/toggle.tsx': toggleSource,
          'src/pages/cache.tsx': `import { Hydrate } from '@tanstack/react-start'
import { interaction } from '@tanstack/react-start/hydration'
import { Toggle } from '../toggle'
let table: { n: number } | null = null
function getTable() { if (table === null) { table = { n: 42 } } return table }
let tmp = 0
function twice(n: number) { tmp = n * 2; return tmp }
export function Page() {
  return <section><i>{'outside-' + getTable().n + '-' + twice(5)}</i><Hydrate when={interaction()}><Toggle label={'cache-' + getTable().n + '-' + twice(21)} /></Hydrate></section>
}
`,
          'src/pages.ts': `export { Page as cache } from './pages/cache'
`,
        },
      })
      expect(problems(build.diagnostics)).toEqual([])
      const html = (await renderPages(build)).cache
      expect(typeof html).toBe('string')
      expect(
        await hydratePage(build, html as string, 'cache', ['cache-42-42']),
      ).toEqual({
        text: 'outside-42-10cache-42-42 clicked',
        recoverableErrors: [],
        consoleErrors: [],
      })
    })

    // Children reading the route of a boundary outside the route's
    // component (an exported component another page renders): the chunk
    // imports the route, as split chunks do, so the children read the one
    // route the route tree updated (its `path`), not a second
    // `createFileRoute(…)` (measure-phase2, finding 2; `main` reads `Route`
    // unbound there).
    test('children reading the route of a boundary outside its component use the one route', async () => {
      const build = await buildStart({
        bundler,
        entry,
        files: {
          ...pageEntries,
          'src/toggle.tsx': toggleSource,
          'src/routes/badge.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { Hydrate } from '@tanstack/react-start'
import { interaction } from '@tanstack/react-start/hydration'
import { Toggle } from '../toggle'
export const Route = createFileRoute('/badge')({ component: Page })
function Badge() { return <Toggle label={'badge-' + Route.options.path} /> }
export function PostBadge() { return <Hydrate when={interaction()}><Badge /></Hydrate> }
function Page() { return <div>page</div> }
`,
          'src/pages.ts': `import './routeTree.gen'
export { PostBadge as badge } from './routes/badge'
`,
        },
      })
      const html = (await renderPages(build)).badge
      expect(typeof html).toBe('string')
      expect(
        await hydratePage(build, html as string, 'badge', ['badge-/badge']),
      ).toEqual({
        text: 'badge-/badge clicked',
        recoverableErrors: [],
        consoleErrors: [],
      })
    })

    // Control for the row below (same build): an unused export without a
    // boundary is not in the client.
    test('an unused exported component without a boundary is not in the client', async () => {
      const build = await sharedApp()
      expect(build.client.where('unused-plain-marker')).toBe('nowhere')
    })

    // The client parent declares the lazy component of each boundary with a
    // call marked pure, so the children of an unused exported component do
    // not ship. Source: fuzzing. (Rsbuild: before Rspack 2.3.2, which the
    // supported `@rsbuild/core ^2.2.13` still allows, Rspack's inner graph
    // drops the unused declaration (`/* unused pure expression */ null &&
    // (…)`) but still emits the async chunk of the `import()` inside it, so
    // the chunk file ships, unreferenced; webpack behaves the same. 2.3.2's
    // release notes list "prune dynamic imports from unused exports",
    // web-infra-dev/rspack#15449.)
    test('an unused exported component with a boundary is not in the client', async () => {
      const build = await sharedApp()
      expect(build.client.where('unused-hydrated-marker')).toBe('nowhere')
    })

    // An export only the children use, which no other module imports, ends
    // up in the lazy chunk when the bundler may drop its initializer from the
    // parent (a function, or a call marked pure).
    // Source: hydrate-when-transform.test.ts "unwraps exported declarations
    // needed by extracted virtual modules".
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
    )

    // An exported let the children of a `split={false}` boundary assign
    // stays live: the children run in the page, and a click's assignment is
    // what the page's importers read (`split={false}` keeps one instance;
    // a split boundary's chunk holds its own copy, as on main).
    test('an exported let the children of a split={false} boundary assign stays live', async () => {
      const build = await sharedApp()
      expectNoDiagnostic(problems(build.diagnostics), {
        file: 'src/pages/module-write-split-false.tsx',
        root: build.root,
      })
      expect(build.client.where('moduleWriteSplitFalse-marker')).toBe('eager')
      expect(
        await hydrateShared(
          'moduleWriteSplitFalse',
          ['moduleWriteSplitFalse-marker'],
          'entry.pages.splitFalseClicks',
        ),
      ).toEqual({
        text: 'moduleWriteSplitFalse-marker clicked',
        recoverableErrors: [],
        consoleErrors: [],
        read: 1,
      })
    })

    // What a function reading a let the component reassigns can use to be
    // split (below, kept in place): the value in a ref holding its initial value. The
    // split handler reads the effect's later assignment, and the page
    // type-checks with the app's React types (React 19's `useRef` takes its
    // initial value). Source: Astra review of #8817, round 3, hydrate B5.
    test('a ref in place of a reassigned let builds, hydrates and type-checks', async () => {
      const build = await sharedApp()
      expectNoDiagnostic(problems(build.diagnostics), {
        file: 'src/pages/timer-ref.tsx',
        root: build.root,
      })
      expect(
        await hydrateShared(
          'timerRef',
          ['timerRef-marker'],
          'typeof globalThis.__stoppedTimer',
        ),
      ).toEqual({
        text: 'timerRef-marker clicked',
        recoverableErrors: [],
        consoleErrors: [],
        read: 'number',
      })
      expect(
        typeCheck(build.root, ['src/pages/timer-ref.tsx'], {
          jsx: ts.JsxEmit.ReactJSX,
          jsxImportSource: 'react',
        }),
      ).toEqual([])
    })

    // Source maps point at the user's code: a throw in the children, which
    // run from their lazy chunk on the client, maps through the chunk's
    // emitted source map to its line in the page. The column is left out:
    // minifiers map the throw to different tokens of the expression.
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
    )

    // Children the compiler cannot extract fail the build with an error that
    // names the user's file and the line of the boundary (SPEC J5.5, G5,
    // §5.7: no wording is required). Every channel of the failed build is
    // read (a compiler may print the details and fail with a short error).
    // (`at`: the error's line, default the boundary's)
    test.each([
      { name: 'a function child', children: '{() => <p>child</p>}' },
      { name: 'a hook call', children: '<p>{useThing()}</p>' },
      // A private name of the class the boundary is in: the chunk is
      // outside it (on main, the build fails to parse the chunk; Rsbuild
      // here built a chunk the browser refuses). Source: Astra review of
      // #8817, hydrate #2.
      {
        name: 'a private field of the enclosing class',
        children: '',
        page: `import { Hydrate } from '@tanstack/react-start'
import { idle } from '@tanstack/react-start/hydration'
class Formatter {
  #label = 'OK'
  render() {
    const model = this
    return <Hydrate when={idle()}><b>{model.#label}</b></Hydrate>
  }
}
export function Page() {
  return new Formatter().render()
}
`,
      },
    ] as Array<{
      name: string
      children: string
      setup?: string
      at?: string
      module?: string
      /** The whole page, instead of `Page` rendering `children`. */
      page?: string
    }>)(
      'client: $name in a boundary fails the build, naming the file and line',
      async ({
        children,
        setup = '',
        at = '<Hydrate',
        module = '',
        ...row
      }) => {
        const page =
          row.page ??
          `import { useEffect } from 'react'
import { Hydrate } from '@tanstack/react-start'
import { idle } from '@tanstack/react-start/hydration'
import { useThing } from '../hooks'
${module}export function Page() {
  ${setup}return (
    <main>
      <Hydrate when={idle()}>${children}</Hydrate>
    </main>
  )
}
`
        const failure = await buildStart({
          bundler,
          entry,
          files: {
            ...pageEntries,
            'src/hooks.ts': `import { useId } from 'react'\nexport const useThing = () => useId()\n`,
            'src/pages/unsafe.tsx': page,
            'src/pages.ts': `export { Page as unsafe } from './pages/unsafe'\n`,
          },
        }).then(
          () => undefined,
          (error: unknown) => error,
        )
        expect(failure, 'the build fails').toBeInstanceOf(StartBuildError)
        expectDiagnostic(problems((failure as StartBuildError).diagnostics), {
          severity: 'error',
          file: 'src/pages/unsafe.tsx',
          position: { line: diagnosticPosition(page, at).line },
        })
      },
    )

    // Children the split would give a copy of what they read or assign
    // build with a warning naming the user's file and line (one, on any
    // channel), and stay in place (SPEC J5.5, decision 12). (`at`: the
    // warning's line, default the boundary's)
    test.each([
      // The split children receive the variable's value when the boundary
      // renders: a function in them would read that snapshot, not the
      // variable the component reassigns later (R123).
      {
        name: 'a function reading a let the component reassigns',
        setup: `let timer: number | undefined
  useEffect(() => {
    timer = window.setInterval(() => {}, 1000)
  }, [])
  `,
        children: `<button
        onClick={() => clearInterval(timer)}
      >stop</button>`,
        at: 'clearInterval(timer)',
      },
      // The chunk would assign its own copy of a module `let` the module
      // reads, or a binding it imports (a `var` a statement declares).
      {
        name: 'a module let the children assign',
        module: `let last = ''
export const readLast = () => last
`,
        children: `<button onClick={() => { last = 'x' }}>b</button>`,
      },
      {
        name: 'a module let their component assigns',
        module: `let last = ''
export const readLast = () => last
function Btn() {
  return <button onClick={() => { last = 'x' }}>b</button>
}
`,
        children: '<Btn />',
      },
      {
        name: 'a var a top-level statement declares, which the children assign',
        module: `if (typeof window !== 'undefined') { var flag: unknown = globalThis.length }
`,
        children: `<button onClick={() => { flag = 1 }}>{String(flag)}</button>`,
      },
    ] as Array<{
      name: string
      children: string
      setup?: string
      at?: string
      module?: string
    }>)(
      'client: $name in a boundary builds with one warning, in place',
      async ({ children, setup = '', at = '<Hydrate', module = '' }) => {
        const page = `import { useEffect } from 'react'
import { Hydrate } from '@tanstack/react-start'
import { idle } from '@tanstack/react-start/hydration'
${module}export function Page() {
  ${setup}return (
    <main>
      <Hydrate when={idle()}>${children}<i>MARK_IN_PLACE</i></Hydrate>
    </main>
  )
}
`
        const build = await buildStart({
          bundler,
          entry,
          files: {
            ...pageEntries,
            'src/pages/kept.tsx': page,
            'src/pages.ts': `export { Page as kept } from './pages/kept'\n`,
          },
        })
        expectDiagnostic(problems(build.diagnostics), {
          severity: 'warning',
          file: 'src/pages/kept.tsx',
          root: build.root,
          position: { line: diagnosticPosition(page, at).line },
        })
        expect(build.client.where('MARK_IN_PLACE')).toBe('eager')
      },
    )
  })
}

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
const widgetPage = (name: string, widget: string) => ({
  [`src/pages/${name}.tsx`]: `import { useState } from 'react'
import { Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
import { initialize } from '../initialize'
export const Widget = ${widget}
export function Page() {
  return <Hydrate when={load()}><Widget /></Hydrate>
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
  'src/pages/module-write-split-false.tsx': `import { useState } from 'react'
import { Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
export let splitFalseClicks = 0
export function Page() {
  const [clicked, setClicked] = useState(false)
  return (
    <Hydrate when={load()} split={false}>
      <button onClick={() => { splitFalseClicks++; setClicked(true) }}>moduleWriteSplitFalse-marker{clicked ? ' clicked' : ''}</button>
    </Hydrate>
  )
}
`,
  'src/pages/timer-ref.tsx': `import { useEffect, useRef, useState } from 'react'
import { Hydrate } from '@tanstack/react-start'
import { idle } from '@tanstack/react-start/hydration'
export function Page() {
  const timer = useRef<number>(undefined)
  const [clicked, setClicked] = useState(false)
  useEffect(() => {
    timer.current = window.setInterval(() => {}, 1000)
    return () => clearInterval(timer.current)
  }, [])
  return (
    <main>
      <Hydrate when={idle()}>
        <button
          onClick={() => {
            clearInterval(timer.current)
            ;(globalThis as { __stoppedTimer?: number }).__stoppedTimer = timer.current
            setClicked(true)
          }}
        >timerRef-marker{clicked ? ' clicked' : ''}</button>
      </Hydrate>
    </main>
  )
}
`,
  'src/pages.ts': `export { Page as chartProject } from './pages/chart-project'
export { Page as timerRef } from './pages/timer-ref'
export { Page as chartPlainWidgets } from './pages/chart-plain-widgets'
export { Page as chartPureWidgets } from './pages/chart-pure-widgets'
export { Page as twoBoundaries } from './pages/two-boundaries'
export { Page as moduleLevel } from './pages/module-level'
export { Page as widgetFunction } from './pages/widgetFunction'
export { Page as widgetPureCall } from './pages/widgetPureCall'
export { routes } from './route-pages'
export { UsedHydratedWidget } from './hydrated-widgets'
export { UsedPlainWidget } from './plain-widgets'
export { Page as throwing } from './pages/throwing'
export { Page as moduleWriteSplitFalse, splitFalseClicks } from './pages/module-write-split-false'
`,
  'src/route-pages.ts': routesPageModule(sharedRoutes),
}
