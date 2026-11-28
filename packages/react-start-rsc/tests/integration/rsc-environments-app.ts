/**
 * An RSC app whose shared files the route (SSR) and a server component (the
 * provider: Vite's `rsc` environment, Rsbuild's RSC layer of the server
 * compiler, the `rsc` compile environment) both import, so each is a module
 * of both environments, for rsc-environments-*.test.ts:
 * - `Box.tsx`, a `'use client'` component: the component in SSR, a client
 *   reference in `rsc`, which SSR renders again;
 * - `shared.tsx`, a plain component rendering `Box` and `label()`;
 * - `label.ts`, which reads `secretLabel` of `secret.client.ts` (denied on
 *   the server by default) and `where` of `#where` (`react-server`:
 *   `where/server.ts`, default: `where/plain.ts`).
 * The route `/` renders `<Shared from="route" />` and the server fn
 * `getServer`'s server component, which renders `<Shared from="server" />`.
 */
import { expect } from 'vitest'

/** What `onViolation` and `allowImport` were told (`info`). */
export interface ImportInfo {
  env: string
  envType: string
  type: string
  importer: string
  specifier: string
}

/** Each call as `env envType type importer -> specifier` (importer by file name), in call order. */
export const calls = (infos: Array<ImportInfo>) =>
  infos.map(
    ({ env, envType, type, importer, specifier }) =>
      `${env} ${envType} ${type} ${importer.split('/').pop()} -> ${specifier}`,
  )

/** `calls`, deduplicated and sorted. */
export const summary = (infos: Array<ImportInfo>) =>
  [...new Set(calls(infos))].sort()

/** Start's options recording `onViolation` (and `allowImport`, answering `allow`), with `behavior`. */
export function recorder(
  behavior: 'mock' | 'error',
  allow?: (info: ImportInfo) => boolean,
) {
  const violations: Array<ImportInfo> = []
  const asked: Array<ImportInfo> = []
  return {
    violations,
    asked,
    start: {
      importProtection: {
        behavior,
        onViolation: (info: ImportInfo) => {
          violations.push(info)
        },
        ...(allow && {
          allowImport: (info: ImportInfo) => {
            asked.push(info)
            return allow(info)
          },
        }),
      },
    },
  }
}

export const box = (marked: boolean) => `'use client'
${marked ? `import '@tanstack/react-start/client-only'\n` : ''}export function Box() {
  return <span data-testid="box">box</span>
}
`

/** `label.ts`: reads the denied helper (`withSecret`) and `#where`. */
export const labelModule = (withSecret: boolean) =>
  `${withSecret ? `import { secretLabel } from './secret.client'\n` : ''}import { where } from '#where'
export const label = () => ${withSecret ? `secretLabel() + ' ' + ` : ''}where()
`

export const environmentsFiles = {
  'package.json': JSON.stringify({
    name: 'app',
    private: true,
    type: 'module',
    imports: {
      '#where': {
        'react-server': './src/where/server.ts',
        default: './src/where/plain.ts',
      },
    },
  }),
  'src/where/server.ts': `export const where = () => 'MARK_WHERE_SERVER'\n`,
  'src/where/plain.ts': `export const where = () => 'MARK_WHERE_PLAIN'\n`,
  'src/lib/secret.client.ts': `export const secretLabel = () => 'MARK_SECRET'\n`,
  'src/lib/label.ts': labelModule(true),
  'src/lib/Box.tsx': box(false),
  'src/lib/shared.tsx': `import { Box } from './Box'
import { label } from './label'
export function Shared({ from }: { from: string }) {
  return (
    <div data-testid={'shared-' + from}>
      <b data-testid={'label-' + from}>{String(label())}</b>
      <Box />
    </div>
  )
}
`,
  'src/lib/server.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { Shared } from './shared'
export const getServer = createServerFn({ method: 'GET' }).handler(async () =>
  renderServerComponent(
    <section>
      <Shared from="server" />
    </section>,
  ),
)
`,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { Shared } from '../lib/shared'
import { getServer } from '../lib/server'
export const Route = createFileRoute('/')({
  loader: async () => ({ Server: await getServer() }),
  component: Page,
})
function Page() {
  const { Server } = Route.useLoaderData()
  return (
    <main>
      <Shared from="route" />
      {Server}
    </main>
  )
}
`,
}

/** What a server-rendered document of the app shows: each `Shared`'s label and how many boxes it renders. */
export function rendered(html: string) {
  const label = (from: string) =>
    new RegExp(`data-testid="label-${from}">([^<]*)<`).exec(html)?.[1] ?? null
  return {
    route: label('route'),
    server: label('server'),
    boxes: [...html.matchAll(/data-testid="box">box</g)].length,
  }
}

/**
 * The document `/` at `url` answers 200 and shows `expected`; at a named
 * `checkpoint` of a history, the history goes on (a soft assertion).
 */
export async function expectPage(
  url: string,
  expected: ReturnType<typeof rendered>,
  checkpoint?: string,
) {
  const response = await fetch(new URL('/', url))
  const html = await response.text()
  ;(checkpoint === undefined ? expect : expect.soft)(
    { status: response.status, ...rendered(html) },
    checkpoint,
  ).toEqual({
    status: 200,
    ...expected,
  })
  return html
}
