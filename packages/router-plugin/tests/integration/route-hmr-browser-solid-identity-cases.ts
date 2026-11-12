/**
 * Solid route HMR: after an edit the route renders the new code, either the
 * new value itself or the held one solid-refresh patched in place (SPEC
 * J3.2, J3.3), and a component remounts no more than solid-refresh's own
 * patch makes it. Every row opens a real dev server and page, edits and
 * reads what the page shows, whether it reloaded, its errors and, per
 * edit, how many times the route component mounted (`window.__mounts`); a
 * component with a counter is clicked to `count 1` first, and a cell that
 * keeps it ("kept": no mount) asserts the count survived.
 *
 * solid-refresh keeps a component's state only under the file pragma
 * `// @refresh granular`, and only when the component's code and the
 * bindings it reads are unchanged; otherwise it remounts every component of
 * the module it patches. So a mount count of 1 per edit is solid-refresh's
 * patch, and 0 is a component kept with its state.
 *
 * Cells not asserted, with their reason: Vite with `autoCodeSplitting`
 * mounts a split component twice per save (once from solid-refresh's
 * patch, once from the lazy wrapper's swap to the new proxy; pinned below
 * and in oracle/KNOWN-BUGS.md); a rename or removal on Rsbuild with
 * `autoCodeSplitting` stops later hot updates (solid-refresh, upstream:
 * pinned below); a reload (a rename or removal in an unsplit route file:
 * solid-refresh invalidates the module, J3.3; Vite's rule for an import
 * cycle) restarts the counters.
 *
 * One test file per bundler (`route-hmr-browser-solid-identity.test.ts`
 * for Vite, `-rsbuild.test.ts`), each with and without `autoCodeSplitting`.
 */
import { describe, test } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'
import type { TestContext } from 'vitest'
import type { Config } from '../../src/vite'

type Bundler = 'vite' | 'rsbuild'

interface Cell {
  bundler: Bundler
  split: boolean
}

interface Edit {
  files: Record<string, string>
  shows: string
  /** Mounts of the route component during the edit (0: kept, with its count); `undefined`: not asserted. */
  mounts?: (cell: Cell) => number | undefined
  /** The edit may reload the page (then the counters restart). */
  reloads?: (cell: Cell) => boolean
  /**
   * The edit reloads the page after an error the page logged: Vite
   * evaluates an import cycle with a route module again, which throws, then
   * reloads.
   */
  failsThenReloads?: (cell: Cell) => boolean
}

interface Row {
  name: string
  files: Record<string, string>
  ready: string
  /** The route component has a counter (`count <n>`). */
  counter: boolean
  /** Router plugin options besides `autoCodeSplitting`. */
  pluginOptions?: Partial<Config>
  edits: Array<Edit>
  /**
   * A known bug from the edit of this index on, in the cells it names: the
   * row's earlier edits run as a test, every edit as a `.fails` pin
   * (oracle/KNOWN-BUGS.md).
   */
  pinnedFrom?: (cell: Cell) => number | undefined
}

const head = `import { createFileRoute } from '@tanstack/solid-router'\n`
const signal = `import { createSignal } from 'solid-js'\n`

/** Counts a mount of the component `name` (`window.__mounts[name]`). */
const mount = (name: string) =>
  `;((window as any).__mounts ??= {})[${JSON.stringify(name)}] = ((window as any).__mounts[${JSON.stringify(name)}] ?? 0) + 1`

/** A route component body showing `text`, counting its mounts, with a counter. */
const body = (text: string) => `{
  ${mount('page')}
  const [n, setN] = createSignal(0)
  return (
    <div>
      <p>${text}</p>
      <button onClick={() => setN(n() + 1)}>inc</button>
      <p>count {n()}</p>
    </div>
  )
}`

/** The index route: an optional pragma, `decls`, then the route with `options`. */
const route = (decls: string, options: string, pragma = '') =>
  `${pragma}${head}${signal}${decls}\nexport const Route = createFileRoute('/')({ ${options} })\n`

const granular = '// @refresh granular\n'

