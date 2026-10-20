import { openRscPage, waitForHydration } from './rsc-app'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'

/** `card.module.css` background. */
export const CARD_BACKGROUND = 'rgb(254, 243, 199)'

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
}

/** Opens `path` and waits for the server component and hydration. */
export async function show(
  server: RsbuildDevServer,
  path: string,
): Promise<BrowserPage> {
  const page = await openRscPage(server, path)
  await page.waitForText('MARK_CARD')
  await waitForHydration(page)
  return page
}
