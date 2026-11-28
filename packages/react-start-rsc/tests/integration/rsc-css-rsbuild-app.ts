import { visit, waitForHydration } from './rsc-app'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import type { Page } from '@tanstack/compiler-test-utils/test'

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
 * A route whose unexported server function only the loader calls: the route
 * module keeps it, its handler replaced by the stub, and the split component
 * reads `Route`. What only the handler reads (`Card` and its CSS module) stays
 * out of the component's SSR chunk: there, Rsbuild's RSC plugin would hand the
 * CSS to the entry's stylesheet (every page loads it, the control row sees it)
 * and a Flight stream would get no stylesheet link.
 */
export const unexportedRow = {
  path: '/unexported',
  file: route(
    '/unexported',
    `import { renderServerComponent } from '@tanstack/react-start/rsc'`,
    `  return renderServerComponent(<Card />)`,
    `function Page() {
  return <main>{Route.useLoaderData()}</main>
}`,
  ).replace('export const render', 'const render'),
}

/**
 * The same route with exports that read each other (one extracted module when
 * split code needs them), read by the handler alone, by the handler and the
 * split component, and by an exported server function the cycle reads back. The
 * cycle changes nothing for what only the handler reads: `Card` and its CSS module
 * stay out of the component's SSR chunk.
 */
const cycle = `export class Base { sub() { return Sub } }
export class Sub extends Base { static label = 'MARK_CYCLE' }`
export const cycleRows = [
  {
    name: 'read by the handler alone',
    path: '/cycle-handler',
    file: route(
      '/cycle-handler',
      `import { renderServerComponent } from '@tanstack/react-start/rsc'
${cycle}`,
      `  return renderServerComponent(<Card>{new Sub().sub().label}</Card>)`,
      `function Page() {
  return <main>{Route.useLoaderData()}</main>
}`,
    ).replace('export const render', 'const render'),
  },
  {
    name: 'read by the handler and the split component',
    path: '/cycle-both',
    file: route(
      '/cycle-both',
      `import { renderServerComponent } from '@tanstack/react-start/rsc'
${cycle}`,
      `  return renderServerComponent(<Card>{new Sub().sub().label}</Card>)`,
      `function Page() {
  return <main>{new Sub().sub().label}{Route.useLoaderData()}</main>
}`,
    ).replace('export const render', 'const render'),
  },
  {
    name: 'read back by the exported server function',
    path: '/cycle-fn',
    file: route(
      '/cycle-fn',
      `import { renderServerComponent } from '@tanstack/react-start/rsc'
export class Base { sub() { return Sub } again() { return render } }
export class Sub extends Base { static label = 'MARK_CYCLE' }`,
      `  return renderServerComponent(<Card>{new Sub().sub().label}</Card>)`,
      `function Page() {
  return <main>{new Sub().again() === render ? new Sub().sub().label : 'WRONG'}{Route.useLoaderData()}</main>
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
  marker: /MARK_HELPER/,
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
  [`src/routes${unexportedRow.path}.tsx`]: unexportedRow.file,
  ...Object.fromEntries(
    cycleRows.map((row) => [`src/routes${row.path}.tsx`, row.file]),
  ),
}

/** Opens `path` in `page` and waits for the server component (`marker`) and hydration. */
export async function show(
  page: Page,
  server: Pick<RsbuildDevServer, 'url'>,
  path: string,
  marker = /MARK_CARD/,
): Promise<Page> {
  await visit(page, server, path)
  await page.locator('body', { hasText: marker }).waitFor()
  await waitForHydration(page)
  return page
}
