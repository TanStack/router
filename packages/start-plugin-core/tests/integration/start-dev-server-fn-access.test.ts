/**
 * SPEC J4.2 in development (R44): the dev server compiles lazily, so a
 * server function no client module in its graph references is answered,
 * with one warning per function naming it and saying a production build
 * refuses it (known-bugs-start-compiler.test.ts "not callable over HTTP").
 * On Vite's and Rsbuild's dev servers: a page calls a server fn it imports,
 * then asks the server for the public URL of a server fn only that fn's
 * handler calls and requests it twice with the exposed fn's own request
 * envelope: both answer; the dev server warned once, naming the file.
 */
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { pluginReact } from '@rsbuild/plugin-react'
import { startDevServer } from '../dev-server'
import { startRsbuildStartDevServer } from '../rsbuild-dev-server'
import { rootDocument, routerFile } from './start-compose-app'
import type { ChannelDiagnostic } from '@tanstack/compiler-test-utils/diagnostic-channel'

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
    const call = () => greet({ fetch: (_input, init) => fetch(url, init) }).then(String, String)
    setText('greet=' + (await greet()) + ' internal=' + (await call()) + ',' + (await call()))
  }
  return <button data-testid="probe" onClick={probe}>{text}</button>
}
`,
}

interface Served {
  url: string
  root: string
  diagnostics: Array<ChannelDiagnostic>
}

const servers: Record<string, () => Promise<Served>> = {
  vite: async () => {
    const server = await startDevServer({ browser: true, files })
    return {
      url: server.url!,
      root: server.root,
      diagnostics: server.diagnostics,
    }
  },
  rsbuild: async () => {
    const server = await startRsbuildStartDevServer({
      browser: true,
      config: { plugins: [pluginReact()] },
      files,
    })
    return {
      url: server.url!,
      root: server.root,
      diagnostics: server.diagnostics,
    }
  },
}

describe.each(Object.keys(servers))('%s dev', (bundler) => {
  test(
    'a server fn no client module references answers a client call, with one warning naming it',
    async () => {
      const server = await servers[bundler]!()
      const page = await openPage(server.url, {
        registerCleanup: onTestFinished,
      })
      await page.waitForText('hydrated', {
        selector: '[data-testid=hydrated]',
      })
      await page.page.locator('[data-testid=probe]').click()
      await page.waitForText(/greet=/, { selector: '[data-testid=probe]' })
      expect(await page.text('[data-testid=probe]')).toBe(
        'greet=MARK_GREET:MARK_INTERNAL internal=MARK_INTERNAL,MARK_INTERNAL',
      )
      expectDiagnostic(server.diagnostics, {
        severity: 'warning',
        file: 'src/internal.ts',
        root: server.root,
        times: 1,
      })
    },
    timeout,
  )
})
