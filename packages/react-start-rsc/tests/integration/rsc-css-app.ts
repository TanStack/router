/**
 * The RSC CSS suites (SPEC J7) on a Vite dev server (`rsc-app.ts`): a React
 * Start app whose page shows one section per row. Each row is a module
 * (`src/rows/<key>.tsx`) with a server function that renders a server
 * component with an RSC helper; the page's loader calls the server
 * functions of the rows the page renders, and the page decodes the Flight
 * stream of the `renderToReadableStream` rows in the browser. A test reads
 * its row's section: the server component's content and the computed styles
 * of its CSS.
 *
 * Rows do not affect each other: each has its own CSS module (scoped class
 * names of its own, so a stylesheet one row receives does not style
 * another's component), its own error boundary, and its loader result is
 * settled on its own (a server function that throws shows in its section
 * only).
 *
 * Mechanism is free (SPEC §5): how the CSS travels (`loadCss`, envelopes,
 * link precedence) is never asserted, only that the component is styled.
 */
import { afterAll, beforeAll } from 'vitest'
import {
  computedStyle,
  devStylesGone,
  openRscPage,
  settledValue,
  startRscDevServer,
  waitForHydration,
} from './rsc-app'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'

/** A row's `Card` background (its CSS module). */
export const CARD_BACKGROUND = 'rgb(254, 243, 199)'
/** A row's `Badge` background (its CSS module). */
export const BADGE_BACKGROUND = 'rgb(224, 242, 254)'
/** `src/global.css` colour (`.plain`). */
export const GLOBAL_COLOR = 'rgb(1, 2, 3)'
/** A background no stylesheet set. */
export const NO_BACKGROUND = 'rgba(0, 0, 0, 0)'

/**
 * How the page consumes what the row's server function returns:
 * `renderable` renders it (`renderServerComponent`); `composite` renders it
 * through `CompositeComponent` with a `children` slot; `flight` decodes the
 * Flight stream the server function answers with
 * (`renderToReadableStream`) in the browser, and renders the decoded tree
 * (or its `card`, for a plain-data model); `value` prints it as JSON.
 */
export type Consumer = 'renderable' | 'composite' | 'flight' | 'value'

export interface Row {
  /** Module name (`src/rows/<key>.tsx`) and section of the row. */
  key: string
  /** Import declarations of the row's module. */
  imports: string
  /** Body of the server function's handler (returns the value). */
  body: string
  consumer: Consumer
}

/**
 * The local server components a row's module uses (`Card`, `Badge`), with
 * the row's own CSS module. Only those: a component nothing uses would stay
 * in the client's module with its stylesheet. Local, not exported: Vite's
 * RSC plugin delivers the CSS of an exported component by itself, so only a
 * local component shows what Start's transform does.
 */
function localComponents(row: Row): string {
  const card = row.body.includes('Card')
  const badge = row.body.includes('Badge')
  if (!card && !badge) {
    return ''
  }
  return `import styles from './${row.key}.module.css'
${
  card
    ? `function Card({ children }: { children?: React.ReactNode }) {
  return <div className={styles.card} data-testid="card">MARK_CARD{children}</div>
}
`
    : ''
}${
    badge
      ? `function Badge() {
  return <span className={styles.badge} data-testid="badge">MARK_BADGE</span>
}
`
      : ''
  }`
}

/** The module of a row: `render`, its server function. */
function rowModule(row: Row): string {
  return `import { createServerFn } from '@tanstack/react-start'
${row.imports}${localComponents(row)}
const flight = (stream: ReadableStream) =>
  new Response(stream, { headers: { 'Content-Type': 'text/x-component' } })
export const render = createServerFn().handler(async () => {
${row.body}
})
`
}

/** The section of a row in the page. */
function section(row: Row, index: number): string {
  const result = `data.r${index}`
  const content = {
    renderable: `<Settled result={${result}}>{(value) => value}</Settled>`,
    composite: `<Settled result={${result}}>{(value) => (
          <CompositeComponent src={value}>
            <em data-testid="slot">MARK_SLOT</em>
          </CompositeComponent>
        )}</Settled>`,
    flight: `<Flight render={render${index}} />`,
    value: `<Settled result={${result}}>{(value) => <pre data-testid="value">{JSON.stringify(value)}</pre>}</Settled>`,
  }[row.consumer]
  return `      <section data-row="${row.key}">
        <Boundary><Suspense fallback={null}>${content}</Suspense></Boundary>
      </section>`
}

/**
 * The page (`/`): the loader calls the server function of every row but
 * the `flight` ones (which the page calls from the browser), each result
 * settled on its own.
 */
