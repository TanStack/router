/**
 * RSC CSS delivery (SPEC J7) through the real transport: a React Start app
 * with RSC enabled on a Vite dev server (`rsc-app.ts`), whose server
 * functions render server components with the RSC helpers, and a real page
 * that shows what the browser makes of the Flight payload. Each row is a
 * route of one shared app; the test reads the page: the server component's
 * content and the computed styles of its CSS module.
 *
 * Mechanism is free (SPEC §5): how the CSS travels (`loadCss`, envelopes,
 * link precedence) is never asserted, only that the component is styled.
 */
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  diagnosticsOf,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import {
  computedStyle,
  devStylesGone,
  openRscPage,
  startRscDevServer,
  waitForHydration,
  waitForStyle,
} from './rsc-app'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'

/** `card.module.css` background. */
const CARD_BACKGROUND = 'rgb(254, 243, 199)'
/** `badge.module.css` background. */
const BADGE_BACKGROUND = 'rgb(224, 242, 254)'
/** `global.css` colour. */
const GLOBAL_COLOR = 'rgb(1, 2, 3)'
/** A background no stylesheet set. */
const NO_BACKGROUND = 'rgba(0, 0, 0, 0)'

/**
 * The stylesheets: two CSS modules (`Card`, `Badge`) and a global one
 * (`Plain`). The components rendering with them are local to the module
 * that calls the RSC helper (`routeFile`, `src/plain.tsx`): Vite's RSC
 * plugin delivers the CSS of an exported component by itself, so only a
 * local component shows what Start's transform does.
 */
const styleFiles = {
  'src/card.module.css': `.card { background: #fef3c7; }\n`,
  'src/badge.module.css': `.badge { background: #e0f2fe; }\n`,
  'src/global.css': `.plain { color: rgb(1, 2, 3); }\n`,
  // A render call in a helper module a server function calls, with a
  // global stylesheet.
  'src/plain.tsx': `import { renderServerComponent } from '@tanstack/react-start/rsc'
import './global.css'
export function renderPlain() {
  return renderServerComponent(<p className="plain" data-testid="plain">MARK_PLAIN</p>)
}
`,
}

/**
 * The local server components a row's module uses (`Card`, `Badge`): only
 * those, as a component nothing uses would stay in the client's module with
 * its stylesheet (every route module loads in the page).
 */
function localComponents(body: string): string {
  return `${
    body.includes('Card')
      ? `import cardStyles from '../card.module.css'
function Card({ children }: { children?: React.ReactNode }) {
  return <div className={cardStyles.card} data-testid="card">MARK_CARD{children}</div>
}
`
      : ''
  }${
    body.includes('Badge')
      ? `import badgeStyles from '../badge.module.css'
function Badge() {
  return <span className={badgeStyles.badge} data-testid="badge">MARK_BADGE</span>
}
`
      : ''
  }`
}

/**
 * How the route's page consumes what its server function returns:
 * `renderable` renders it (`renderServerComponent`); `composite` renders it
 * through `CompositeComponent` with a `children` slot; `flight` decodes the
 * Flight stream the server function answers with
 * (`renderToReadableStream`) in the browser, and renders the decoded tree
 * (or its `card`, for a plain-data model); `value` prints it as JSON.
 */
type Consumer = 'renderable' | 'composite' | 'flight' | 'value'

interface Row {
  /** Route path, e.g. `/named-start-renderable`. */
  path: string
  /** Import declarations of the route module. */
  imports: string
  /** Body of the server function's handler (returns the value). */
  body: string
  consumer: Consumer
}

