/**
 * The client's route tree leaves out server-only routes (SPEC J2.15); a
 * pathless layout whose only route below it was server-only owns no URL in
 * it, so it is ordered before the index route beside it as the generator
 * orders such a layout (SPEC J1.15: the index route is the page at `/`).
 * Otherwise the client router matched the layout at `/` where the server
 * rendered the index route: a hydration error, and the layout on the page.
 * In a built app and in dev, where the server-only route is deleted and
 * created again; one level of layouts and two.
 * Source: external review of #8817 (D-d4, design-routeset-v5.md §2.3 and
 * v5.1 item 3).
 */
import { describe, expect, test } from 'vitest'
import { openTestPage } from '../../test-close'
import { buildStart } from '../../build-harness'
import { rsbuildEntries } from '../route-css-cases'
import {
  handlerRoute,
  openTab,
  pageRoute,
  startReloadServer,
} from './route-set-reload-app'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'

const timeout = 60_000

const root = `import { HeadContent, Link, Outlet, Scripts, createRootRoute, useHydrated } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Root })
function Root() {
  const hydrated = useHydrated()
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <nav>
          <Link to="/" data-testid="to-index">index</Link>
          <Link to="/z" data-testid="to-z">z</Link>
        </nav>
        <div id="app"><Outlet /></div>
        <span data-testid="hydrated">{hydrated ? 'hydrated' : 'hydrating'}</span>
        <Scripts />
      </body>
    </html>
  )
}
`

const layout = (id: string, marker: string) =>
  `import { Outlet, createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('${id}')({ component: () => <section>${marker}<Outlet /></section> })
`

/** `/` and `/z`, a pathless layout `_a` whose only route below it is server-only (one level, or under `_a._b`). */
const fixtures = {
  'one level': {
    'src/routes/_a.tsx': layout('/_a', 'MARK_LAYOUT_A'),
    'src/routes/_a.ping.tsx': handlerRoute('/_a/ping', 'PONG'),
  },
  nested: {
    'src/routes/_a.tsx': layout('/_a', 'MARK_LAYOUT_A'),
    'src/routes/_a._b.tsx': layout('/_a/_b', 'MARK_LAYOUT_B'),
    'src/routes/_a._b.ping.tsx': handlerRoute('/_a/_b/ping', 'PONG'),
  },
}
const serverOnlyFile = {
  'one level': 'src/routes/_a.ping.tsx',
  nested: 'src/routes/_a._b.ping.tsx',
} as const

const appFiles = (fixture: keyof typeof fixtures) => ({
  'src/routes/__root.tsx': root,
  'src/routes/index.tsx': pageRoute('/', 'MARK_INDEX'),
  'src/routes/z.tsx': pageRoute('/z', 'MARK_Z'),
  ...fixtures[fixture],
})

/** `/` shows the index route after hydration and after navigating home from `/z`, with no error. */
async function homeIsTheIndex(browser: BrowserPage) {
  await browser.waitForText('hydrated', { selector: '[data-testid=hydrated]' })
  expect(await browser.text('#app')).toBe('MARK_INDEX')
  await browser.page.locator('[data-testid=to-z]').click()
  await browser.waitForText('MARK_Z', { selector: '#app' })
  await browser.page.locator('[data-testid=to-index]').click()
  await browser.waitForText('MARK_INDEX', { selector: '#app' })
  expect(await browser.text('#app')).toBe('MARK_INDEX')
  expect(browser.errors).toEqual([])
}

describe.each(['one level', 'nested'] as const)('%s', (fixture) => {
  test(
    'a built app: `/` is the index route',
    async () => {
      const build = await buildStart({
        bundler: 'rsbuild',
        files: { ...rsbuildEntries, ...appFiles(fixture) },
      })
      const { url } = await build.preview()
      await homeIsTheIndex(await openTestPage(new URL('/', url).href))
    },
    timeout,
  )

  test(
    'dev: `/` is the index route, after the server-only route is deleted and after it is created again',
    async () => {
      const reload = await startReloadServer({
        files: { 'src/routes/about.tsx': null, ...appFiles(fixture) },
      })
      await homeIsTheIndex((await openTab(reload, '/')).browser)
      const file = serverOnlyFile[fixture]
      const serverOnly =
        fixtures[fixture][file as keyof (typeof fixtures)[typeof fixture]]
      await reload.server.edit({ [file]: null })
      await homeIsTheIndex((await openTab(reload, '/')).browser)
      await reload.server.edit({ [file]: serverOnly })
      await homeIsTheIndex((await openTab(reload, '/')).browser)
    },
    timeout,
  )
})