function pageRoute(rows: Array<Row>): string {
  const loaded = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.consumer !== 'flight')
  return `import { createFileRoute } from '@tanstack/react-router'
import { CompositeComponent, createFromFetch } from '@tanstack/react-start/rsc'
import { Component, Suspense, useEffect, useState } from 'react'
${rows.map((row, index) => `import { render as render${index} } from '../rows/${row.key}'`).join('\n')}

type Result = { value: any } | { error: string }
const settle = (promise: Promise<unknown>): Promise<Result> =>
  promise.then(
    (value) => ({ value }),
    (error) => ({ error: String(error) }),
  )

export const Route = createFileRoute('/')({
  loader: async () => {
    const [${loaded.map(({ index }) => `r${index}`).join(', ')}] = await Promise.all([
${loaded.map(({ index }) => `      settle(render${index}()),`).join('\n')}
    ])
    return { ${loaded.map(({ index }) => `r${index}`).join(', ')} }
  },
  component: Page,
})

function Failed({ error }: { error: string }) {
  return <p data-testid="error">ERROR {error}</p>
}

class Boundary extends Component<{ children: React.ReactNode }, { error?: string }> {
  state: { error?: string } = {}
  static getDerivedStateFromError(error: unknown) {
    return { error: String(error) }
  }
  render() {
    return this.state.error ? <Failed error={this.state.error} /> : this.props.children
  }
}

function Settled({ result, children }: { result: Result; children: (value: any) => React.ReactNode }) {
  return 'error' in result ? <Failed error={result.error} /> : <>{children(result.value)}</>
}

// One call per row, however often React mounts its section.
const decoded = new Map<unknown, Promise<unknown>>()
function Flight({ render }: { render: () => Promise<Response> }) {
  const [tree, setTree] = useState<unknown>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let tree = decoded.get(render)
    if (!tree) {
      tree = createFromFetch(render())
      decoded.set(render, tree)
    }
    tree.then(setTree, (reason) => setError(String(reason)))
  }, [])
  if (error) {
    return <Failed error={error} />
  }
  const node =
    tree && typeof tree === 'object' && 'card' in tree ? tree.card : tree
  return <>{node as React.ReactNode}</>
}

function Page() {
  const data = Route.useLoaderData()
  return (
    <main>
${rows.map(section).join('\n')}
    </main>
  )
}
`
}

/** Import of `renderToReadableStream` (named, `@tanstack/react-start/rsc`). */
export const streamImport = `import { renderToReadableStream } from '@tanstack/react-start/rsc'\n`
/** Import of `renderServerComponent` (named, `@tanstack/react-start/rsc`). */
export const renderableImport = `import { renderServerComponent } from '@tanstack/react-start/rsc'\n`

export interface RscCssApp {
  /** The shared dev server. */
  server: () => DevServer
  /** The page, once every section shows something and the page hydrated. */
  page: () => BrowserPage
  /** The text of a row's section. */
  text: (row: Row) => Promise<string>
  /**
   * The computed `property` of `selector` in a row's section once it is
   * `expected`, or once the page's network has settled without it (a
   * stylesheet loads asynchronously; a page whose requests are all done has
   * every stylesheet it will get). `missing` if the section has no such
   * element.
   */
  style: (
    row: Row,
    selector: string,
    property: string,
    expected: string,
  ) => Promise<string>
  /**
   * The URLs of the client environment's module of a row and of what it
   * imports, outside `node_modules` and Vite's own modules.
   */
  clientModules: (row: Row) => Promise<Array<string>>
}

/**
 * In `beforeAll`: starts the dev server of an app with the page of `rows`
 * (and `files`) and opens the page; stops both in `afterAll`.
 */
export function rscCssApp(options: {
  rows: Array<Row>
  files?: Record<string, string>
  config?: Record<string, unknown>
}): RscCssApp {
  let server: DevServer | undefined
  let page: BrowserPage | undefined
  const cleanups: Array<() => Promise<void>> = []
  const registerCleanup = (cleanup: () => Promise<void>) => {
    cleanups.push(cleanup)
  }

  beforeAll(async () => {
    server = await startRscDevServer({
      browser: true,
      registerCleanup,
      files: {
        'src/global.css': `.plain { color: rgb(1, 2, 3); }\n`,
        ...options.files,
        ...Object.fromEntries(
          options.rows.flatMap((row) => [
            [`src/rows/${row.key}.tsx`, rowModule(row)],
            [
              `src/rows/${row.key}.module.css`,
              // The row in the content: Vite's scoped class names hash the
              // stylesheet's content, not its path.
              `/* ${row.key} */\n.card { background: #fef3c7; }\n.badge { background: #e0f2fe; }\n`,
            ],
          ]),
        ),
        'src/routes/index.tsx': pageRoute(options.rows),
      },
      config: options.config,
    })
    page = await openRscPage(server, '/', { registerCleanup })
    await page.page.waitForFunction(
      () =>
        [...document.querySelectorAll('section[data-row]')].every(
          (element) => element.textContent !== '',
        ),
      undefined,
      { timeout: 30_000 },
    )
    await waitForHydration(page)
    await devStylesGone(page)
  })
  afterAll(async () => {
    for (const cleanup of cleanups.reverse()) {
      await cleanup()
    }
  })

  const started = <T>(value: T | undefined): T => {
    if (!value) {
      throw new Error('the app did not start')
    }
    return value
  }
  const inRow = (row: Row, selector = '') =>
    `section[data-row="${row.key}"] ${selector}`.trim()

  return {
    server: () => started(server),
    page: () => started(page),
    text: async (row) =>
      (await started(page).page.locator(inRow(row)).textContent()) ?? '',
    style: async (row, selector, property, expected) => {
      const current = started(page)
      return settledValue(
        current,
        async () =>
          (await current.page.locator(inRow(row, selector)).count()) === 0
            ? 'missing'
            : computedStyle(current, inRow(row, selector), property),
        (value) => value === expected,
      )
    },
    clientModules: async (row) =>
      Object.keys(
        await started(server).load(`/src/rows/${row.key}.tsx`, {
          environment: 'client',
          skip: /\/node_modules\/|^\/@(vite|react-refresh|fs|id)\b/,
        }),
      ),
  }
}

/** The client module URLs that are stylesheets or `src/plain`. */
export function stylesheetsOf(urls: Array<string>): Array<string> {
  return urls.filter((url) => /\.css\b|\/src\/plain/.test(url))
}