const pages: Record<Consumer, string> = {
  renderable: `function Page() {
  return <main>{Route.useLoaderData()}</main>
}`,
  composite: `function Page() {
  return (
    <main>
      <CompositeComponent src={Route.useLoaderData()}>
        <em data-testid="slot">MARK_SLOT</em>
      </CompositeComponent>
    </main>
  )
}`,
  flight: `function Page() {
  const [tree, setTree] = useState<unknown>(null)
  useEffect(() => {
    createFromFetch(render()).then(setTree)
  }, [])
  const node =
    tree && typeof tree === 'object' && 'card' in tree ? tree.card : tree
  return <main>{node as React.ReactNode}</main>
}`,
  value: `function Page() {
  return <pre data-testid="value">{JSON.stringify(Route.useLoaderData())}</pre>
}`,
}

const consumerImports: Record<Consumer, string> = {
  renderable: '',
  composite: `import { CompositeComponent } from '@tanstack/react-start/rsc'\n`,
  flight: `import { createFromFetch } from '@tanstack/react-start/rsc'
import { useEffect, useState } from 'react'
`,
  value: '',
}

/** The route module of a row. `flight(stream)` answers with the stream. */
function routeFile(row: Row): string {
  const loader = row.consumer === 'flight' ? '' : `  loader: () => render(),\n`
  return `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
${consumerImports[row.consumer]}${row.imports}${localComponents(row.body)}
const flight = (stream: ReadableStream) =>
  new Response(stream, { headers: { 'Content-Type': 'text/x-component' } })
const render = createServerFn().handler(async () => {
${row.body}
})
export const Route = createFileRoute('${row.path}')({
${loader}  component: Page,
})
${pages[row.consumer]}
`
}

/** `src/routes/<path>.tsx` of each row. */
function routeFiles(rows: Array<Row>): Record<string, string> {
  return Object.fromEntries(
    rows.map((row) => [`src/routes${row.path}.tsx`, routeFile(row)]),
  )
}

const apis = [
  {
    api: 'renderServerComponent',
    consumer: 'renderable' as const,
    call: (callee: string, node: string) => `return ${callee}(${node})`,
  },
  {
    api: 'createCompositeComponent',
    consumer: 'composite' as const,
    call: (callee: string, node: string) =>
      `return ${callee}((props) => <>{${node}}{props.children}</>)`,
  },
  {
    api: 'renderToReadableStream',
    consumer: 'flight' as const,
    call: (callee: string, node: string) => `return flight(${callee}(${node}))`,
  },
]

const importForms = [
  {
    form: 'a named import',
    key: 'named',
    declaration: (api: string, from: string) =>
      `import { ${api} } from '${from}'\n`,
    callee: (api: string) => api,
  },
  {
    form: 'a renamed import',
    key: 'renamed',
    declaration: (api: string, from: string) =>
      `import { ${api} as rsc } from '${from}'\n`,
    callee: () => 'rsc',
  },
  {
    form: 'a namespace import',
    key: 'namespace',
    declaration: (_api: string, from: string) =>
      `import * as RSC from '${from}'\n`,
    callee: (api: string) => `RSC.${api}`,
  },
]

const modules = [
  { from: '@tanstack/react-start/rsc', key: 'start' },
  { from: '@tanstack/react-start-rsc', key: 'rsc' },
]

/** Every API through every import form of both module names. */
const matrix = importForms.flatMap((form) =>
  modules.flatMap(({ from, key }) =>
    apis.map((api) => ({
      ...form,
      ...api,
      from,
      row: {
        path: `/${form.key}-${key}-${api.consumer}`,
        imports: form.declaration(api.api, from),
        body: api.call(form.callee(api.api), '<Card />'),
        consumer: api.consumer,
      } satisfies Row,
    })),
  ),
)

const stream = `import { renderToReadableStream } from '@tanstack/react-start/rsc'\n`
const renderable = `import { renderServerComponent } from '@tanstack/react-start/rsc'\n`

