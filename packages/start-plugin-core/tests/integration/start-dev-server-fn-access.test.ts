/**
 * SPEC J4.2 in development: only server functions client code references
 * are callable over HTTP, on Vite's and Rsbuild's dev servers (R44). A
 * page calls a server fn it imports, then asks the server for the public
 * URL of a server fn only that fn's handler calls and requests it with the
 * exposed fn's own request envelope: the exposed one answers (its handler
 * calls the internal one: server code may), the internal one is refused
 * without leaking its result.
 */
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { pluginReact } from '@rsbuild/plugin-react'
import { startDevServer } from '../dev-server'
import { startRsbuildStartDevServer } from '../rsbuild-dev-server'
import { rootDocument, routerFile } from './start-compose-app'

const timeout = 60_000

const files = {
  'harness/client-entry.ts': `import { createElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
hydrateRoot(document, createElement(StartClient))
`,
  'harness/server-entry.ts': `export { default } from '@tanstack/react-start/server-entry'\n`,
  'src/router.ts': routerFile,
  'src/routes/__root.tsx': rootDocument(),
  'src/internal.ts': `import { createServerFn } from '@tanstack/react-start'
export const internal = createServerFn().handler(() => 'MARK_INTERNAL')
`,
  'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { internal } from './internal'
export const greet = createServerFn().handler(async () => 'MARK_GREET:' + (await internal()))
export const internalUrl = createServerFn().handler(() => internal.url as string)
`,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { greet, internalUrl } from '../fns'
export const Route = createFileRoute('/')({ component: Page })
function Page() {
  const [text, setText] = useState('idle')
  const probe = async () => {
    const url = await internalUrl()
    // The public caller supplies the real request envelope; only its URL
    // changes to the internal fn's (fetch uses the public .url unchanged).
    let outcome: string
    try {
      const value: unknown = await greet({ fetch: (_input, init) => fetch(url, init) })
      outcome = value instanceof Error ? String(value) : 'value:' + String(value)
    } catch (error) {
      outcome = String(error)
    }
    setText('greet=' + (await greet()) + ' internal=' + (outcome.includes('MARK_INTERNAL') ? 'leaked:' + outcome : 'refused'))
  }
  return <button data-testid="probe" onClick={probe}>{text}</button>
}
`,
}

const servers = {
  vite: async () => {
    const server = await startDevServer({ browser: true, files })
    return server.url!
  },
  rsbuild: async () => {
    const server = await startRsbuildStartDevServer({
      browser: true,
      config: { plugins: [pluginReact()] },
      files,
    })
    return server.url!
  },
}

describe.each(Object.keys(servers) as Array<keyof typeof servers>)(
  '%s dev',
  (bundler) => {
    test(
      'a server fn the page imports answers over HTTP; one only its handler calls is refused',
      async () => {
        const url = await servers[bundler]()
        const page = await openPage(url, { registerCleanup: onTestFinished })
        await page.waitForText('hydrated', {
          selector: '[data-testid=hydrated]',
        })
        await page.page.locator('[data-testid=probe]').click()
        await page.waitForText(/greet=/, { selector: '[data-testid=probe]' })
        expect(await page.text('[data-testid=probe]')).toBe(
          'greet=MARK_GREET:MARK_INTERNAL internal=refused',
        )
      },
      timeout,
    )
  },
)
