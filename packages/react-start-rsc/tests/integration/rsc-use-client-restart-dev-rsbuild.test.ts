/**
 * Rsbuild dev with RSC on the persistent cache (`performance.buildCache`):
 * an exempt server component alone imports a denied `'use client'` file
 * (`ClientBox.client.tsx`, `**\/*.client.*`), which SSR renders as a client
 * component. Its exempt import makes the file's SSR module real (SPEC
 * J6.7), on a cold start and on a restart that changed nothing alike, and
 * nothing reports the file: a module's own verdict is reported once it is
 * final for the module the server serves.
 * Source: the RSC phase 1 re-check 2 (/var/tmp/rsc-p1-recheck2/report.md §5,
 * `devwarm.py`: 2f8afeccc0 rendered the box on the restart and reported
 * `ssr src/utils/ClientBox.client.tsx` once), opinion-rsc-p1-dev-reporting.md
 * (a).
 */
import { describe, expect } from 'vitest'
import { recorder, summary } from './rsc-environments-app'
import { test } from './test'

const timeout = 60_000

const files = {
  'src/utils/ClientBox.client.tsx': `'use client'
export function ClientBox() {
  return <span data-testid="client-box">{'client-only label'}</span>
}
`,
  'src/utils/ucServer.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { ClientBox } from './ClientBox.client'
function ServerPart() {
  return (
    <section>
      <ClientBox />
    </section>
  )
}
export const getUc = createServerFn({ method: 'GET' }).handler(async () =>
  renderServerComponent(<ServerPart />),
)
`,
  'src/routes/uc.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { getUc } from '../utils/ucServer'
export const Route = createFileRoute('/uc')({
  loader: async () => ({ Server: await getUc() }),
  component: Uc,
})
function Uc() {
  const { Server } = Route.useLoaderData()
  return <main>{Server}</main>
}
`,
}

/** The client boxes of `/uc`. */
async function boxes(url: string): Promise<Array<string>> {
  const html = await (await fetch(new URL('/uc', url))).text()
  return [...html.matchAll(/data-testid="client-box">([^<]*)</g)].map(
    (m) => m[1]!,
  )
}

describe('Rsbuild dev with RSC on the persistent cache, an exempt server component alone imports a denied client component', () => {
  test.for(['mock', 'error'] as const)(
    'behavior %s: the box renders on a cold start and after a restart, nothing is reported',
    { timeout },
    async (behavior, { startRscRsbuildDevServer }) => {
      const { violations, start } = recorder(behavior)
      const cold = await startRscRsbuildDevServer({
        browser: true,
        start: {
          importProtection: {
            ...start.importProtection,
            exclude: ['**/ucServer.tsx'],
          },
        },
        config: { performance: { buildCache: true } },
        files,
      })
      expect(await boxes(cold.url!)).toEqual(['client-only label'])
      expect(summary(violations)).toEqual([])
      await cold.stop()
      const warm = await cold.restart()
      expect(await boxes(warm.url!)).toEqual(['client-only label'])
      expect(summary(violations)).toEqual([])
    },
  )
})
