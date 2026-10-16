/**
 * `<Hydrate>` in real builds (Start's Vite and Rsbuild plugins) and on Vite
 * and Rsbuild dev servers: where the children's code ends up is the
 * bundler's decision (with the side-effect hints of the app), so it is
 * asserted on build output.
 */
import { describe, expect, onTestFinished, test } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createDevServer,
  evaluateServed,
} from '@tanstack/compiler-test-utils/dev-server'
import {
  buildStart,
  routerRuntimeFiles,
  startBundlers,
  startRuntimeFiles,
} from './build-harness'
import { startCompilerPlugin } from '../src/vite/start-compiler-plugin/plugin'
import { startDevServer } from './dev-server'
import { startRsbuildDevServer } from './rsbuild-dev-server'
import { getChunkComponent, getChunkIds } from './regression-helpers'
import type { BuildResult } from '@tanstack/compiler-test-utils/build-harness'

const timeout = 60_000

const startIndex = 'node_modules/@tanstack/react-start/index.js'
const startManifest = JSON.parse(
  startRuntimeFiles['node_modules/@tanstack/react-start/package.json']!,
)

/**
 * Stand-ins of the packages a `<Hydrate>` module imports: React's JSX
 * runtimes render intrinsic elements as tags, `Hydrate` records its boundary
 * id (`globalThis.__boundaryIds`) and renders its children between brackets,
 * and `lazyRouteComponent` renders the component it loaded (after
 * `preload()`); every lazy component is listed in
 * `globalThis.__lazyComponents` (`renderThroughChunks`).
 */
const hydrateRuntimeFiles: Record<string, string> = {
  'node_modules/@tanstack/react-start/package.json': JSON.stringify({
    ...startManifest,
    exports: {
      ...startManifest.exports,
      './hydration': { import: { default: './hydration.js' } },
    },
  }),
  [startIndex]: `${startRuntimeFiles[startIndex]}
export const Hydrate = (props) => {
  ;(globalThis.__boundaryIds ??= []).push(props.h)
  return '[' + (props.children ?? '') + ']'
}
`,
  'node_modules/@tanstack/react-start/hydration.js': `export const idle = () => 'idle'
export const visible = () => 'visible'
`,
  'node_modules/@tanstack/react-router/package.json': JSON.stringify({
    name: '@tanstack/react-router',
    type: 'module',
    sideEffects: false,
    exports: { '.': './index.js' },
  }),
  'node_modules/@tanstack/react-router/index.js': `${routerRuntimeFiles[
    'node_modules/@tanstack/react-router/index.js'
  ]!.replace(/export const lazyRouteComponent[^]*$/, '')}
export function lazyRouteComponent(load, name = 'default') {
  let loaded
  const Lazy = (props) => {
    if (!loaded) throw new Error('lazy component rendered before it loaded')
    Lazy.rendered = true
    return loaded(props)
  }
  Lazy.preload = async () => {
    loaded = (await load())[name]
    Lazy.loaded = true
  }
  ;(globalThis.__lazyComponents ??= []).push(Lazy)
  return Lazy
}
`,
  'node_modules/react/package.json': JSON.stringify({
    name: 'react',
    type: 'module',
    sideEffects: false,
    exports: {
      './jsx-runtime': './jsx-runtime.js',
      './jsx-dev-runtime': './jsx-runtime.js',
    },
  }),
  'node_modules/react/jsx-runtime.js': `export const Fragment = Symbol('Fragment')
const text = (children) =>
  [children].flat(Infinity).filter((c) => c != null && c !== false && c !== true).join('')
export function jsx(type, props) {
  if (type === Fragment) return text(props.children)
  if (typeof type === 'function') {
    return type(props.children === undefined ? props : { ...props, children: text(props.children) })
  }
  return '<' + type + '>' + text(props.children) + '</' + type + '>'
}
export const jsxs = jsx
export const jsxDEV = jsx
`,
}

/**
 * Script of a build's `run()`: renders `render` (an expression with the
 * entry's exports in scope as `entry`) like the browser hydrates the page:
 * a lazy component that has not loaded throws, so every lazy component
 * created so far loads and the page renders again. Returns the HTML, the
 * boundary ids `<Hydrate>` rendered with and how many lazy components
 * rendered and were created.
 */
