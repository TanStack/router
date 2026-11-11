/**
 * A second `build()` of one Rsbuild instance (the same plugins) of a React
 * Start app with RSC enabled, after an edit of a client module: the build
 * served is a build of its own (`rsbuild preview`). The documents its
 * server renders load the client files the second build emitted, and the
 * page shows the edit. Also the tripwire of the RSC manifest's rebuild at
 * `finishMake` stage 10, after Rspack's RSC ServerPlugin's handoff (red
 * when the rebuild runs before it).
 */
import { expect, onTestFinished, test } from 'vitest'
import {
  openRscPage,
  startRscRsbuildPreviewServer,
  waitForHydration,
} from './rsc-app'

const timeout = 120_000

const index = (
  marker: string,
) => `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
export const Route = createFileRoute('/')({ component: Page })
function Page() {
  const [count, setCount] = useState(0)
  return <button data-testid="page" onClick={() => setCount(count + 1)}>${marker} {count}</button>
}
`

test(
  'the second build renders documents that load its own client files',
  async () => {
    const server = await startRscRsbuildPreviewServer({
      files: { 'src/routes/index.tsx': index('MARK_BEFORE') },
      rebuildWith: { 'src/routes/index.tsx': index('MARK_AFTER') },
    })
    const html = await (await fetch(new URL('/', server.url))).text()
    const named = [
      ...html.matchAll(/(?:src|href)="(\/[^"]+?\.(?:js|css))"/g),
    ].map((m) => m[1]!)
    expect(named.length).toBeGreaterThan(0)
    const missing: Array<string> = []
    for (const file of named) {
      const response = await fetch(new URL(file, server.url))
      if (!response.ok) {
        missing.push(file)
      }
    }
    expect(missing).toEqual([])
    const page = await openRscPage(server, '/', {
      registerCleanup: onTestFinished,
    })
    await waitForHydration(page)
    expect(await page.text('[data-testid=page]')).toBe('MARK_AFTER 0')
  },
  timeout,
)
