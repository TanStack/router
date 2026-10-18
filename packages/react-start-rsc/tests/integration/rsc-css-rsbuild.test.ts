/**
 * RSC CSS delivery (SPEC J7) through the real transport on Rsbuild: a React
 * Start app with RSC enabled on an Rsbuild dev server (`rsc-app.ts`, Start's
 * RSC layer with `react-server-dom-rspack`), whose server functions render
 * server components with the RSC helpers, and a real page that shows what
 * the browser makes of the Flight payload. The Vite counterpart, with the
 * whole matrix, is rsc-css.test.ts; the e2e app pins the helper-module case
 * (e2e/react-start/rsc/tests/rsc-css-helper.spec.ts).
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  computedStyle,
  openRscPage,
  startRscRsbuildDevServer,
  waitForHydration,
  waitForStyle,
} from './rsc-app'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'

/** `card.module.css` background. */
const CARD_BACKGROUND = 'rgb(254, 243, 199)'

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
const render = createServerFn().handler(async () => {
${body}
})
export const Route = createFileRoute('${path}')({
${path === '/flight' ? '' : '  loader: () => render(),\n'}  component: Page,
})
${page}
`

const rows = [
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

const appFiles = {
  'src/card.module.css': `.card { background: #fef3c7; }\n`,
  ...Object.fromEntries(
    rows.map((row) => [`src/routes${row.path}.tsx`, row.file]),
  ),
}

/** Opens `path` and waits for the server component and hydration. */
async function show(
  server: RsbuildDevServer,
  path: string,
): Promise<BrowserPage> {
  const page = await openRscPage(server, path)
  await page.waitForText('MARK_CARD')
  await waitForHydration(page)
  return page
}

describe('RSC CSS through the real transport (Rsbuild dev)', () => {
  let server: RsbuildDevServer
  const cleanups: Array<() => Promise<void>> = []

  beforeAll(async () => {
    server = await startRscRsbuildDevServer({
      browser: true,
      registerCleanup: (cleanup) => {
        cleanups.push(cleanup)
      },
      files: appFiles,
    })
  })
  afterAll(async () => {
    for (const cleanup of cleanups.reverse()) {
      await cleanup()
    }
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
})

// SPEC J4.16: discovery and wiring use the configured root, not the process
// working directory.
// Bug: Start's Rsbuild plugin writes its virtual modules (serialization
// adapters, RSC decode) under `<process.cwd()>/node_modules/.virtual`
// (rsbuild/virtual-modules.ts `virtualPath`, with `resolvedStartConfig.root`
// still empty at setup), where the app's `@tanstack/react-start` does not
// resolve when the process runs elsewhere (`rsbuild dev --root <app>` from
// a monorepo root).
// Impact: the dev server (and build) fails with "Module not found".
test.fails(
  'Rsbuild: the app compiles when the process does not run in the app directory',
  async () => {
    const server = await startRscRsbuildDevServer({
      browser: true,
      inAppDirectory: false,
      files: appFiles,
    })
    expect(server.errors).toEqual([])
    const page = await show(server, rows[0]!.path)
    expect(page.errors).toEqual([])
  },
)

// SPEC J7.5 on Rsbuild: editing a server component's CSS updates the open
// page's effective styles without a full reload.
test("Rsbuild: editing a server component's CSS updates the page without a full reload", async () => {
  const styles = (background: string) =>
    `.card { background: ${background}; }\n`
  const server = await startRscRsbuildDevServer({
    browser: true,
    files: { ...appFiles, 'src/card.module.css': styles('#fef3c7') },
  })
  const page = await show(server, rows[1]!.path)
  await waitForStyle(
    page,
    '[data-testid=card]',
    'background-color',
    CARD_BACKGROUND,
    5_000,
  )

  await server.edit({ 'src/card.module.css': styles('#e0f2fe') })
  expect(server.errors).toEqual([])
  await waitForStyle(
    page,
    '[data-testid=card]',
    'background-color',
    'rgb(224, 242, 254)',
  )
  expect(page.loads()).toBe(1)
  expect(page.errors).toEqual([])
})
