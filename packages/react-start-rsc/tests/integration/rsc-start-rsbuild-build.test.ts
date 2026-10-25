/**
 * A production build of a React Start app with RSC enabled on Rsbuild
 * (`rsc-app.ts`: `rsbuild build`, served by `rsbuild preview`) in a real
 * page: a server function only its route's component calls (SPEC J4.1, J2:
 * the component is split, the server fn's module renders on the server
 * with its SSR stub). The dev counterpart is rsc-start-rsbuild.test.ts.
 */
import { afterAll, beforeAll, expect, test } from 'vitest'
import {
  openRscPage,
  startRscRsbuildPreviewServer,
  waitForHydration,
} from './rsc-app'
import type { RscPreviewServer } from './rsc-app'

let server: RscPreviewServer & { errors: Array<string> }
const cleanups: Array<() => Promise<void>> = []

beforeAll(async () => {
  server = await startRscRsbuildPreviewServer({
    registerCleanup: (cleanup) => {
      cleanups.push(cleanup)
    },
    files: {
      'src/routes/component-fn.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
const greet = createServerFn().handler(async () => 'MARK_HANDLER')
export const Route = createFileRoute('/component-fn')({
  component: Page,
})
function Page() {
  const call = useServerFn(greet)
  const [called, setCalled] = useState('')
  return (
    <main>
      <p data-testid="label">MARK_PAGE</p>
      <p data-testid="called">called {called}</p>
      <button data-testid="call" onClick={() => call().then(setCalled)}>call</button>
    </main>
  )
}
`,
    },
  })
})
afterAll(async () => {
  for (const cleanup of cleanups.reverse()) {
    await cleanup()
  }
})

// Found by the react-start/rsc e2e app (rsbuild-ssr): the SSR output named
// the server fn's SSR stub without importing it, so every page failed.
test("a server fn only its route's component calls renders on the server and answers the browser", async () => {
  expect(server.errors).toEqual([])
  const page = await openRscPage(server, '/component-fn')
  await page.waitForText('MARK_PAGE', { selector: '[data-testid=label]' })
  await waitForHydration(page)
  await page.page.locator('[data-testid=call]').click()
  await page.waitForText('called MARK_HANDLER', {
    selector: '[data-testid=called]',
  })
})
