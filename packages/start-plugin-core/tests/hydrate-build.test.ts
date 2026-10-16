/**
 * `<Hydrate>` in real Vite builds and on a Vite dev server, with the Start
 * compiler's Vite plugin: where the children's code ends up is the
 * bundler's decision (with the side-effect hints of the app), so it is
 * asserted on build output. Only the Vite integration has a Start build
 * harness.
 */
import { describe, expect, test } from 'vitest'
import { evaluateServed } from '@tanstack/compiler-test-utils/dev-server'
import { buildStart, startRuntimeFiles } from './build-harness'
import { startDevServer } from './dev-server'
import { startRsbuildDevServer } from './rsbuild-dev-server'
import { getChunkComponent, getChunkIds } from './regression-helpers'

const timeout = 60_000

const startIndex = 'node_modules/@tanstack/react-start/index.js'
const startManifest = JSON.parse(
  startRuntimeFiles['node_modules/@tanstack/react-start/package.json']!,
)

/**
 * Stand-ins of the packages a `<Hydrate>` module imports: React's JSX
 * runtimes render intrinsic elements as tags, `Hydrate` renders its children
 * between brackets, and `lazyRouteComponent` renders the component it loaded
 * (after `preload()`).
 */
const hydrateRuntimeFiles: Record<string, string> = {
  'node_modules/@tanstack/react-start/package.json': JSON.stringify({
    ...startManifest,
    exports: { ...startManifest.exports, './hydration': './hydration.js' },
  }),
  [startIndex]: `${startRuntimeFiles[startIndex]}
export const Hydrate = (props) => '[' + (props.children ?? '') + ']'
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
  'node_modules/@tanstack/react-router/index.js': `export function lazyRouteComponent(load, name = 'default') {
  let loaded
  const Lazy = (props) => {
    if (!loaded) throw new Error('lazy component rendered before it loaded')
    return loaded(props)
  }
  Lazy.preload = async () => {
    loaded = (await load())[name]
  }
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

describe('Vite build: the code of the children', () => {
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
      widgetsManifest: { name: 'widgets', type: 'module', sideEffects: false },
    },
  ])(
    'with the chart from $name, the children load lazily and the server drops the fallback',
    async ({ chartImport, widgetsManifest }) => {
      const { client, ssr } = await buildStart({
        files: {
          ...hydrateRuntimeFiles,
          ...appFiles,
          'src/page.tsx': page(chartImport),
          'node_modules/widgets/package.json': JSON.stringify(
            widgetsManifest ?? { name: 'widgets', type: 'module' },
          ),
        },
      })
      expect({
        chart: client.where('chart-marker'),
        format: client.where('format-marker'),
        fallback: client.where('fallback-marker'),
        serverFallback: ssr.where('fallback-marker'),
      }).toEqual({
        chart: 'lazy',
        format: 'lazy',
        fallback: 'eager',
        serverFallback: 'nowhere',
      })
      expect((await ssr.run(`return entry.Page()`)).result).toBe(
        '[<b>Revenue format-marker chart-marker</b>]',
      )
    },
    timeout,
  )

  // Each boundary loads only its own children's code.
  test(
    'two boundaries each load their own children lazily',
    async () => {
      const { client, ssr } = await buildStart({
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
      const chart = client.locate('chart-marker')
      const table = client.locate('table-marker')
      expect({ chart: chart.eager, table: table.eager }).toEqual({
        chart: [],
        table: [],
      })
      expect(chart.lazy).toHaveLength(1)
      expect(table.lazy).toHaveLength(1)
      expect(chart.lazy[0]).not.toBe(table.lazy[0])
      expect((await ssr.run(`return entry.Page()`)).result).toBe(
        '[<b>chart-marker</b>][<i>table-marker</i>]',
      )
    },
    timeout,
  )

  /**
   * Builds a page whose split children render `Widget`, an export no other
   * module imports, declared as `export const Widget = <widget>`.
   */
  async function buildExportedWidget(widget: string) {
    const { client } = await buildStart({
      files: {
        ...hydrateRuntimeFiles,
        'src/with-name.ts': `export const withName = <T,>(component: T) => component\n`,
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

  // Goal (N20): an initializer with possible side effects keeps the export
  // in the eager code; the user is told why the children's code is not
  // deferred. Today the export is in both the eager and the lazy chunk, and
  // nothing is reported.
  test.fails(
    'an export only the children use, initialized by a call, loads lazily or is reported',
    async () => {
      const { placement, reported } = await buildExportedWidget(
        `withName(() => <p>widget-marker</p>)`,
      )
      if (placement !== 'lazy') {
        expect(reported, `Widget placement: ${placement}`).not.toEqual([])
      }
    },
    timeout,
  )
})

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