const renderThroughChunks = (
  render: string,
) => `for (let attempt = 0; ; attempt++) {
  globalThis.__boundaryIds = []
  try {
    const html = ${render}
    const lazy = globalThis.__lazyComponents ?? []
    return {
      html,
      ids: globalThis.__boundaryIds,
      lazy: { created: lazy.length, rendered: lazy.filter((component) => component.rendered).length },
    }
  } catch (error) {
    const pending = (globalThis.__lazyComponents ?? []).filter((component) => !component.loaded)
    if (pending.length === 0 || attempt > 5) throw error
    await Promise.all(pending.map((component) => component.preload()))
  }
}`

interface Rendered {
  html: unknown
  ids: Array<unknown>
  lazy: { created: number; rendered: number }
}

/**
 * Renders `render` in the SSR and the client build (`renderThroughChunks`):
 * the client renders the HTML the server renders, with the same boundary
 * ids, and every lazy component it created rendered. Returns the server
 * rendering.
 */
async function expectHydratesLikeServer(
  build: { client: BuildResult; ssr: BuildResult },
  render: string,
) {
  const server = (await build.ssr.run(renderThroughChunks(render)))
    .result as Rendered
  const client = (await build.client.run(renderThroughChunks(render)))
    .result as Rendered
  expect({ html: client.html, ids: client.ids }).toEqual({
    html: server.html,
    ids: server.ids,
  })
  expect(client.lazy.created).toBeGreaterThan(0)
  expect(client.lazy.rendered).toBe(client.lazy.created)
  return server
}

