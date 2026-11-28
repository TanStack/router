/**
 * SPEC J4.12 in development: a server fn whose handler is a binding the
 * module assigns again (`let h = …; h = async () => db.x()`) ships no
 * server code to the client. The assignments are statements, which the
 * client output can keep with what they read (R154): on main both dev
 * servers serve `db.ts` to the browser, which runs it. Every compile refuses
 * the shape instead (`start-server-code-reassigned`, decision of 2026-11-24).
 *
 * On Vite's and Rsbuild's dev servers, a real page:
 * - with the reassigned `let`, the dev server reports the error at the
 *   handler's argument, and no script the page loaded holds the server
 *   module's marker, which never ran in the page;
 * - with the rewrite the error suggests (one `const` choosing the
 *   implementation), the page hydrates, no script holds the marker, the
 *   module never ran in the page, and a call runs the chosen handler.
 */
import { describe, expect, test } from 'vitest'
import {
  expectDiagnostic,
  expectNoDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { pluginReact } from '@rsbuild/plugin-react'
import { openTestPage } from '../test-page'
import { startDevServer } from '../dev-server'
import { startRsbuildStartDevServer } from '../rsbuild-dev-server'
import { rootDocument, routerFile } from './start-compose-app'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'
import type { ChannelDiagnostic } from '@tanstack/compiler-test-utils/diagnostic-channel'

const timeout = 60_000

const fnsHead = `import { createServerFn } from '@tanstack/react-start'
import { db } from './db'
`
const reassigned = `${fnsHead}let h = async () => db.y()
h = async () => db.x()
export const getX = createServerFn().handler(h)
`
const rewritten = `${fnsHead}const h = import.meta.env.DEV ? async () => db.x() : async () => db.y()
export const getX = createServerFn().handler(h)
`

const files = (fns: string) => ({
  'harness/client-entry.ts': `import { createElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
hydrateRoot(document, createElement(StartClient))
`,
  'harness/server-entry.ts': `export { default } from '@tanstack/react-start/server-entry'\n`,
  'src/router.ts': routerFile,
  'src/routes/__root.tsx': rootDocument(),
  'src/db.ts': `;(globalThis as any).__dbRan = true
export const db = { x: () => 'MARK_DB_X', y: () => 'MARK_DB_Y' }
`,
  'src/fns.ts': fns,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { getX } from '../fns'
export const Route = createFileRoute('/')({ component: Page })
function Page() {
  const [text, setText] = useState('idle')
  return <button data-testid="probe" onClick={async () => setText('got=' + (await getX()))}>{text}</button>
}
`,
})

interface Served {
  url: string
  root: string
  diagnostics: Array<ChannelDiagnostic>
}

const servers: Record<string, (fns: string) => Promise<Served>> = {
  vite: async (fns) => {
    const server = await startDevServer({ browser: true, files: files(fns) })
    return {
      url: server.url!,
      root: server.root,
      diagnostics: server.diagnostics,
    }
  },
  rsbuild: async (fns) => {
    const server = await startRsbuildStartDevServer({
      browser: true,
      config: { plugins: [pluginReact()] },
      files: files(fns),
    })
    return {
      url: server.url!,
      root: server.root,
      diagnostics: server.diagnostics,
    }
  },
}

/** The pathnames of the scripts the page loaded that hold `db.ts`'s marker, as the dev server serves them, and whether `db.ts` ran in the page. */
async function serverCodeInPage(page: BrowserPage) {
  const scripts = await page.page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter(
        (entry) =>
          (entry as PerformanceResourceTiming).initiatorType === 'script' ||
          /\.[cm]?[jt]sx?(\?|$)/.test(new URL(entry.name).pathname),
      )
      .map((entry) => entry.name),
  )
  const holding: Array<string> = []
  for (const url of new Set(scripts)) {
    const code = await (await fetch(url)).text()
    if (code.includes('MARK_DB_')) {
      holding.push(new URL(url).pathname)
    }
  }
  const ran = await page.page.evaluate(
    () => (globalThis as { __dbRan?: boolean }).__dbRan ?? false,
  )
  return { scripts: scripts.length, holding, ran }
}

describe.each(Object.keys(servers))('%s dev', (bundler) => {
  test(
    'a handler held in a reassigned `let` is refused at the argument, and no server code reaches the page',
    async () => {
      const server = await servers[bundler]!(reassigned)
      const page = await openTestPage(server.url)
      // what the page got once the dev server answered and compiled
      await page.page.waitForLoadState('networkidle')
      expectDiagnostic(server.diagnostics, {
        severity: 'error',
        file: 'src/fns.ts',
        root: server.root,
        position: { line: 5 },
      })
      const { holding, ran } = await serverCodeInPage(page)
      expect({ holding, ran }).toEqual({ holding: [], ran: false })
    },
    timeout,
  )

  test(
    'the `const` the error suggests serves no server code and calls the chosen handler',
    async () => {
      const server = await servers[bundler]!(rewritten)
      const page = await openTestPage(server.url)
      await page.waitForText('hydrated', {
        selector: '[data-testid=hydrated]',
      })
      await page.page.locator('[data-testid=probe]').click()
      await page.waitForText(/got=/, { selector: '[data-testid=probe]' })
      const { scripts, holding, ran } = await serverCodeInPage(page)
      expect(scripts).toBeGreaterThan(0)
      expect({
        holding,
        ran,
        answer: await page.text('[data-testid=probe]'),
      }).toEqual({ holding: [], ran: false, answer: 'got=MARK_DB_X' })
      expectNoDiagnostic(server.diagnostics, {
        severity: 'error',
        file: 'src/fns.ts',
        root: server.root,
      })
    },
    timeout,
  )
})
