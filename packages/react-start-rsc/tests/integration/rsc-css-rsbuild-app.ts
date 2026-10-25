import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  computedStyle,
  openRscPage,
  startRscRsbuildDevServer,
  startRscRsbuildPreviewServer,
  waitForHydration,
  waitForStyle,
} from './rsc-app'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'

/** `card.module.css` background. */
export const CARD_BACKGROUND = 'rgb(254, 243, 199)'
/** `helperCard.module.css` background. */
export const HELPER_CARD_BACKGROUND = 'rgb(224, 242, 254)'

/**
 * A route whose server function renders a local server component with a
 * CSS module through `api`; `consumer` is how the page renders the result.
 */
const route = (
  path: string,
  imports: string,
  body: string,
  page: string,
) => `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
${imports}
import styles from '../card.module.css'
function Card({ children }: { children?: React.ReactNode }) {
  return <div className={styles.card} data-testid="card">MARK_CARD{children}</div>
}
const flight = (stream: ReadableStream) =>
  new Response(stream, { headers: { 'Content-Type': 'text/x-component' } })
export const render = createServerFn().handler(async () => {
${body}
})
export const Route = createFileRoute('${path}')({
${path === '/flight' ? '' : '  loader: () => render(),\n'}  component: Page,
})
${page}
`

export const rows = [
  {
    api: 'renderToReadableStream',
    path: '/flight',
    file: route(
      '/flight',
      `import { createFromFetch, renderToReadableStream } from '@tanstack/react-start/rsc'
import { useEffect, useState } from 'react'`,
      `  return flight(renderToReadableStream(<Card />))`,
      `function Page() {
  const [tree, setTree] = useState<unknown>(null)
  useEffect(() => {
    createFromFetch(render()).then(setTree)
  }, [])
  return <main>{tree as React.ReactNode}</main>
}`,
    ),
  },
  {
    api: 'renderServerComponent',
    path: '/renderable',
    file: route(
      '/renderable',
      `import { renderServerComponent } from '@tanstack/react-start/rsc'`,
      `  return renderServerComponent(<Card />)`,
      `function Page() {
  return <main>{Route.useLoaderData()}</main>
}`,
    ),
  },
  {
    api: 'createCompositeComponent',
    path: '/composite',
    file: route(
      '/composite',
      `import { CompositeComponent, createCompositeComponent } from '@tanstack/react-start/rsc'`,
      `  return createCompositeComponent((props) => <Card>{props.children}</Card>)`,
      `function Page() {
  return (
    <main>
      <CompositeComponent src={Route.useLoaderData()}>
        <em>MARK_SLOT</em>
      </CompositeComponent>
    </main>
  )
}`,
    ),
  },
]

/**
 * A route whose server function calls a helper module that renders a local
 * server component with its own CSS module through `renderServerComponent`.
 */