/** Mounts per cell: unsplit (both bundlers), Vite split, Rsbuild split. */
const mounts =
  (
    unsplit: number | undefined,
    viteSplit: number | undefined,
    rsbuildSplit: number | undefined,
  ) =>
  ({ bundler, split }: Cell) =>
    !split ? unsplit : bundler === 'vite' ? viteSplit : rsbuildSplit

/** Vite, split: the double mount (not asserted, pinned below). */
const twice = undefined

/** A route file in versions 1-3; the edits are versions 2 and 3. */
function versions(
  name: string,
  make: (v: number) => string,
  shows: (v: number) => string,
  edit: Omit<Edit, 'files' | 'shows'> = {},
  counter = true,
): Row {
  return {
    name,
    counter,
    files: { 'routes/index.tsx': make(1) },
    ready: shows(1),
    edits: [2, 3].map((v) => ({
      files: { 'routes/index.tsx': make(v) },
      shows: shows(v),
      ...edit,
    })),
  }
}

const bodyText = (v: number) => `body v${v}`
const dataText = (v: number) => `data v${v}`

/** A component in another module reading the index route's loader data. */
const dataModule = `import { getRouteApi } from '@tanstack/solid-router'
const api = getRouteApi('/')
export function Data() {
  const data = api.useLoaderData()
  return <p>{data()}</p>
}
`

/** A route whose component reads nothing of the route file but `Data`; the loader returns `data v<v>`. */
const pureRoute = (pragma: string) => (v: number) =>
  `${pragma}${head}${signal}import { Data } from '../layouts/data'
function Page() ${body('<Data />')}
export const Route = createFileRoute('/')({ component: Page, loader: () => ${JSON.stringify(dataText(v))} })
`

/** Rsbuild with `autoCodeSplitting`: solid-refresh stops later hot updates after a rename or removal (upstream). */
const afterRenameOnRsbuildSplit = ({ bundler, split }: Cell) =>
  bundler === 'rsbuild' && split ? 1 : undefined

/** A page component module importing the route file, showing its loader data and `body v<v>`. */
const cyclePage = (v: number) =>
  `${signal}import { Route } from '../routes/index'\nexport function Page() ${body(`{Route.useLoaderData()()} body v${v}`)}\n`
const cycleRoute = (v: number) =>
  `${head}import { Page } from '../layouts/page'
export const Route = createFileRoute('/')({ component: Page, loader: () => ${JSON.stringify(dataText(v))} })
`

const shell = (text: string) =>
  `export function Shell() {\n  return <p>${text}</p>\n}\n`

/**
 * The loader shares the component's chunk: the chunk evaluates again, and
 * solid-refresh keeps the component only if the chunk carries the file's
 * pragma.
 */
const granularChunkRow: Row = {
  name: '@refresh granular, an edit of the loader in the component chunk',
  counter: true,
  pluginOptions: {
    codeSplittingOptions: { defaultBehavior: [['component', 'loader']] },
  },
  files: {
    'layouts/data.tsx': dataModule,
    'routes/index.tsx': pureRoute(granular)(1),
  },
  ready: dataText(1),
  edits: [2, 3].map((v) => ({
    files: { 'routes/index.tsx': pureRoute(granular)(v) },
    shows: dataText(v),
    mounts: mounts(0, twice, 0),
  })),
}