describe.each(startBundlers)(
  '%s build: the code of the children',
  (bundler) => {
    const page = (
      chartImport: string,
    ) => `import { Hydrate } from '@tanstack/react-start'
import { visible } from '@tanstack/react-start/hydration'
${chartImport}
import { FallbackPane } from './fallback'
import { formatValue } from './format'
const chartTitle = formatValue('Revenue')
export function Page() {
  return <Hydrate when={visible()} fallback={<FallbackPane />}><Chart title={chartTitle} /></Hydrate>
}
`
    const appFiles = {
      'src/fallback.tsx': `export const FallbackPane = () => <p>fallback-marker</p>\n`,
      'src/format.ts': `export const formatValue = (value: string) => value + ' format-marker'\n`,
      'src/chart.tsx': `export const Chart = (props: { title: string }) => <b>{props.title} chart-marker</b>\n`,
      'node_modules/widgets/chart.js': `import { jsx } from 'react/jsx-runtime'
export const Chart = (props) => jsx('b', { children: [props.title, ' chart-marker'] })
`,
      'node_modules/widgets/other.js': `export const Other = () => 'other'
`,
      'node_modules/widgets/index.js': `export { Chart } from './chart.js'
export { Other } from './other.js'
`,
      'entry.ts': `export { Page } from './src/page'\n`,
    }

    // When the parent's own module-level code (`formatValue('Revenue')`)
    // runs is left open: in the eager code or in the lazy chunk, not both.
    // Source: hydrate-split-modules.test.ts "bindings only the split children
    // use leave the parent", "server: bindings only the stripped fallback uses
    // are removed"; hydrate-captures.test.ts "a destructured loop variable…,
    // module helpers move" (placement); gaps "biggest gap 1".
    test.each([
      {
        name: 'a project module',
        chartImport: `import { Chart } from './chart'`,
        widgetsManifest: undefined,
      },
      {
        // The barrel is eager (the page logs `Other`); without the hint, the
        // bundler still finds no side effect in the chart module, so its code
        // stays lazy.
        name: 'a package without side-effect hints',
        chartImport: `import { Chart, Other } from 'widgets'
console.log(Other)`,
        widgetsManifest: { name: 'widgets', type: 'module' },
      },
      {
        name: 'a package marked "sideEffects": false',
        chartImport: `import { Chart, Other } from 'widgets'
console.log(Other)`,
        widgetsManifest: {
          name: 'widgets',
          type: 'module',
          sideEffects: false,
        },
      },
    ])(
      'with the chart from $name, the children load lazily and the server drops the fallback',
      async ({ chartImport, widgetsManifest }) => {
        const build = await buildStart({
          bundler,
          files: {
            ...hydrateRuntimeFiles,
            ...appFiles,
            'src/page.tsx': page(chartImport),
            'node_modules/widgets/package.json': JSON.stringify(
              widgetsManifest ?? { name: 'widgets', type: 'module' },
            ),
          },
        })
        const { client, ssr } = build
        expect({
          chart: client.where('chart-marker'),
          fallback: client.where('fallback-marker'),
          serverFallback: ssr.where('fallback-marker'),
        }).toEqual({
          chart: 'lazy',
          fallback: 'eager',
          serverFallback: 'nowhere',
        })
        expect(['lazy', 'eager']).toContain(client.where('format-marker'))
        const server = await expectHydratesLikeServer(build, 'entry.Page()')
        expect(server.html).toBe('[<b>Revenue format-marker chart-marker</b>]')
      },
      timeout,
    )

    // Each boundary loads only its own children's code.
    test(
      'two boundaries each load their own children lazily',
      async () => {
        const build = await buildStart({
          bundler,
          files: {
            ...hydrateRuntimeFiles,
            'src/chart.tsx': `export const Chart = () => <b>chart-marker</b>\n`,
            'src/table.tsx': `export const Table = () => <i>table-marker</i>\n`,
            'src/page.tsx': `import { Hydrate } from '@tanstack/react-start'
import { idle, visible } from '@tanstack/react-start/hydration'
import { Chart } from './chart'
import { Table } from './table'
export function Page() {
  return <><Hydrate when={visible()}><Chart /></Hydrate><Hydrate when={idle()}><Table /></Hydrate></>
}
`,
            'entry.ts': `export { Page } from './src/page'\n`,
          },
        })
        const { client } = build
        const chart = client.locate('chart-marker')
        const table = client.locate('table-marker')
        expect({ chart: chart.eager, table: table.eager }).toEqual({
          chart: [],
          table: [],
        })
        expect(chart.lazy).toHaveLength(1)
        expect(table.lazy).toHaveLength(1)
        expect(chart.lazy[0]).not.toBe(table.lazy[0])
        const server = await expectHydratesLikeServer(build, 'entry.Page()')
        expect(server.html).toBe('[<b>chart-marker</b>][<i>table-marker</i>]')
      },
      timeout,
    )

    // Module-level code only the children use is in the client once: a
    // helper declaration in the lazy chunk; a destructuring of an import (an
    // initializer, whose timing is left open) in the lazy chunk or the eager
    // code. Either way the children render through their chunk.
    // Source: hydrate-split-modules.test.ts "the children read a
    // module-level destructuring of an import" (placement), "helpers shared
    // by two boundaries"; Qwik optimizer example_invalid_references
    test(
      'module-level code only the children use is not duplicated',
      async () => {
        const build = await buildStart({
          bundler,
          files: {
            ...hydrateRuntimeFiles,
            'src/lib.ts': `export const source = ['lib-marker', { b: 'B' }]\n`,
            'src/page.tsx': `import { Hydrate } from '@tanstack/react-start'
import { source } from './lib'
const [a, { b }] = source
function helper(value: string) {
  return value + ' helper-marker'
}
export function Page() {
  return <Hydrate><p>{helper(a + b)}</p></Hydrate>
}
`,
            'entry.ts': `export { Page } from './src/page'\n`,
          },
        })
        expect(build.client.where('helper-marker')).toBe('lazy')
        expect(['lazy', 'eager']).toContain(build.client.where('lib-marker'))
        const server = await expectHydratesLikeServer(build, 'entry.Page()')
        expect(server.html).toBe('[<p>lib-markerB helper-marker</p>]')
      },
      timeout,
    )

    // A route whose split options (here `component` and `pendingComponent`,
    // each in its own grouping by default) contain boundaries: the client
    // hydrates each boundary with the id the server renders it with, and
    // loads its own children.
    // Source: gap H10 (round2/oracle-gaps)
    test(
      'boundaries in two split route options hydrate like the server renders them',
      async () => {
        const build = await buildStart({
          bundler,
          files: {
            ...hydrateRuntimeFiles,
            'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { Hydrate } from '@tanstack/react-start'
export const Route = createFileRoute('/')({
  pendingComponent: Pending,
  component: Page,
})
function Pending() {
  return <Hydrate><p>pending-marker</p></Hydrate>
}
function Page() {
  return <section><Hydrate><p>page-marker</p></Hydrate></section>
}
`,
            'src/router.ts': `import { routeTree } from './routeTree.gen'
export const getRouter = () => ({ routeTree })
`,
            'entry.ts': `export { getRouter } from './src/router'\n`,
          },
        })
        expect(build.client.where('page-marker')).toBe('lazy')
        expect(build.client.where('pending-marker')).toBe('lazy')
        const server = await expectHydratesLikeServer(
          build,
          `(() => {
  const route = Object.values(entry.getRouter().routeTree.children).find(
    (candidate) => candidate.options.id === '/',
  )
  return [route.options.pendingComponent(), route.options.component()]
})()`,
        )
        expect(server.html).toEqual([
          '[<p>pending-marker</p>]',
          '<section>[<p>page-marker</p>]</section>',
        ])
        expect(new Set(server.ids).size).toBe(2)
      },
      timeout,
    )

    /**
     * Builds a page whose split children render `Widget`, an export no other
     * module imports, declared as `export const Widget = <widget>`.
     * `withName` has a side effect (it counts its calls), so only a purity
     * hint lets the bundler drop a call of it.
     */
    async function buildExportedWidget(widget: string) {
      const { client } = await buildStart({
        bundler,
        files: {
          ...hydrateRuntimeFiles,
          'src/with-name.ts': `export const withName = <T,>(component: T) => {
  ;(globalThis as { named?: number }).named =
    ((globalThis as { named?: number }).named ?? 0) + 1
  return component
}
`,
          'src/page.tsx': `import { Hydrate } from '@tanstack/react-start'
import { withName } from './with-name'
export const Widget = ${widget}
export function Page() {
  return <Hydrate><Widget /></Hydrate>
}
`,
          'entry.ts': `export { Page } from './src/page'\n`,
        },
      })
      return {
        placement: client.where('widget-marker'),
        reported: [...client.warnings, ...client.consoleMessages].filter(
          (message) => /\bWidget\b/.test(message),
        ),
      }
    }

    // An export only the children use, which no other module imports, ends
    // up in the lazy chunk only when the bundler may drop its initializer.
    // Its initializer runs once either way (known-bugs-hydrate.test.ts).
    // Source: hydrate-when-transform.test.ts "unwraps exported declarations
    // needed by extracted virtual modules" (N20).
    test.each([
      { name: 'a function', widget: `() => <p>widget-marker</p>` },
      {
        name: 'a pure call',
        widget: `/* @__PURE__ */ withName(() => <p>widget-marker</p>)`,
      },
    ])(
      'an export only the children use, initialized by $name, loads lazily',
      async ({ widget }) => {
        expect((await buildExportedWidget(widget)).placement).toBe('lazy')
      },
      timeout,
    )

    // Goal (N20): the export is in the client once: in the lazy chunk, or
    // (an initializer with side effects may keep it there) in the eager code,
    // and then the user is told why the children's code is not deferred.
    // Today the export is in both the eager and the lazy chunk, and nothing is
    // reported (both bundlers).
    test.fails(
      'an export only the children use, initialized by a call, loads lazily or is reported',
      async () => {
        const { placement, reported } = await buildExportedWidget(
          `withName(() => <p>widget-marker</p>)`,
        )
        expect(['lazy', 'eager']).toContain(placement)
        if (placement === 'eager') {
          expect(reported).not.toEqual([])
        }
      },
      timeout,
    )
  },
)

describe('Vite dev server', () => {
  const page = (
    text: string,
  ) => `import { Hydrate } from '@tanstack/react-start'
export function Page() {
  return <Hydrate><p>${text}</p></Hydrate>
}
`

  // A browser may request a chunk before its parent module was compiled in
  // this dev session (a reload after a server restart), and an edit of the
  // file must reach its chunks.
  // Source: hydrate-when-transform.test.ts "invalidates cached Hydrate
  // source for virtual module loads" (gaps H21 / DV42; the compiler half is
  // in hydrate-boundary-forms.test.ts)
  test(
    'client: a chunk requested before its parent module renders the children, and an edit reaches it',
    async () => {
      const files = { ...hydrateRuntimeFiles, 'src/page.tsx': page('Old') }
      // The chunk URL the parent module imports, learned from another server.
      const first = await startDevServer({ files })
      const [chunkUrl] = getChunkIds(await first.transform('/src/page.tsx'))
      await first.close()
      expect(chunkUrl).toBeDefined()

      const server = await startDevServer({ files })
      const render = async (url: string) =>
        getChunkComponent(
          await evaluateServed(server, url, {
            // The stand-in packages are served like project modules.
            skip: /^\/@vite\b/,
          }),
        )({})
      expect(await render(chunkUrl!)).toBe('<p>Old</p>')

      await server.edit({ 'src/page.tsx': page('New') })

      // The chunk the edited parent module imports.
      const [editedUrl] = getChunkIds(await server.transform('/src/page.tsx'))
      expect(await render(editedUrl!)).toBe('<p>New</p>')
    },
    timeout,
  )
})

describe('Vite dev server, Solid', () => {
  /** Stand-ins of the Solid packages a Solid `<Hydrate>` module imports. */
  const solidFiles: Record<string, string> = {
    'node_modules/@tanstack/solid-start/package.json': JSON.stringify({
      name: '@tanstack/solid-start',
      type: 'module',
      exports: { '.': './index.js' },
    }),
    'node_modules/@tanstack/solid-start/index.js': `export const Hydrate = (props) => '[' + (props.children ?? '') + ']'
`,
    'node_modules/@tanstack/solid-router/package.json': JSON.stringify({
      name: '@tanstack/solid-router',
      type: 'module',
      exports: { '.': './index.js' },
    }),
    'node_modules/@tanstack/solid-router/index.js': `export function lazyRouteComponent(load, name = 'default') {
  let loaded
  const Lazy = (props) => {
    if (!loaded) throw new Error('lazy component rendered before it loaded')
    return loaded(props)
  }
  Lazy.preload = async () => {
    loaded = (await load())[name]
  }
  globalThis.__solidLazyComponents?.push(Lazy)
  return Lazy
}
`,
    'node_modules/solid-js/package.json': JSON.stringify({
      name: 'solid-js',
      type: 'module',
      exports: {
        './jsx-runtime': './jsx-runtime.js',
        './jsx-dev-runtime': './jsx-runtime.js',
      },
    }),
    'node_modules/solid-js/jsx-runtime.js':
      hydrateRuntimeFiles['node_modules/react/jsx-runtime.js']!,
  }
  const page = (
    text: string,
  ) => `import { Hydrate } from '@tanstack/solid-start'
export function Page() {
  return <Hydrate><section><Hydrate><p>${text}</p></Hydrate></section></Hydrate>
}
`

  // A Solid boundary is served with the Solid packages only (the app has no
  // React package), its chunk renders its nested boundary through the
  // nested chunk, and an edit reaches it.
  // Source: gaps H21/H22 (round2/oracle-gaps)
  test(
    'client: the chunk of a Solid boundary renders, and an edit reaches it',
    async () => {
      const server = await createDevServer({
        dir: path.dirname(fileURLToPath(import.meta.url)),
        prefix: '.start-dev-server-',
        registerCleanup: onTestFinished,
        files: { ...solidFiles, 'src/page.tsx': page('Old') },
        config: { oxc: { jsx: { importSource: 'solid-js' } } },
        plugins: [
          startCompilerPlugin({
            framework: 'solid',
            environments: [
              { name: 'client', type: 'client' },
              { name: 'ssr', type: 'server' },
            ],
            providerEnvName: 'ssr',
          }),
        ],
      })
      const globals = globalThis as { __solidLazyComponents?: Array<any> }
      onTestFinished(() => {
        delete globals.__solidLazyComponents
      })
      /**
       * Renders the chunk the page module imports once the lazy component of
       * its nested boundary has loaded (like the browser before it hydrates
       * the nested boundary).
       */
      const render = async () => {
        const lazy: Array<{ preload: () => Promise<void> }> = []
        globals.__solidLazyComponents = lazy
        const [chunkUrl] = getChunkIds(await server.transform('/src/page.tsx'))
        const chunk = await evaluateServed(server, chunkUrl!, {
          // The stand-in packages are served like project modules.
          skip: /^\/@vite\b/,
        })
        expect(lazy).toHaveLength(1)
        await Promise.all(lazy.map((component) => component.preload()))
        return getChunkComponent(chunk)({})
      }
      expect(await render()).toBe('<section>[<p>Old</p>]</section>')

      await server.edit({ 'src/page.tsx': page('New') })

      expect(await render()).toBe('<section>[<p>New</p>]</section>')
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
export function Page() {
  return <Hydrate><p>${marker}</p></Hydrate>
}
`
      const server = await startRsbuildDevServer({
        files: {
          ...hydrateRuntimeFiles,
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
