import { pluginReact } from '@rsbuild/plugin-react'
import { describe, expect, test } from 'vitest'
import {
  openRscPage,
  startRscRsbuildDevServer,
  waitForHydration,
} from './rsc-app'
import { callFromPage } from './rsc-start-page'
import { route } from './rsc-start-hmr-page'

describe('Rsbuild dev: edits with a separate RSC provider (SPEC J3.6)', () => {
  // The Vite test above on Start's Rsbuild RSC layer, with React Refresh
  // from `@rsbuild/plugin-react`, in the same order in one session: editing
  // the handler makes the next call run the new code and the client output
  // never has it; editing the component then hot-updates the page, keeping
  // its state; no full reload either way, and the server fn still answers.
  // Source: #7618 (SPEC J3.6).
  test('a handler edit reaches the next call and a component edit hot-updates, keeping the state, without a full reload', async () => {
    const server = await startRscRsbuildDevServer({
      browser: true,
      hmr: true,
      config: { plugins: [pluginReact()] },
      files: { 'src/routes/index.tsx': route('MARK_HANDLER_V1', 'Page v1') },
    })
    expect(server.errors).toEqual([])
    const browser = await openRscPage(server, '/')
    await browser.waitForText('Page v1 MARK_HANDLER_V1')
    await waitForHydration(browser)
    await browser.page.locator('[data-testid=count]').click()
    await browser.page.locator('[data-testid=count]').click()
    await browser.waitForText('count 2')
    await callFromPage(browser, 'called Page v1 MARK_HANDLER_V1')

    // The handler
    await server.edit({
      'src/routes/index.tsx': route('MARK_HANDLER_V2', 'Page v1'),
    })
    expect(server.errors).toEqual([])
    await callFromPage(browser, 'called Page v1 MARK_HANDLER_V2')
    expect(browser.loads()).toBe(1)
    // The client's output of the route never has the handler (J4.12)
    const client = [
      ...Object.values(await server.outputs('client')),
      ...Object.values(await server.hotUpdates('client')),
    ].join('\n')
    expect(client).not.toContain('MARK_HANDLER_V2')

    // The component
    await server.edit({
      'src/routes/index.tsx': route('MARK_HANDLER_V2', 'Page v2'),
    })
    expect(server.errors).toEqual([])
    await browser.waitForText('Page v2', { selector: '[data-testid=text]' })
    expect(await browser.text('[data-testid=count]')).toBe('count 2')
    await callFromPage(browser, 'called Page v2 MARK_HANDLER_V2')

    expect(browser.loads()).toBe(1)
    expect(browser.errors).toEqual([])
  })

  // A module the route imports changes what the route reads of it: `base`
  // becomes a server fn builder, so the route's `getLabel` becomes a server
  // fn. The route is built again for the client (a stale dependent: no file
  // event of its own), in the compilation that the RSC coordinator starts
  // for the edit: the edit ends, the page takes the update without a full
  // reload, the client output no longer has the handler, and the call
  // reaches the server.
  // Source: F7-6 (Fable review 2026-11-10: Start and the coordinator both
  // started a client compilation for one edit).
  test('an edit that makes the import of a client module a server fn builder hot-updates the page once built', async () => {
    const plainBase = `export const base = { handler: (fn: () => string) => fn }\n`
    const builderBase = `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`
    const server = await startRscRsbuildDevServer({
      browser: true,
      hmr: true,
      config: { plugins: [pluginReact()] },
      files: {
        'src/lib/base.ts': plainBase,
        'src/routes/index.tsx': route(
          'MARK_HANDLER_V1',
          'Page v1',
          '../lib/base',
        ),
      },
    })
    expect(server.errors).toEqual([])
    const browser = await openRscPage(server, '/')
    await browser.waitForText('Page v1 MARK_HANDLER_V1')
    await waitForHydration(browser)
    expect(Object.values(await server.outputs('client')).join('\n')).toContain(
      'MARK_HANDLER_V1',
    )

    await server.edit({ 'src/lib/base.ts': builderBase })
    expect(server.errors).toEqual([])
    const client = [
      ...Object.values(await server.outputs('client')),
      ...Object.values(await server.hotUpdates('client')),
    ].join('\n')
    expect(client).not.toContain('MARK_HANDLER_V1')
    await callFromPage(browser, 'called Page v1 MARK_HANDLER_V1')
    expect(browser.loads()).toBe(1)
    expect(browser.errors).toEqual([])
  })

  // A route file created while the dev server is idle: the generator
  // publishes the new route list from its own watcher, before Rspack reports
  // the file, and the new route is built again in each environment. The
  // client's compilations are started by Rspack's RSC coordinator from the
  // server's: the dev server keeps compiling, and each later edit of the
  // page reaches it.
  // Source: Fable review of design 3 step 2, finding 1 (a client
  // compilation asked for beside the coordinator; observed: the compiles of
  // the route's creation never ended).
  test('edits after a route file is created reach the page', async () => {
    const server = await startRscRsbuildDevServer({
      browser: true,
      hmr: true,
      config: { plugins: [pluginReact()] },
      files: { 'src/routes/index.tsx': route('MARK_HANDLER', 'Page v1') },
    })
    expect(server.errors).toEqual([])
    const browser = await openRscPage(server, '/')
    await browser.waitForText('Page v1 MARK_HANDLER')
    await waitForHydration(browser)

    await server.edit({
      'src/routes/about.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/about')({ component: () => <p>about</p> })
`,
    })
    expect(server.errors).toEqual([])
    for (const text of ['Page v2', 'Page v3']) {
      await server.edit({
        'src/routes/index.tsx': route('MARK_HANDLER', text),
      })
      expect(server.errors).toEqual([])
      await browser.waitForText(text, { selector: '[data-testid=text]' })
    }
    expect(browser.errors).toEqual([])
  })
})
