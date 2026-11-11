/**
 * React route HMR: after an edit the route renders the new component, either
 * the new value itself or the held one React Refresh patched (SPEC J3.2,
 * J3.3); its state survives exactly when React Refresh refreshed it. Every
 * row opens a real dev server and page, edits twice and reads what the page
 * shows, whether it reloaded, its errors and, for a component with a
 * counter (clicked to `count 1` first), the count after each edit.
 *
 * The first rows are components whose family only React Refresh knows: a
 * conditional behind a `const`, a factory's result, an unexported class, a
 * layout through a barrel that switches module. The rest are the state
 * rows: a body edit keeps `count 1`; a hook-signature change and a rename
 * remount once (React Refresh's contract), and the next edit keeps the
 * state again.
 *
 * One test file per bundler (`route-hmr-browser-identity.test.ts` for Vite,
 * `-rsbuild.test.ts`), each with and without `autoCodeSplitting`.
 */
import { describe, test } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'
import { inPlace } from '../route-hmr-edit'
import type { TestContext } from 'vitest'

const head = `import { createFileRoute } from '@tanstack/react-router'
import { useState, memo, Component } from 'react'
`

/** A component body showing `text`, with a counter. */
const body = (text: string, hooks = '') => `{
  const [n, setN] = useState(0)${hooks}
  return (
    <div>
      <p>${text}</p>
      <button onClick={() => setN(n + 1)}>inc</button>
      <p>count {n}</p>
    </div>
  )
}`

/** The index route: `decls`, then the route with `options`. */
const route = (decls: string, options: string) =>
  `${head}${decls}\nexport const Route = createFileRoute('/')({ ${options} })\n`

type Bundler = 'vite' | 'rsbuild'

interface Row {
  name: string
  /** A known bug in the cells it names (a `.fails` pin, oracle/KNOWN-BUGS.md). */
  pinned?: (bundler: Bundler, autoCodeSplitting: boolean) => boolean
  /** The files before the first edit. */
  files: Record<string, string>
  ready: string
  /** Each edit, what it shows and, for a row with a counter, the count after it. */
  edits: Array<{
    files: Record<string, string>
    shows: string
    count?: 0 | 1
  }>
}

/** A route file in versions 1-3; the edits are versions 2 and 3. */
function versions(
  name: string,
  make: (v: number) => string,
  shows: (v: number) => string,
  count?: 0 | 1,
): Row {
  return {
    name,
    files: { 'routes/index.tsx': make(1) },
    ready: shows(1),
    edits: [2, 3].map((v) => ({
      files: { 'routes/index.tsx': make(v) },
      shows: shows(v),
      count,
    })),
  }
}

const bodyText = (v: number) => `body v${v}`