export const rows: Array<Row> = [
  versions(
    'a function declaration',
    (v) => route(`function Page() ${body(bodyText(v))}`, 'component: Page'),
    bodyText,
    { mounts: mounts(1, twice, 1) },
  ),
  versions(
    'an inline arrow',
    (v) => route('', `component: () => ${body(bodyText(v))}`),
    bodyText,
    { mounts: mounts(1, twice, 1) },
  ),
  versions(
    'a lowercase function',
    (v) => route(`function page() ${body(bodyText(v))}`, 'component: page'),
    bodyText,
    { mounts: mounts(1, 1, 1) },
  ),
  versions(
    'an edit of the loader alone',
    (v) =>
      route(
        `const label = ${JSON.stringify(dataText(v))}\nfunction Page() ${body('{Route.useLoaderData()()}')}`,
        'component: Page, loader: () => label',
      ),
    dataText,
    { mounts: mounts(1, twice, 0) },
  ),
  {
    // the component and the bindings it reads are unchanged: solid-refresh
    // keeps it, and so does the router
    name: '@refresh granular, an edit of the loader alone, the component reading nothing of the file',
    counter: true,
    files: {
      'layouts/data.tsx': dataModule,
      'routes/index.tsx': pureRoute(granular)(1),
    },
    ready: dataText(1),
    edits: [2, 3].map((v) => ({
      files: { 'routes/index.tsx': pureRoute(granular)(v) },
      shows: dataText(v),
      mounts: mounts(0, twice, 0),
    })),
  },
  granularChunkRow,
  versions(
    '@refresh granular, a body edit',
    (v) =>
      route(
        `function Page() ${body(bodyText(v))}`,
        'component: Page',
        granular,
      ),
    bodyText,
    { mounts: mounts(1, twice, 1) },
  ),
  // Bug: a split chunk evaluated again on its own (Rsbuild: solid-refresh
  // makes it self-accepting) never told the route's lazy wrapper that its
  // `component` export is now another component.
  // Impact: the page went on showing the old branch of the condition
  // (here: until the flag flipped back).
  versions(
    'a conditional behind a const',
    (v) =>
      route(
        `const flag = ${v !== 2}
function Wide() {
  return <p>wide layout v${v}</p>
}
function Narrow() {
  return <p>narrow layout v${v}</p>
}
const Page = flag ? Wide : Narrow`,
        'component: Page',
      ),
    (v) => `${v !== 2 ? 'wide' : 'narrow'} layout v${v}`,
    {},
    false,
  ),
  versions(
    "a factory's result",
    (v) =>
      route(
        `function makePage(options: { title: string }) {
  return function Inner() {
    return <p>{options.title}</p>
  }
}
const Page = makePage({ title: 'title v${v}' })`,
        'component: Page',
      ),
    (v) => `title v${v}`,
    {},
    false,
  ),
  // Bug: the router kept the component it held whenever the compiler saw
  // the same import (`<specifier>#<export>`) and solid-refresh's proxy had
  // the same name, though the barrel now re-exports another module's
  // component, which solid-refresh never patches into the held one.
  // Impact: the page went on showing the old module's component, without
  // a reload or an error, until a reload.
  {
    name: 'a layout through a barrel that switches module, then the new module edited',
    counter: false,
    files: {
      'layouts/classic.tsx': shell('classic shell'),
      'layouts/modern.tsx': shell('modern shell'),
      'layouts/index.ts': `export { Shell } from './classic'\n`,
      'routes/index.tsx': `${head}import { Shell } from '../layouts'
export const Route = createFileRoute('/')({ component: Shell })
`,
    },
    ready: 'classic shell',
    edits: [
      {
        files: { 'layouts/index.ts': `export { Shell } from './modern'\n` },
        shows: 'modern shell',
      },
      {
        files: { 'layouts/modern.tsx': shell('modern shell edited') },
        shows: 'modern shell edited',
      },
    ],
  },
  {
    name: "the route file's import moves to another module, then that module edited",
    counter: false,
    files: {
      'layouts/classic.tsx': shell('classic shell'),
      'layouts/modern.tsx': shell('modern shell'),
      'routes/index.tsx': `${head}import { Shell } from '../layouts/classic'
export const Route = createFileRoute('/')({ component: Shell })
`,
    },
    ready: 'classic shell',
    edits: [
      {
        files: {
          'routes/index.tsx': `${head}import { Shell } from '../layouts/modern'
export const Route = createFileRoute('/')({ component: Shell })
`,
        },
        shows: 'modern shell',
      },
      {
        files: { 'layouts/modern.tsx': shell('modern shell edited') },
        shows: 'modern shell edited',
      },
    ],
  },
  {
    name: 'a component in another module, its body edited',
    counter: true,
    files: {
      'layouts/page.tsx': `${signal}export function Page() ${body(bodyText(1))}\n`,
      'routes/index.tsx': `${head}import { Page } from '../layouts/page'
export const Route = createFileRoute('/')({ component: Page })
`,
    },
    ready: bodyText(1),
    edits: [2, 3].map((v) => ({
      files: {
        'layouts/page.tsx': `${signal}export function Page() ${body(bodyText(v))}\n`,
      },
      shows: bodyText(v),
      mounts: mounts(1, 1, 1),
    })),
  },
  {
    name: 'a component in a module that imports the route file, the loader edited',
    counter: true,
    files: {
      'layouts/page.tsx': cyclePage(1),
      'routes/index.tsx': cycleRoute(1),
    },
    ready: `${dataText(1)} body v1`,
    edits: [2, 3].map((v) => ({
      files: { 'routes/index.tsx': cycleRoute(v) },
      shows: `${dataText(v)} body v1`,
      mounts: mounts(0, 1, 0),
    })),
  },
  {
    // Vite reloads the page for an edit of a module in an import cycle
    // with a route module that is not split
    name: 'the same, then the component body twice, then the loader',
    counter: true,
    files: {
      'layouts/page.tsx': cyclePage(1),
      'routes/index.tsx': cycleRoute(1),
    },
    ready: `${dataText(1)} body v1`,
    edits: [
      {
        files: { 'routes/index.tsx': cycleRoute(2) },
        shows: `${dataText(2)} body v1`,
        mounts: mounts(0, 1, 0),
      },
      ...[2, 3].map(
        (v): Edit => ({
          files: { 'layouts/page.tsx': cyclePage(v) },
          shows: `${dataText(2)} body v${v}`,
          failsThenReloads: ({ bundler, split }) =>
            bundler === 'vite' && !split,
          mounts: mounts(1, undefined, 1),
        }),
      ),
      {
        files: { 'routes/index.tsx': cycleRoute(3) },
        shows: `${dataText(3)} body v3`,
        mounts: mounts(0, 1, 0),
      },
    ],
  },
  {
    // unsplit: solid-refresh invalidates a module that lost a component,
    // which nothing above a route module accepts: the page reloads once
    // (SPEC J3.3)
    name: 'a rename, then two body edits',
    counter: true,
    files: {
      'routes/index.tsx': route(
        `function Page() ${body(bodyText(1))}`,
        'component: Page',
      ),
    },
    ready: bodyText(1),
    edits: [2, 3, 4].map((v) => ({
      files: {
        'routes/index.tsx': route(
          `function Renamed() ${body(bodyText(v))}`,
          'component: Renamed',
        ),
      },
      shows: bodyText(v),
      reloads: ({ split }) => v === 2 && !split,
      mounts: ({ bundler, split }) =>
        v === 2 && bundler === 'rsbuild' && split ? undefined : 1,
    })),
    pinnedFrom: afterRenameOnRsbuildSplit,
  },
  {
    name: 'a helper component removed, then two body edits',
    counter: true,
    files: {
      'routes/index.tsx': route(
        `function Helper() {\n  return <span> helper</span>\n}\nfunction Page() ${body(`${bodyText(1)}<Helper />`)}`,
        'component: Page',
      ),
    },
    ready: `${bodyText(1)} helper`,
    edits: [2, 3, 4].map((v) => ({
      files: {
        'routes/index.tsx': route(
          `function Page() ${body(bodyText(v))}`,
          'component: Page',
        ),
      },
      shows: bodyText(v),
      reloads: ({ split }) => v === 2 && !split,
      mounts: ({ bundler, split }) =>
        !split ? 1 : bundler === 'vite' || v === 2 ? undefined : 1,
    })),
    pinnedFrom: afterRenameOnRsbuildSplit,
  },
]

