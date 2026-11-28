/**
 * SPEC J4.4: a server fn called from the client runs its own handler. The
 * provider exports one wrapper per server fn, and the client's call reaches
 * it by the id the client printed. Here a top-level server fn's name
 * (`fn_1`) is also what the provider derives for an unnamed server fn of
 * an array (the second of two): the client still calls the top-level fn. On Vite's and Rsbuild's
 * dev servers (the server renders the page first, so it compiles the file
 * before the client) and in their builds, served like a deployed app.
 */
import { beforeAll, describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { pluginReact } from '@rsbuild/plugin-react'
import { buildStartShared } from '../build-harness'
import { startDevServer } from '../dev-server'
import { startRsbuildStartDevServer } from '../rsbuild-dev-server'
import {
  openAppPage,
  pageEntries,
  rootDocument,
  routerFile,
  serveStartBuildShared,
  startPageEntries,
} from './start-compose-app'

const timeout = 60_000

const app = {
  'src/router.ts': routerFile,
  'src/routes/__root.tsx': rootDocument(),
  'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const listed = [
  createServerFn().handler(() => 'MARK_NESTED_A'),
  createServerFn().handler(() => 'MARK_NESTED_B'),
]
export const fn_1 = createServerFn().handler(() => 'MARK_TOP')
`,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { fn_1, listed } from '../fns'
export const Route = createFileRoute('/')({ component: Page })
function Page() {
  const [text, setText] = useState('idle')
  const probe = async () => setText('fn_1=' + (await fn_1().then(String, String)) + ' listed=' + listed.length)
  return <button data-testid="probe" onClick={probe}>{text}</button>
}
`,
}

const devFiles = {
  ...app,
  'harness/client-entry.ts': `import { createElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
hydrateRoot(document, createElement(StartClient))
`,
  'harness/server-entry.ts': `export { default } from '@tanstack/react-start/server-entry'\n`,
}

const devServers: Record<string, () => Promise<string>> = {
  vite: async () =>
    (await startDevServer({ browser: true, files: devFiles })).url!,
  rsbuild: async () =>
    (
      await startRsbuildStartDevServer({
        browser: true,
        config: { plugins: [pluginReact()] },
        files: devFiles,
      })
    ).url!,
}

async function probe(page: {
  page: { locator: (selector: string) => { click: () => Promise<void> } }
  waitForText: (text: RegExp, options: { selector: string }) => Promise<unknown>
  text: (selector: string) => Promise<string>
}) {
  await page.page.locator('[data-testid=probe]').click()
  await page.waitForText(/fn_1=/, { selector: '[data-testid=probe]' })
  return page.text('[data-testid=probe]')
}

describe.each(Object.keys(devServers))('%s dev', (bundler) => {
  test(
    'the client calls the top-level server fn, not the hoisted one the provider named alike',
    async () => {
      const url = await devServers[bundler]!()
      const page = await openPage(url, { registerCleanup: onTestFinished })
      await page.waitForText('hydrated', {
        selector: '[data-testid=hydrated]',
      })
      expect(await probe(page)).toBe('fn_1=MARK_TOP listed=2')
    },
    timeout,
  )
})

describe.each(['vite', 'rsbuild'] as const)('%s build', (bundler) => {
  let url: string

  beforeAll(async () => {
    const build = await buildStartShared({
      bundler,
      files: { ...startPageEntries, ...pageEntries, ...app },
      entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
    })
    url = (await serveStartBuildShared(build)).url
    return () => build.close()
  }, timeout)

  test(
    'the client calls the top-level server fn, not the hoisted one the provider named alike',
    async () => {
      const page = await openAppPage({ url }, '/')
      expect(await probe(page)).toBe('fn_1=MARK_TOP listed=2')
    },
    timeout,
  )
})
