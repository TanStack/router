/**
 * RSC CSS delivery (SPEC J7.2–J7.4) through the real transport on Vite dev
 * (`rsc-css-app.ts`): argument shapes of the RSC helpers, a render call in a
 * helper module, undocumented inputs that must not break, look-alikes that
 * must stay untouched (SPEC G15) and forms that are not recognised but must
 * still work. The import forms are in rsc-css-matrix.test.ts, CSS edits in
 * rsc-css-hmr.test.ts.
 */
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  diagnosticsOf,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import {
  BADGE_BACKGROUND,
  CARD_BACKGROUND,
  GLOBAL_COLOR,
  renderableImport,
  rscCssApp,
  streamImport,
  stylesheetsOf,
} from './rsc-css-app'
import type { Row } from './rsc-css-app'

const rows = {
  // A fragment root with children from two components (V4 red-astra/21).
  fragmentRenderable: {
    key: 'fragment-renderable',
    imports: renderableImport,
    body: `return renderServerComponent(<><Card /><Badge /></>)`,
    consumer: 'renderable',
  },
  fragmentComposite: {
    key: 'fragment-composite',
    imports: `import { createCompositeComponent } from '@tanstack/react-start/rsc'\n`,
    body: `return createCompositeComponent(() => <><Card /><Badge /></>)`,
    consumer: 'composite',
  },
  fragmentFlight: {
    key: 'fragment-flight',
    imports: streamImport,
    body: `return flight(renderToReadableStream(<><Card /><Badge /></>))`,
    consumer: 'flight',
  },
  // A render call in a helper module the server function calls, with a
  // global stylesheet (the e2e `rsc-css-helper` shape).
  globalCss: {
    key: 'global-css',
    imports: `import { renderPlain } from '../plain'\n`,
    body: `return renderPlain()`,
    consumer: 'renderable',
  },
  parenthesised: {
    key: 'parenthesised',
    imports: streamImport,
    body: `return flight(renderToReadableStream((<Card />)))`,
    consumer: 'flight',
  },
  asserted: {
    key: 'asserted',
    imports: streamImport,
    body: `return flight(renderToReadableStream(<Card /> as any))`,
    consumer: 'flight',
  },
  identifier: {
    key: 'identifier',
    imports: streamImport,
    body: `const node = <Card />
  return flight(renderToReadableStream(node))`,
    consumer: 'flight',
  },
  spread: {
    key: 'spread',
    imports: streamImport,
    body: `const args = [<Card />] as const
  return flight(renderToReadableStream(...args))`,
    consumer: 'flight',
  },
  ternary: {
    key: 'ternary',
    imports: streamImport,
    body: `const flag = Date.now() > 0
  return flight(renderToReadableStream(flag ? <Card /> : <Badge />))`,
    consumer: 'flight',
  },
  logicalAnd: {
    key: 'logical-and',
    imports: streamImport,
    body: `const flag = Date.now() > 0
  return flight(renderToReadableStream(flag && <Card />))`,
    consumer: 'flight',
  },
  options: {
    key: 'options',
    imports: streamImport,
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
    key: 'plain-model',
    imports: streamImport,
    body: `return flight(renderToReadableStream({ card: <Card /> }))`,
    consumer: 'flight',
  },
  blockComment: {
    key: 'block-comment',
    imports: streamImport,
    body: `return flight(renderToReadableStream(/* the card */ <Card />))`,
    consumer: 'flight',
  },
  lineComment: {
    key: 'line-comment',
    imports: streamImport,
    body: `return flight(renderToReadableStream(
    // the card
    <Card />,
  ))`,
    consumer: 'flight',
  },
  chained: {
    key: 'chained',
    imports: renderableImport,
    body: `return renderServerComponent(<Card />).then((value) => value)`,
    consumer: 'renderable',
  },
  // Look-alikes (SPEC G15): a foreign package's helper of the same name, a
  // local shadowing the import, and a local shadowing the namespace get
  // exactly the user's arguments.
  foreignNamespace: {
    key: 'foreign-namespace',
    imports: `import * as RSC from 'other-rsc'\n`,
    body: `return RSC.renderServerComponent(<Card />)`,
    consumer: 'value',
  },
  shadowed: {
    key: 'shadowed',
    imports: renderableImport,
    body: `const renderServerComponent = (...args: Array<unknown>) => ({ args: args.length })
  return renderServerComponent(<Card />)`,
    consumer: 'value',
  },
  shadowedNamespace: {
    key: 'shadowed-namespace',
    imports: `import * as RSC from '@tanstack/react-start/rsc'\n`,
    body: `const RSC = {
    renderServerComponent: (...args: Array<unknown>) => ({ args: args.length }),
  }
  return RSC.renderServerComponent(<Card />)`,
    consumer: 'value',
  },
  // Not recognised forms (J7.2: variables, wrappers and project re-exports
  // of the helpers): CSS is not required, but the call must still work.
  reexported: {
    key: 'reexported',
    imports: `import { renderThing } from '../render'\n`,
    body: `return renderThing(<Card />)`,
    consumer: 'renderable',
  },
  wrapper: {
    key: 'wrapper',
    imports: `import { wrap } from '../wrap'\n`,
    body: `return wrap(<Card />)`,
    consumer: 'renderable',
  },
  variable: {
    key: 'variable',
    imports: renderableImport,
    body: `const render = renderServerComponent
  return render(<Card />)`,
    consumer: 'renderable',
  },
} satisfies Record<string, Row>