export const helperRow = {
  path: '/helper',
  marker: 'MARK_HELPER',
  files: {
    'src/helperCard.module.css': `.card { background: #e0f2fe; }\n`,
    'src/renderHelperCard.tsx': `import { renderServerComponent } from '@tanstack/react-start/rsc'
import styles from './helperCard.module.css'
function HelperCard() {
  return <div className={styles.card} data-testid="helper-card">MARK_HELPER</div>
}
export function renderHelperCard() {
  return renderServerComponent(<HelperCard />)
}
`,
    'src/routes/helper.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { renderHelperCard } from '../renderHelperCard'
export const render = createServerFn().handler(async () => {
  return renderHelperCard()
})
export const Route = createFileRoute('/helper')({
  loader: () => render(),
  component: Page,
})
function Page() {
  return <main>{Route.useLoaderData()}</main>
}
`,
  },
}

export const appFiles = {
  'src/routes/control.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { render as flight } from './flight'
import { render as renderable } from './renderable'
import { render as composite } from './composite'
export const Route = createFileRoute('/control')({ component: Control })
function Control() {
  return <main data-testid="control">{[flight, renderable, composite].map((render, index) => <a key={index} href={render.url}>caller</a>)}</main>
}
`,
  'src/card.module.css': `.card { background: #fef3c7; }\n`,
  ...Object.fromEntries(
    rows.map((row) => [`src/routes${row.path}.tsx`, row.file]),
  ),
  ...helperRow.files,
}

/** Opens `path` and waits for the server component (`marker`) and hydration. */
export async function show(
  server: Pick<RsbuildDevServer, 'url'>,
  path: string,
  marker = 'MARK_CARD',
): Promise<BrowserPage> {
  const page = await openRscPage(server, path)
  await page.waitForText(marker)
  await waitForHydration(page)
  return page
}

/**
 * The rows of rsc-css-rsbuild.test.ts (`dev`: an Rsbuild dev server) and
 * rsc-css-rsbuild-build.test.ts (`build`: a production build served by
 * `rsbuild preview`), one file per mode so the two run in parallel.
 */
export function describeRscCssRows(mode: 'dev' | 'build') {
  describe(`RSC CSS through the real transport (Rsbuild ${mode})`, () => {
    let server: Pick<RsbuildDevServer, 'url' | 'errors'>
    const cleanups: Array<() => Promise<void>> = []

    beforeAll(async () => {
      const registerCleanup = (cleanup: () => Promise<void>) => {
        cleanups.push(cleanup)
      }
      server =
        mode === 'dev'
          ? await startRscRsbuildDevServer({
              browser: true,
              registerCleanup,
              files: appFiles,
            })
          : await startRscRsbuildPreviewServer({
              registerCleanup,
              files: appFiles,
            })
    })
    afterAll(async () => {
      for (const cleanup of cleanups.reverse()) {
        await cleanup()
      }
    })

    test('loading only the client callers does not supply the server stylesheet', async () => {
      const page = await openRscPage(server, '/control')
      await page.waitForText('caller', { selector: '[data-testid=control]' })
      await waitForHydration(page)
      const css = await page.page.evaluate(() =>
        [...document.styleSheets]
          .flatMap((sheet) => {
            try {
              return [...sheet.cssRules].map((rule) => rule.cssText)
            } catch {
              return []
            }
          })
          .join('\n'),
      )
      expect(css).not.toMatch(/254, 243, 199|#fef3c7/i)
      expect(page.errors).toEqual([])
    })

    test.each(rows)(
      '$api in a server function module styles the server component',
      async ({ path }) => {
        expect(server.errors).toEqual([])
        const page = await show(server, path)
        await waitForStyle(
          page,
          '[data-testid=card]',
          'background-color',
          CARD_BACKGROUND,
          5_000,
        )
        expect(
          await computedStyle(page, '[data-testid=card]', 'background-color'),
        ).toBe(CARD_BACKGROUND)
        expect(page.errors).toEqual([])
      },
    )

    // Bug: on Rsbuild, the RSC CSS transform only rewrites server function
    // provider modules (`serverFnProviderOnly: true`, react-start
    // src/plugin/rsbuild.ts; react-start-rsc src/plugin/rscCssTransform.ts), so
    // a render call in a helper module that a server function calls gets no CSS.
    // Impact: the server component renders unstyled; Vite styles it
    // (rsc-css.test.ts, "two render helpers in one module each carry their
    // component CSS").
    // Source: SPEC J7.1, J7.2 (CSS is delivered wherever the render executes).
    test(
      'a render call in a helper module styles the server component',
      async () => {
        expect(server.errors).toEqual([])
        const page = await show(server, helperRow.path, helperRow.marker)
        await waitForStyle(
          page,
          '[data-testid=helper-card]',
          'background-color',
          HELPER_CARD_BACKGROUND,
          5_000,
        )
        expect(
          await computedStyle(
            page,
            '[data-testid=helper-card]',
            'background-color',
          ),
        ).toBe(HELPER_CARD_BACKGROUND)
        expect(page.errors).toEqual([])
      },
    )
  })
}