/** The other rows, by name. */
const rows = {
  // A fragment root with children from two modules (V4 red-astra/21).
  fragmentRenderable: {
    path: '/fragment-renderable',
    imports: renderable,
    body: `return renderServerComponent(<><Card /><Badge /></>)`,
    consumer: 'renderable',
  },
  fragmentComposite: {
    path: '/fragment-composite',
    imports: `import { createCompositeComponent } from '@tanstack/react-start/rsc'\n`,
    body: `return createCompositeComponent(() => <><Card /><Badge /></>)`,
    consumer: 'composite',
  },
  fragmentFlight: {
    path: '/fragment-flight',
    imports: stream,
    body: `return flight(renderToReadableStream(<><Card /><Badge /></>))`,
    consumer: 'flight',
  },
  globalCss: {
    path: '/global-css',
    imports: `import { renderPlain } from '../plain'\n`,
    body: `return renderPlain()`,
    consumer: 'renderable',
  },
  parenthesised: {
    path: '/parenthesised',
    imports: stream,
    body: `return flight(renderToReadableStream((<Card />)))`,
    consumer: 'flight',
  },
  asserted: {
    path: '/asserted',
    imports: stream,
    body: `return flight(renderToReadableStream(<Card /> as any))`,
    consumer: 'flight',
  },
  identifier: {
    path: '/identifier',
    imports: stream,
    body: `const node = <Card />
  return flight(renderToReadableStream(node))`,
    consumer: 'flight',
  },
  spread: {
    path: '/spread',
    imports: stream,
    body: `const args = [<Card />] as const
  return flight(renderToReadableStream(...args))`,
    consumer: 'flight',
  },
  ternary: {
    path: '/ternary',
    imports: stream,
    body: `const flag = Date.now() > 0
  return flight(renderToReadableStream(flag ? <Card /> : <Badge />))`,
    consumer: 'flight',
  },
  logicalAnd: {
    path: '/logical-and',
    imports: stream,
    body: `const flag = Date.now() > 0
  return flight(renderToReadableStream(flag && <Card />))`,
    consumer: 'flight',
  },
  options: {
    path: '/options',
    imports: stream,
    body: `function Boom(): never {
    throw new Error('MARK_BOOM')
  }
  let digest = ''
  const stream = renderToReadableStream(<Boom />, {
    onError: (error: Error) => {
      digest = 'MARK_DIGEST:' + error.message
      return digest
    },
  })
  const text = await new Response(stream).text()
  return { digest, streamCarriesDigest: text.includes('MARK_DIGEST') }`,
    consumer: 'value',
  },
  plainModel: {
    path: '/plain-model',
    imports: stream,
    body: `return flight(renderToReadableStream({ card: <Card /> }))`,
    consumer: 'flight',
  },
  blockComment: {
    path: '/block-comment',
    imports: stream,
    body: `return flight(renderToReadableStream(/* the card */ <Card />))`,
    consumer: 'flight',
  },
  lineComment: {
    path: '/line-comment',
    imports: stream,
    body: `return flight(renderToReadableStream(
    // the card
    <Card />,
  ))`,
    consumer: 'flight',
  },
  chained: {
    path: '/chained',
    imports: renderable,
    body: `return renderServerComponent(<Card />).then((value) => value)`,
    consumer: 'renderable',
  },
  // Look-alikes (SPEC G15): a foreign package's helper of the same name,
  // and a local shadowing the import, get exactly the user's arguments.
  foreignNamespace: {
    path: '/foreign-namespace',
    imports: `import * as RSC from 'other-rsc'\n`,
    body: `return RSC.renderServerComponent(<Card />)`,
    consumer: 'value',
  },
  shadowed: {
    path: '/shadowed',
    imports: renderable,
    body: `const renderServerComponent = (...args: Array<unknown>) => ({ args: args.length })
  return renderServerComponent(<Card />)`,
    consumer: 'value',
  },
  // A project re-export of the helper: not a recognised form (J7.2), the
  // call must still work.
  reexported: {
    path: '/reexported',
    imports: `import { renderThing } from '../render'\n`,
    body: `return renderThing(<Card />)`,
    consumer: 'renderable',
  },
} satisfies Record<string, Row>

