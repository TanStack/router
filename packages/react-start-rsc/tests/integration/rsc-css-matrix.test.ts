/**
 * RSC CSS delivery (SPEC J7.2, J7.3) through the real transport on Vite
 * dev (`rsc-css-app.ts`): every RSC helper through every import form
 * (named, renamed, namespace) of both module names styles the server
 * component it renders.
 */
import { describe, expect, test } from 'vitest'
import { CARD_BACKGROUND, rscCssApp, stylesheetsOf } from './rsc-css-app'
import type { Row } from './rsc-css-app'

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
        key: `${form.key}-${key}-${api.consumer}`,
        imports: form.declaration(api.api, from),
        body: api.call(form.callee(api.api), '<Card />'),
        consumer: api.consumer,
      } satisfies Row,
    })),
  ),
)

describe('RSC helpers by import form (Vite dev)', () => {
  const app = rscCssApp({ rows: matrix.map(({ row }) => row) })

  test.each(matrix)(
    '$api through $form of $from styles the server component',
    async ({ row, consumer }) => {
      expect(
        await app.style(
          row,
          '[data-testid=card]',
          'background-color',
          CARD_BACKGROUND,
        ),
      ).toBe(CARD_BACKGROUND)
      // The server component renders unchanged; a composite's slot renders
      // after it (J7.4: injection changes nothing else).
      expect(await app.text(row)).toBe(
        consumer === 'composite' ? 'MARK_CARDMARK_SLOT' : 'MARK_CARD',
      )
    },
  )

  // J4.12, and the control of the rows above: the client never loads a
  // stylesheet of a row's module itself (the handler, and so the render
  // call and the local component, are absent), so a styled section shows
  // the CSS the RSC payload delivered.
  test.each(matrix)(
    "the client's module of $api through $form of $from loads no stylesheet",
    async ({ row }) => {
      expect(stylesheetsOf(await app.clientModules(row))).toEqual([])
    },
  )
})