describe('RSC CSS through the real transport (Vite dev)', () => {
  const app = rscCssApp({
    rows: Object.values(rows),
    files: {
      'src/plain.tsx': `import { renderServerComponent } from '@tanstack/react-start/rsc'
import './global.css'
export function renderPlain() {
  return renderServerComponent(<p className="plain" data-testid="plain">MARK_PLAIN</p>)
}
`,
      'src/render.ts': `export { renderServerComponent as renderThing } from '@tanstack/react-start/rsc'\n`,
      'src/wrap.tsx': `import { renderServerComponent } from '@tanstack/react-start/rsc'
export const wrap = (node: React.ReactNode) => renderServerComponent(node)
`,
      'node_modules/other-rsc/package.json': JSON.stringify({
        name: 'other-rsc',
        type: 'module',
        exports: './index.js',
      }),
      'node_modules/other-rsc/index.js': `export const renderServerComponent = (...args) => ({ args: args.length })\n`,
    },
    // The app's own package (a look-alike row), pre-bundled like the rest.
    config: { optimizeDeps: { include: ['other-rsc'] } },
  })

  const cardBackground = (row: Row) =>
    app.style(row, '[data-testid=card]', 'background-color', CARD_BACKGROUND)

  // V4 red-astra/21: a JSX fragment root must get the CSS of every child,
  // like an element root.
  test.each([
    { name: 'renderServerComponent', row: rows.fragmentRenderable },
    { name: 'createCompositeComponent', row: rows.fragmentComposite },
    { name: 'renderToReadableStream', row: rows.fragmentFlight },
  ])('$name with a fragment root styles every child', async ({ row }) => {
    expect({
      card: await cardBackground(row),
      badge: await app.style(
        row,
        '[data-testid=badge]',
        'background-color',
        BADGE_BACKGROUND,
      ),
    }).toEqual({ card: CARD_BACKGROUND, badge: BADGE_BACKGROUND })
  })

  test('a render call in a helper module, with a global stylesheet, styles the server component', async () => {
    expect(
      await app.style(
        rows.globalCss,
        '[data-testid=plain]',
        'color',
        GLOBAL_COLOR,
      ),
    ).toBe(GLOBAL_COLOR)
  })

  test.each([
    { wrapped: '(<Card />)', row: rows.parenthesised },
    { wrapped: '<Card /> as any', row: rows.asserted },
  ])('renderToReadableStream($wrapped) styles the stream', async ({ row }) => {
    expect(await cardBackground(row)).toBe(CARD_BACKGROUND)
    expect(await app.text(row)).toBe('MARK_CARD')
  })

  // Arguments the transform cannot see the JSX of are left as they are:
  // the stream still renders (CSS not required; dev warnings below).
  test.each([
    { name: 'an identifier', row: rows.identifier },
    { name: 'a spread', row: rows.spread },
  ])('renderToReadableStream with $name still renders', async ({ row }) => {
    expect(await app.text(row)).toBe('MARK_CARD')
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
    expect(await cardBackground(row)).toBe(CARD_BACKGROUND)
  })

  // The second `options` argument is undocumented (React Start's public
  // type is `renderToReadableStream(node)`; `options` is typed only under
  // the react-server condition). It must not break: the options reach
  // React's renderer (its `onError` runs and its digest is in the stream).
  // CSS is not required (user ruling 2026-10-18, loosening decision D8 (a)).
  test('renderToReadableStream(<JSX />, options) renders with the options', async () => {
    expect(JSON.parse(await app.text(rows.options))).toEqual({
      digest: 'MARK_DIGEST:MARK_BOOM',
      streamCarriesDigest: true,
    })
  })

  // A plain-data model (`{ card: <Card /> }`) is undocumented too: it must
  // not break, and the model reaches the client. Neither CSS for its
  // elements nor a warning is required, nor their absence (user rulings
  // 2026-10-18).
  test('renderToReadableStream with a plain-data model streams the model', async () => {
    expect(await app.text(rows.plainModel)).toBe('MARK_CARD')
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
    ({ row }) => {
      const server = app.server()
      expectDiagnostic(
        diagnosticsOf(
          server.logs.filter((log) => log.startsWith('warn:')),
          'warning',
        ),
        {
          names: ['renderToReadableStream'],
          file: path.join('src/rows', `${row.key}.tsx`),
          root: server.root,
        },
      )
    },
  )

  test.each([
    { name: 'a foreign namespace', row: rows.foreignNamespace },
    { name: 'a shadowing local', row: rows.shadowed },
    { name: 'a local shadowing the namespace', row: rows.shadowedNamespace },
  ])(
    'a look-alike helper of $name gets exactly the arguments the code passes',
    async ({ row }) => {
      expect(JSON.parse(await app.text(row))).toEqual({ args: 1 })
    },
  )

  test.each([
    { name: 'a project re-export', row: rows.reexported },
    { name: 'a project wrapper', row: rows.wrapper },
    { name: 'a variable', row: rows.variable },
  ])('renderServerComponent through $name still renders', async ({ row }) => {
    expect(await app.text(row)).toBe('MARK_CARD')
  })

  // J4.12, and the control of the rows above: the client never loads a
  // stylesheet of a row's module itself (the handler, and so the render
  // call and the local components, are absent), so a styled section shows
  // the CSS the RSC payload delivered.
  test.each(Object.values(rows))(
    "the client's module of row $key loads no stylesheet",
    async (row) => {
      expect(stylesheetsOf(await app.clientModules(row))).toEqual([])
    },
  )

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
        expect(await app.text(row)).toBe('MARK_CARD')
        expect(await cardBackground(row)).toBe(CARD_BACKGROUND)
      },
    )

    // Bug: a call whose result is immediately member-called
    // (`renderServerComponent(...).then()`) is recorded as the inner call of
    // a method chain and never visited as a candidate itself. The root cause
    // is shared with the other Start factories (e.g. a
    // `createServerOnlyFn(...).bind()`); this is its only pin.
    // Source: start-plugin-core/src/start-compiler/compiler.ts, candidate
    // detection ("inner call in a chain").
    // Impact: the server component renders without its CSS.
    test.fails(
      'renderServerComponent styles the server component when its result is chained',
      async () => {
        expect(await cardBackground(rows.chained)).toBe(CARD_BACKGROUND)
      },
    )
  })
})
