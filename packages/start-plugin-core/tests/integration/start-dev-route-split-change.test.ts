/**
 * Route edits after the route file's split layout changed and changed back,
 * on Start's Vite dev server (SPEC J3.3): once the route component was
 * exported (in dev it then stays in the route module and the chunk carries
 * a copy) and is not any more (it moves to the chunk), the modules
 * the earlier layout produced change what they import, and a text edit must
 * still apply in place. Found by the HMR consistency fuzzer: a stale derived
 * module stayed in Vite's module graph with no importers, and the next edit
 * of the file full-reloaded the page.
 */
import react from '@vitejs/plugin-react'
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import {
  hmrSyncModule,
  settlePage,
  trackRequests,
} from '@tanstack/compiler-test-utils/hmr-sync'
import { startDevServer } from '../dev-server'
import { reactApp } from './hydrate-dev-edits'

const timeout = 90_000

const route = (text: string, exported = false) =>
  `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: Page })
${exported ? 'export ' : ''}function Page() {
  return <p data-probe="page">${text}</p>
}
`

const app = {
  ...reactApp,
  'src/hmr-sync.ts': hmrSyncModule,
  'harness/client-entry.ts': `import '../src/hmr-sync'\n${reactApp['harness/client-entry.ts']}`,
  'src/routes/index.tsx': route('text-v1'),
}

describe('Vite dev, Start: route edits after the split layout changed and changed back', () => {
  test(
    'the component exported, then not: a text edit applies in place',
    async () => {
      const server = await startDevServer({
        start: {},
        browser: true,
        plugins: [react()],
        files: app,
      })
      const page = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      const inFlight = trackRequests(page)
      await page.waitForText('hydrated', { selector: '[data-testid=hydrated]' })
      await page.waitForText('text-v1', { selector: '[data-probe=page]' })
      const shows = async (
        files: Record<string, string>,
        text: string,
        { mayReload = false } = {},
      ) => {
        const loads = page.loads()
        await server.edit(files)
        await settlePage(server, page, inFlight)
        await page.waitForText(text, { selector: '[data-probe=page]' })
        if (!mayReload) {
          expect(page.loads(), `the edit to ${text} reloaded the page`).toBe(
            loads,
          )
        }
      }
      // Exporting the component adds an export of the module: plugin-react
      // validates the route file's own exports and reloads, as on main
      await shows(
        { 'src/routes/index.tsx': route('text-v2', true) },
        'text-v2',
        {
          mayReload: true,
        },
      )
      await shows({ 'src/routes/index.tsx': route('text-v3') }, 'text-v3')
      await shows({ 'src/routes/index.tsx': route('text-v4') }, 'text-v4')
      expect(page.errors).toEqual([])
    },
    timeout,
  )
})
