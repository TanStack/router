/**
 * An RSC app whose `'use client'` component `ClientBox` is rendered from two
 * places: the route `/uc` renders it (SSR renders the route) and a server
 * component renders it (in the provider: Vite's `rsc` environment,
 * Rsbuild's RSC layer of the server compiler, where it is a client
 * reference that SSR renders again). `ClientBox` imports a `.client.ts`
 * helper, denied on the server, and import protection exempts the
 * component (`exclude`), so its import is real in every environment: both
 * spans show the helper's label. For the dev servers of
 * rsc-dual-layer-dev.test.ts and rsc-dual-layer-dev-rsbuild.test.ts.
 */
import { expect } from 'vitest'
import type { ChannelDiagnostic } from '@tanstack/compiler-test-utils/diagnostic-channel'

/** Start's options: `behavior: 'error'`, the component exempt. */
export const dualLayerStart = {
  importProtection: {
    behavior: 'error',
    exclude: ['**/ClientBox.tsx'],
  },
}

/** The app without the `/uc` route (an index page). */
export const dualLayerBase = {
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <main>index</main> })
`,
  'src/utils/browser.client.ts': `export function clientLabel(): string {
  return 'client-only label'
}
`,
  'src/utils/ClientBox.tsx': `'use client'
import { clientLabel } from './browser.client'
export function ClientBox() {
  return <span data-testid="client-box">{clientLabel()}</span>
}
`,
}

/**
 * The server fn `getUc` renders a server component, which renders
 * `ClientBox` (`withClientBox`) or a plain element instead.
 */
export const ucServer = (withClientBox: boolean) =>
  `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
${withClientBox ? `import { ClientBox } from './ClientBox'\n` : ''}function ServerPart() {
  return <section>${withClientBox ? '<ClientBox />' : '<em>just server</em>'}</section>
}
export const getUc = createServerFn({ method: 'GET' }).handler(async () =>
  renderServerComponent(<ServerPart />),
)
`

/**
 * `ucServer(true)` whose server component also renders the helper's label
 * itself (an import of the denied file in the provider).
 */
export const ucServerWithLabel = `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { clientLabel } from './browser.client'
import { ClientBox } from './ClientBox'
function ServerPart() {
  return (
    <section>
      <span data-testid="client-box">{clientLabel()}</span>
      <ClientBox />
    </section>
  )
}
export const getUc = createServerFn({ method: 'GET' }).handler(async () =>
  renderServerComponent(<ServerPart />),
)
`

/** The `/uc` route: `ClientBox` and the server fn's server component. */
export const ucRoute = {
  'src/utils/ucServer.tsx': ucServer(true),
  'src/routes/uc.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { ClientBox } from '../utils/ClientBox'
import { getUc } from '../utils/ucServer'
export const Route = createFileRoute('/uc')({
  loader: async () => ({ Server: await getUc() }),
  component: Uc,
})
function Uc() {
  const { Server } = Route.useLoaderData()
  return (
    <main>
      <ClientBox />
      {Server}
    </main>
  )
}
`,
}

/** The labels of the `ClientBox` spans of a server-rendered document. */
export function clientBoxLabels(html: string): Array<string> {
  return [
    ...html.matchAll(/<span data-testid="client-box">([^<]*)<\/span>/g),
  ].map((match) => match[1]!)
}

/**
 * The document `/uc` answers 200 with `count` real labels, and none of
 * `diagnostics` is an error; at `checkpoint` of a history, the history
 * goes on (a soft assertion).
 */
export function expectRealLabels(
  page: { status: number; body: string },
  count: number,
  diagnostics: Array<ChannelDiagnostic>,
  checkpoint?: string,
) {
  expect
    .soft(
      {
        status: page.status,
        labels: clientBoxLabels(page.body),
        errors: diagnostics
          .filter(({ severity }) => severity === 'error')
          .map(({ text }) => text),
      },
      checkpoint,
    )
    .toEqual({
      status: 200,
      labels: Array.from({ length: count }, () => 'client-only label'),
      errors: [],
    })
}