const rows: Array<Row> = [
  // Bug: the runtime kept the component the router held whenever the
  // compiler predicted the same refresh identity (a binding's name, a
  // chunk's marker), though React Refresh had no family to patch it with.
  // Impact: the page went on showing the old code, without a reload or an
  // error (here: until the condition flipped back, or forever).
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
  ),
  versions(
    'an unexported class',
    (v) =>
      route(
        `class Page extends Component {
  render() {
    return <p>class v${v}</p>
  }
}`,
        'component: Page',
      ),
    (v) => `class v${v}`,
  ),
  {
    name: 'a layout through a barrel that switches module',
    files: {
      'layouts/classic.tsx': `export function Shell() {\n  return <p>classic shell</p>\n}\n`,
      'layouts/modern.tsx': `export function Shell() {\n  return <p>modern shell</p>\n}\n`,
      'layouts/index.ts': `export { Shell } from './classic'\n`,
      'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { Shell } from '../layouts'
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
        files: {
          'layouts/modern.tsx': `export function Shell() {\n  return <p>modern shell edited</p>\n}\n`,
        },
        shows: 'modern shell edited',
      },
    ],
  },
  // State rows (controls, and the tripwire of the refresh signals the
  // runtime waits for): React Refresh patches these in place.
  versions(
    'a function declaration',
    (v) => route(`function Page() ${body(bodyText(v))}`, 'component: Page'),
    bodyText,
    1,
  ),
  versions(
    'an inline arrow',
    (v) => route('', `component: () => ${body(bodyText(v))}`),
    bodyText,
    1,
  ),
  versions(
    'memo(Page)',
    (v) =>
      route(`function Page() ${body(bodyText(v))}`, 'component: memo(Page)'),
    bodyText,
    1,
  ),
  // Bug: a cast inside the higher-order call hid the component from the
  // compiler's prediction of what React Refresh registers (split, Vite) and
  // from the hoist that gives an inline value a family (unsplit).
  // Impact: the component remounted on every save, where `memo(Page)` keeps
  // its state.
  // Pinned on Vite unsplit: plugin-react's React Refresh transform (oxc, as
  // react-refresh/babel) registers no family for `memo(Page as any)`, where
  // SWC (Rsbuild) does; the split chunk's export registers it.
  {
    ...versions(
      'memo(Page as any)',
      (v) =>
        route(
          `function Page() ${body(bodyText(v))}`,
          'component: memo(Page as any)',
        ),
      bodyText,
      1,
    ),
    pinned: (bundler, autoCodeSplitting) =>
      bundler === 'vite' && !autoCodeSplitting,
  },
  versions(
    'const Page = memo(function …)',
    (v) =>
      route(
        `const Page = memo(function Inner() ${body(bodyText(v))})`,
        'component: Page',
      ),
    bodyText,
    1,
  ),
  versions(
    'a lowercase function',
    (v) => route(`function page() ${body(bodyText(v))}`, 'component: page'),
    bodyText,
    1,
  ),
  versions(
    'an edit of the loader alone',
    (v) =>
      route(
        `const label = 'data v${v}'\nfunction Page() ${body('{Route.useLoaderData()}')}`,
        'component: Page, loader: () => label',
      ),
    (v) => `data v${v}`,
    1,
  ),
  {
    name: 'a component imported from another module',
    files: {
      'layouts/page.tsx': `import { useState } from 'react'\nexport function Page() ${body(bodyText(1))}\n`,
      'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { Page } from '../layouts/page'
export const Route = createFileRoute('/')({ component: Page })
`,
    },
    ready: bodyText(1),
    edits: [2, 3].map((v) => ({
      files: {
        'layouts/page.tsx': `import { useState } from 'react'\nexport function Page() ${body(bodyText(v))}\n`,
      },
      shows: bodyText(v),
      count: 1,
    })),
  },
  {
    name: 'a hook-signature change',
    files: {
      'routes/index.tsx': route(
        `function Page() ${body(bodyText(1))}`,
        'component: Page',
      ),
    },
    ready: bodyText(1),
    edits: [2, 3].map((v) => ({
      files: {
        'routes/index.tsx': route(
          `function Page() ${body(`body v${v} {m}`, '\n  const [m] = useState(5)')}`,
          'component: Page',
        ),
      },
      shows: `body v${v} 5`,
      count: v === 2 ? 0 : 1,
    })),
  },
  {
    name: 'a rename',
    files: {
      'routes/index.tsx': route(
        `function Page() ${body(bodyText(1))}`,
        'component: Page',
      ),
    },
    ready: bodyText(1),
    edits: [2, 3].map((v) => ({
      files: {
        'routes/index.tsx': route(
          `function Renamed() ${body(bodyText(v))}`,
          'component: Renamed',
        ),
      },
      shows: bodyText(v),
      count: v === 2 ? 0 : 1,
    })),
  },
]

/** The count the page shows (`count <n>`), or `null`. */
async function countOf(page: { text: (selector: string) => Promise<string> }) {
  const text = await page.text('#app')
  const m = /count (\d+)/.exec(text)
  return m ? Number(m[1]) : null
}

export function identitySuite(bundler: Bundler) {
  describe.concurrent.each([false, true])(
    `${bundler}, react, autoCodeSplitting: %s`,
    { timeout: 60_000 },
    (autoCodeSplitting) => {
      const run = async (row: Row, { expect, onTestFinished }: TestContext) => {
        const counter = row.edits.some((e) => e.count !== undefined)
        const app = await openRouteHmrPage({
          bundler,
          onTestFinished,
          pluginOptions: { autoCodeSplitting },
          files: row.files,
          ready: row.ready,
        })
        if (counter) {
          await app.click('button')
          await app.page.waitForText('count 1', { selector: '#app' })
        }
        for (const edit of row.edits) {
          expect(await app.edit(edit.files, edit.shows)).toEqual(inPlace)
          if (edit.count === undefined) {
            continue
          }
          expect(await countOf(app.page)).toBe(edit.count)
          if (edit.count === 0) {
            // remounted: the next edit starts from `count 1` again
            await app.click('button')
            await app.page.waitForText('count 1', { selector: '#app' })
          }
        }
      }
      const pinned = (row: Row) =>
        row.pinned?.(bundler, autoCodeSplitting) === true
      test.for(rows.filter((row) => !pinned(row)))('$name', run)
      test.for(rows.filter(pinned))('$name', { fails: true }, run)
    },
  )
}