/**
 * Bug: Vite with `autoCodeSplitting`: a split Solid component mounts twice
 * per save, once from solid-refresh's patch of the chunk and once from the
 * lazy wrapper's swap to the re-imported chunk's new proxy (the router
 * keeps a re-imported chunk's component only when it is the same object:
 * keeping the patched proxy goes stale after a rename, see the upstream
 * pin above).
 * Impact: an effect of the component runs twice per save; under `@refresh
 * granular` its state is lost where solid-refresh keeps it.
 */
export const mountPins: Array<Row & { cells: (cell: Cell) => boolean }> = [
  {
    ...versions(
      'a split component mounts once per save',
      (v) => route(`function Page() ${body(bodyText(v))}`, 'component: Page'),
      bodyText,
      { mounts: () => 1 },
    ),
    cells: ({ bundler, split }) => bundler === 'vite' && split,
  },
  {
    ...granularChunkRow,
    name: '@refresh granular: a split component keeps its state when solid-refresh keeps it',
    edits: granularChunkRow.edits.map((edit) => ({ ...edit, mounts: () => 0 })),
    cells: ({ bundler, split }) => bundler === 'vite' && split,
  },
]

/** The count the page shows (`count <n>`), or `null`. */
async function countOf(page: { text: (selector: string) => Promise<string> }) {
  const m = /count (\d+)/.exec(await page.text('#app'))
  return m ? Number(m[1]) : null
}

