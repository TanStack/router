/**
 * The provider's copy of a plain module (Vite's `rsc` environment, Rsbuild's
 * RSC layer) takes the load-time code that fills the state its server fn
 * reads, as `main`'s provider runs the whole file: a declaration only its own
 * text names is such code (review-a1-classes-stay-round2 p1).
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
  'src/provider-copy.ts': `import { createServerFn } from '@tanstack/react-start'
const routes: Array<string> = []
console.info('provider-copy', routes.length)
const reg: any = (routes.push('x'), { again: () => reg })
export const count = createServerFn().handler(async () => routes.length)
`,
  'src/routes/provider-copy.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { count } from '../provider-copy'
export const Route = createFileRoute('/provider-copy')({
  component: Page,
})
function Page() {
  const [called, setCalled] = useState('')
  return (
    <main>
      <p data-testid="label">MARK_PAGE</p>
      <p data-testid="called">called {called}</p>
      <button
        data-testid="call"
        onClick={() =>
          count().then(
            (n) => setCalled(String(n)),
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

  test('a server fn reads the state a self-naming declaration filled at load', async () => {
    const opened = await openRscPage(server, '/provider-copy')
    await opened.waitForText('MARK_PAGE', { selector: '[data-testid=label]' })
    await waitForHydration(opened)
    await opened.page.locator('[data-testid=call]').click()
    await opened.waitForText('called 1', { selector: '[data-testid=called]' })
  })
})