const appFiles = {
  ...styleFiles,
  'src/render.ts': `export { renderServerComponent as renderThing } from '@tanstack/react-start/rsc'\n`,
  'node_modules/other-rsc/package.json': JSON.stringify({
    name: 'other-rsc',
    type: 'module',
    exports: './index.js',
  }),
  'node_modules/other-rsc/index.js': `export const renderServerComponent = (...args) => ({ args: args.length })\n`,
  ...routeFiles([...matrix.map(({ row }) => row), ...Object.values(rows)]),
}

describe('RSC CSS through the real transport (Vite dev)', () => {
  let server: DevServer
  const cleanups: Array<() => Promise<void>> = []
  const registerCleanup = (cleanup: () => Promise<void>) => {
    cleanups.push(cleanup)
  }

  beforeAll(async () => {
    server = await startRscDevServer({
      browser: true,
      registerCleanup,
      files: appFiles,
      // The app's own package (a look-alike row), pre-bundled like the rest.
      config: { optimizeDeps: { include: ['other-rsc'] } },
    })
  })
  afterAll(async () => {
    for (const cleanup of cleanups.reverse()) {
      await cleanup()
    }
  })

  /**
   * Opens a row's page (a fresh page per row: a tab that navigated through
   * dozens of unbundled dev pages runs out of request resources) and waits
   * for its server component's content, for hydration, and for the removal
   * of Start's development stylesheet.
   */
  async function show(row: Row, content = 'MARK_CARD'): Promise<BrowserPage> {
    const page = await openRscPage(server, row.path)
    await page.waitForText(content)
    await waitForHydration(page)
    await devStylesGone(page)
    return page
  }

  /** The background of `selector`, once it is `expected` (a stylesheet loads asynchronously). */
  const background = async (
    page: BrowserPage,
    selector: string,
    expected: string,
  ) => {
    await waitForStyle(page, selector, 'background-color', expected, 3_000)
    return computedStyle(page, selector, 'background-color')
  }

  test.each(matrix)(
    '$api through $form of $from styles the server component',
    async ({ row, consumer }) => {
      const page = await show(row)
      expect(
        await background(page, '[data-testid=card]', CARD_BACKGROUND),
      ).toBe(CARD_BACKGROUND)
      if (consumer === 'composite') {
        // The slot the page fills renders after the server component
        // (J7.4: injection changes nothing else).
        expect(await page.text('main')).toBe('MARK_CARDMARK_SLOT')
      }
    },
  )

  // V4 red-astra/21: a JSX fragment root must get the CSS of every child's
  // module, like an element root.
  test.each([
    { name: 'renderServerComponent', row: rows.fragmentRenderable },
    { name: 'createCompositeComponent', row: rows.fragmentComposite },
    { name: 'renderToReadableStream', row: rows.fragmentFlight },
  ])('$name with a fragment root styles every child', async ({ row }) => {
    const page = await show(row, 'MARK_BADGE')
    expect({
      card: await background(page, '[data-testid=card]', CARD_BACKGROUND),
      badge: await background(page, '[data-testid=badge]', BADGE_BACKGROUND),
    }).toEqual({ card: CARD_BACKGROUND, badge: BADGE_BACKGROUND })
  })

  test('a render call in a helper module, with a global stylesheet, styles the server component', async () => {
    const page = await show(rows.globalCss, 'MARK_PLAIN')
    await waitForStyle(
      page,
      '[data-testid=plain]',
      'color',
      GLOBAL_COLOR,
      3_000,
    )
  })

  test.each([
    { wrapped: '(<Card />)', row: rows.parenthesised },
    { wrapped: '<Card /> as any', row: rows.asserted },
  ])('renderToReadableStream($wrapped) styles the stream', async ({ row }) => {
    const page = await show(row)
    expect(await background(page, '[data-testid=card]', CARD_BACKGROUND)).toBe(
      CARD_BACKGROUND,
    )
  })

  // Arguments the transform cannot see the JSX of are left as they are:
  // the stream still renders (CSS not required; dev warnings below).
  test.each([
    { name: 'an identifier', row: rows.identifier },
    { name: 'a spread', row: rows.spread },
  ])('renderToReadableStream with $name still renders', async ({ row }) => {
    await show(row)
  })

  // Bug: the transform only wraps an argument that is JSX itself, not a
  // conditional or logical expression whose branches are all JSX, which is
  // as safe to wrap.
  // Impact: a stream of a conditionally chosen element has no CSS, so its
  // styles never arrive.
  // Source: decision D8 (b).
  test.fails.each([
    { argument: 'flag ? <Card /> : <Badge />', row: rows.ternary },
    { argument: 'flag && <Card />', row: rows.logicalAnd },
  ])('renderToReadableStream($argument) styles the stream', async ({ row }) => {
    const page = await show(row)
    expect(await background(page, '[data-testid=card]', CARD_BACKGROUND)).toBe(
      CARD_BACKGROUND,
    )
  })

  // The second `options` argument is undocumented (React Start's public
  // type is `renderToReadableStream(node)`; `options` is typed only under
  // the react-server condition). It must not break: the options reach
  // React's renderer (its `onError` runs and its digest is in the stream).
  // CSS is not required (user ruling 2026-10-18, loosening decision D8 (a)).
  test('renderToReadableStream(<JSX />, options) renders with the options', async () => {
    const page = await show(rows.options, 'MARK_DIGEST')
    expect(JSON.parse(await page.text('[data-testid=value]'))).toEqual({
      digest: 'MARK_DIGEST:MARK_BOOM',
      streamCarriesDigest: true,
    })
  })

  // A plain-data model (`{ card: <Card /> }`) is undocumented too: it must
  // not break, and the model reaches the client. Neither CSS for its
  // elements nor a warning is required, nor their absence (user rulings
  // 2026-10-18).
  test('renderToReadableStream with a plain-data model streams the model', async () => {
    await show(rows.plainModel)
  })

  // Bug: the transform silently skips a `renderToReadableStream` argument it
  // cannot see the JSX of (a variable, a spread).
  // Impact: the stream has no CSS, so its styles never arrive, and nothing
  // tells the developer.
  // Source: decision D8 (c): warn in dev only.
  test.fails.each([
    { name: 'an identifier', row: rows.identifier },
    { name: 'a spread', row: rows.spread },
  ])(
    'dev: renderToReadableStream with $name warns, naming the file',
    async ({ row }) => {
      await show(row)
      expectDiagnostic(
        diagnosticsOf(
          server.logs.filter((log) => log.startsWith('warn:')),
          'warning',
        ),
        {
          names: ['renderToReadableStream'],
          file: path.join('src/routes', `${row.path}.tsx`),
          root: server.root,
        },
      )
    },
  )

  test.each([
    { name: 'a foreign namespace', row: rows.foreignNamespace },
    { name: 'a shadowing local', row: rows.shadowed },
  ])(
    'a look-alike helper of $name gets exactly the arguments the code passes',
    async ({ row }) => {
      const page = await show(row, '"args"')
      expect(JSON.parse(await page.text('[data-testid=value]'))).toEqual({
        args: 1,
      })
    },
  )

  test('a project re-export of the helper still renders', async () => {
    await show(rows.reexported)
  })

  // J4.12, and the control of every row above: the client never loads a
  // stylesheet of a row's module itself (the handler, and so the render call
  // and the local components, are absent), so a styled page shows the CSS
  // the RSC payload delivered.
  test("the client's route modules load no stylesheet", async () => {
    const stylesheets: Record<string, Array<string>> = {}
    for (const row of [
      ...matrix.map(({ row }) => row),
      ...Object.values(rows),
    ]) {
      const served = Object.keys(
        await server.load(`/src/routes${row.path}.tsx`, {
          environment: 'client',
          skip: /\/node_modules\/|^\/@(vite|react-refresh|fs|id)\b/,
        }),
      )
      stylesheets[row.path] = served.filter((url) =>
        /\.css\b|\/src\/plain/.test(url),
      )
    }
    expect(stylesheets).toEqual(
      Object.fromEntries(Object.keys(stylesheets).map((path) => [path, []])),
    )
  })

  describe('known bugs', () => {
    // Bug: a comment before the JSX argument of `renderToReadableStream` is
    // moved into the generated CSS fragment, where it becomes JSX text.
    // Impact: the comment is rendered into the RSC payload as visible text.
    test.fails.each([
      { name: 'a block comment', row: rows.blockComment },
      { name: 'a line comment', row: rows.lineComment },
    ])(
      'renderToReadableStream does not render $name before the JSX argument',
      async ({ row }) => {
        const page = await show(row)
        expect(await page.text('main')).toBe('MARK_CARD')
        expect(
          await background(page, '[data-testid=card]', CARD_BACKGROUND),
        ).toBe(CARD_BACKGROUND)
      },
    )

    // Bug: a call whose result is immediately member-called
    // (`renderServerComponent(...).then()`) is recorded as the inner call of
    // a method chain and never visited as a candidate itself. Same root
    // cause as the `createServerOnlyFn(...).bind()` pin in
    // start-plugin-core/tests/known-bugs-start-compiler.test.ts.
    // Impact: the server component renders without its CSS.
    test.fails(
      'renderServerComponent styles the server component when its result is chained',
      async () => {
        const page = await show(rows.chained)
        expect(
          await background(page, '[data-testid=card]', CARD_BACKGROUND),
        ).toBe(CARD_BACKGROUND)
      },
    )
  })
})

