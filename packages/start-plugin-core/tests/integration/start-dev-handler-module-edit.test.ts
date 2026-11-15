/**
 * A server fn's lazy handler module in development (SSR as the provider,
 * R157): a declaration only the handler reads, whose evaluation reads state
 * its module keeps, stays in the module and runs at load (`snapshot`, read
 * before `set(cfg)` writes `cfg`). After an edit of that declaration, and
 * after an edit of the handler, server code (the route's loader, on the
 * server render) and a client call over HTTP both see the edited code, with
 * the value the source gives. On Vite's and Rsbuild's dev servers.
 */
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { waitForOutcome } from '@tanstack/compiler-test-utils/outcome'
import { pluginReact } from '@rsbuild/plugin-react'
import { startDevServer } from '../dev-server'
import { startRsbuildStartDevServer } from '../rsbuild-dev-server'
import { rootDocument, routerFile } from './start-compose-app'

const timeout = 90_000

/** `src/fns.ts`: `pinned` is the pinned declaration's mark, `handler` the handler's. */
const fns = (pinned: string, handler: string) =>
  `import { createServerFn } from '@tanstack/react-start'
const cfg = { url: 'a' }
const snapshot = cfg.url + ':${pinned}'
function set(o: { url: string }) { o.url = 'b' }
set(cfg)
export const read = createServerFn().handler(() => snapshot + '/' + cfg.url + '/${handler}')
`

const files = {
  'harness/client-entry.ts': `import { createElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
hydrateRoot(document, createElement(StartClient))
`,
  'harness/server-entry.ts': `export { default } from '@tanstack/react-start/server-entry'\n`,
  'src/router.ts': routerFile,
  'src/routes/__root.tsx': rootDocument(),
  'src/fns.ts': fns('P1', 'H1'),
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { read } from '../fns'
export const Route = createFileRoute('/')({
  loader: () => read(),
  component: Page,
})
function Page() {
  const [text, setText] = useState('idle')
  return (
    <>
      <p data-testid="loader">{'loader=' + Route.useLoaderData()}</p>
      <button data-testid="probe" onClick={async () => setText('client=' + (await read()))}>{text}</button>
    </>
  )
}
`,
}

interface Served {
  url: string
  edit: (files: Record<string, string>) => Promise<unknown>
}

const servers: Record<string, () => Promise<Served>> = {
  vite: async () => {
    const server = await startDevServer({ browser: true, files })
    return { url: server.url!, edit: (f) => server.edit(f) }
  },
  rsbuild: async () => {
    const server = await startRsbuildStartDevServer({
      browser: true,
      config: { plugins: [pluginReact()] },
      files,
    })
    return { url: server.url!, edit: (f) => server.edit(f) }
  },
}

describe.each(Object.keys(servers))('%s dev', (bundler) => {
  test(
    'edits of a pinned declaration and of the handler reach server code and HTTP calls',
    async () => {
      const server = await servers[bundler]!()
      /** The server render's loader value, once it is `expected`. */
      const rendered = async (expected: string) => {
        let last = ''
        await waitForOutcome({
          applied: async () =>
            (last = await (await fetch(server.url)).text()).includes(
              `loader=${expected}`,
            ),
          timeout: 10_000,
          describe: () => `the server render: ${last.slice(0, 400)}`,
        })
      }
      /** What a client call over HTTP gives, from a fresh page. */
      const called = async () => {
        const page = await openPage(server.url, {
          registerCleanup: onTestFinished,
        })
        await page.waitForText('hydrated', {
          selector: '[data-testid=hydrated]',
        })
        await page.page.locator('[data-testid=probe]').click()
        await page.waitForText(/client=/, { selector: '[data-testid=probe]' })
        return page.text('[data-testid=probe]')
      }

      await rendered('a:P1/b/H1')
      expect(await called()).toBe('client=a:P1/b/H1')

      await server.edit({ 'src/fns.ts': fns('P2', 'H1') })
      await rendered('a:P2/b/H1')
      expect(await called()).toBe('client=a:P2/b/H1')

      await server.edit({ 'src/fns.ts': fns('P2', 'H2') })
      await rendered('a:P2/b/H2')
      expect(await called()).toBe('client=a:P2/b/H2')
    },
    timeout,
  )
})
