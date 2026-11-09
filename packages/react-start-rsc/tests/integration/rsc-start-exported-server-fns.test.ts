/**
 * A route file of an app with a separate provider (Vite's `rsc` environment,
 * Rsbuild's RSC layer) exporting two server fns only the split component
 * reads. Where the server fns are call stubs (the browser, the SSR
 * environment), each export's module imports the stub's runtime itself, as it
 * would an import the source wrote: an extracted module evaluates before the
 * route module's body, so it reads nothing of the route module then.
 * Learned from the server-functions e2e app (its `method-not-allowed/$method`
 * route), whose builds failed the compiler's self-checks.
 */
import { afterAll, beforeAll, describe, test } from 'vitest'
import {
  openRscPage,
  startRscPreviewServer,
  startRscRsbuildPreviewServer,
  waitForHydration,
} from './rsc-app'
import type { RscPreviewServer } from './rsc-app'

const files = {
  'src/routes/two-exported.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
export const Route = createFileRoute('/two-exported')({
  component: Page,
})
export const first = createServerFn().handler(async () => 'MARK_FIRST')
export const second = createServerFn({ method: 'POST' }).handler(async () => 'MARK_SECOND')
function Page() {
  const [called, setCalled] = useState('')
  return (
    <main>
      <p data-testid="label">MARK_PAGE</p>
      <p data-testid="called">called {called}</p>
      <button
        data-testid="call"
        onClick={() =>
          Promise.all([first(), second()]).then(
            (values) => setCalled(values.join(' ')),
            (e: Error) => setCalled(String(e?.message)),
          )
        }
      >
        call
      </button>
    </main>
  )
}
`,
}

describe.each([
  ['vite', startRscPreviewServer],
  ['rsbuild', startRscRsbuildPreviewServer],
] as const)('a %s build', (_, start) => {
  let server: RscPreviewServer
  const cleanups: Array<() => Promise<void>> = []

  beforeAll(async () => {
    server = await start({
      registerCleanup: (cleanup) => {
        cleanups.push(cleanup)
      },
      files,
    })
  })
  afterAll(async () => {
    for (const cleanup of cleanups.reverse()) {
      await cleanup()
    }
  })

  test('a route exporting two server fns its component reads renders and both answer the browser', async () => {
    const opened = await openRscPage(server, '/two-exported')
    await opened.waitForText('MARK_PAGE', {
      selector: '[data-testid=label]',
    })
    await waitForHydration(opened)
    await opened.page.locator('[data-testid=call]').click()
    await opened.waitForText('called MARK_FIRST MARK_SECOND', {
      selector: '[data-testid=called]',
    })
  })
})