describe('RSC CSS hot updates (SPEC J7.5, Vite dev)', () => {
  const card = (
    css: boolean,
  ) => `${css ? `import styles from './card.module.css'\n` : ''}
export function Card() {
  return <div className={${css ? 'styles.card' : '"card"'}} data-testid="card">MARK_CARD</div>
}
`
  const route = `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { Card } from '../card'
const render = createServerFn().handler(() => renderServerComponent(<Card />))
export const Route = createFileRoute('/')({
  loader: () => render(),
  component: () => <main>{Route.useLoaderData()}</main>,
})
`
  const styles = (background: string) =>
    `.card { background: ${background}; }\n`

  test("editing a server component's CSS updates the page without a full reload", async () => {
    const server = await startRscDevServer({
      browser: true,
      files: {
        'src/card.module.css': styles('#fef3c7'),
        'src/card.tsx': card(true),
        'src/routes/index.tsx': route,
      },
    })
    const page = await openRscPage(server, '/')
    await page.waitForText('MARK_CARD')
    const background = (expected: string) =>
      waitForStyle(page, '[data-testid=card]', 'background-color', expected)
    await background(CARD_BACKGROUND)

    await waitForHydration(page)

    // A new value
    await server.write({ 'src/card.module.css': styles('#e0f2fe') })
    await background(BADGE_BACKGROUND)

    // Twice in a row: the last edit wins, nothing stale stays effective
    await server.write({ 'src/card.module.css': styles('#fef3c7') })
    await server.write({ 'src/card.module.css': styles('rgb(1, 2, 3)') })
    await background(GLOBAL_COLOR)

    // The rule removed
    await server.write({ 'src/card.module.css': `.other { color: red; }\n` })
    await background(NO_BACKGROUND)

    // The rule back, then the import removed
    await server.write({ 'src/card.module.css': styles('#fef3c7') })
    await background(CARD_BACKGROUND)
    await server.write({ 'src/card.tsx': card(false) })
    await background(NO_BACKGROUND)

    expect(page.loads()).toBe(1)
    expect(page.errors).toEqual([])
  })
})