export function solidIdentitySuite(bundler: Bundler) {
  describe.concurrent.each([false, true])(
    `${bundler}, solid, autoCodeSplitting: %s`,
    { timeout: 90_000 },
    (split) => {
      const cell: Cell = { bundler, split }
      const run = async (
        row: Row,
        edits: Array<Edit>,
        { expect, onTestFinished }: TestContext,
      ) => {
        const app = await openRouteHmrPage({
          bundler,
          target: 'solid',
          onTestFinished,
          pluginOptions: { ...row.pluginOptions, autoCodeSplitting: split },
          files: row.files,
          ready: row.ready,
        })
        const mounted = () => app.evaluate<number>('window.__mounts?.page ?? 0')
        const toCountOne = async () => {
          if ((await countOf(app.page)) !== 1) {
            await app.click('button')
            await app.page.waitForText('count 1', { selector: '#app' })
          }
        }
        if (row.counter) {
          await toCountOne()
        }
        for (const edit of edits) {
          const before = await mounted()
          const result = await app.edit(edit.files, edit.shows)
          if (edit.failsThenReloads?.(cell)) {
            expect(result.reloaded).toBe(true)
          } else {
            expect(result.errors).toEqual([])
          }
          if (!edit.reloads?.(cell) && !edit.failsThenReloads?.(cell)) {
            expect(result.reloaded).toBe(false)
          }
          const expected = edit.mounts?.(cell)
          if (!result.reloaded && expected !== undefined) {
            expect((await mounted()) - before).toBe(expected)
            if (expected === 0) {
              expect(await countOf(app.page)).toBe(1)
            }
          }
          if (row.counter) {
            await toCountOne()
          }
        }
      }
      const pinnedFrom = (row: Row) => row.pinnedFrom?.(cell)
      test.for(rows)('$name', (row, ctx) =>
        run(row, row.edits.slice(0, pinnedFrom(row)), ctx),
      )
      const pinned = rows.filter((row) => pinnedFrom(row) !== undefined)
      if (pinned.length > 0) {
        // Bug: solid-refresh keeps a removed component's name in the
        // registry it stores in `hot.data`; every later evaluation of the
        // module finds a name the new module lacks and calls
        // `hot.invalidate()`, which on Rspack, outside an update (the lazy
        // wrapper's `import()`), leaves the HMR status at `ready` waiting
        // for an `apply()` nobody calls. Upstream (oracle/KNOWN-BUGS.md).
        // Impact: after a rename or a removed component in a split route on
        // Rsbuild, no later hot update reaches the page until a reload.
        test.for(pinned)('$name: every edit', { fails: true }, (row, ctx) =>
          run(row, row.edits, ctx),
        )
      }
      const pins = mountPins.filter((row) => row.cells(cell))
      if (pins.length > 0) {
        test.for(pins)('$name', { fails: true }, (row, ctx) =>
          run(row, row.edits, ctx),
        )
      }
    },
  )
}
