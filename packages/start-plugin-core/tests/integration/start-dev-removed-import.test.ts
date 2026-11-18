/**
 * A file a route reads, deleted and restored on Start's Vite dev server, in
 * a real page with each framework's own hot updates (`@vitejs/plugin-react`,
 * `vite-plugin-solid`). The deletion builds the route again at once, as any
 * change of what it read does (its compile records the missing import), so
 * a page that renders the route gets its update; the file's return builds it
 * again; edits after the return apply in place, without a reload. A route
 * transformed while one of its imports is missing used to be kept away
 * from that state (41ae553bbf: Vite then takes it for an update boundary no
 * more, so its split component would never be imported again); on Vite
 * 8.3.4 the next edits still apply in place. Source: Fable's review of the
 * missing-import experiment (a Solid delete, restore, edit row).
 */
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import {
  hmrSyncModule,
  settlePage,
  trackRequests,
} from '@tanstack/compiler-test-utils/hmr-sync'
import { startDevServer } from '../dev-server'
import { apps } from './route-error-apps'
import type { Framework } from './route-error-apps'

const timeout = 90_000

/**
 * `src/routes/index.tsx`, whose plan reads `src/dep.ts` (a server fn
 * builder): `kept`, its component renders `label` (the client output
 * imports the file); `erased`, only a server fn handler reads it (the
 * client output drops the import).
 */
const route = (framework: Framework, shape: 'kept' | 'erased', step: number) =>
  shape === 'kept'
    ? `import { createFileRoute } from '@tanstack/${framework}-router'
import { base, label } from '../dep'
const fn = base.handler(async () => 'x')
export const Route = createFileRoute('/')({ ssr: false, component: Home })
function Home() {
  void fn
  return <p data-probe="home">{label + ' step-${step}'}</p>
}
`
    : `import { createFileRoute } from '@tanstack/${framework}-router'
import { createServerFn } from '@tanstack/${framework}-start'
import { label } from '../dep'
const fn = createServerFn().handler(async () => label)
export const Route = createFileRoute('/')({ ssr: false, component: Home })
function Home() {
  void fn
  return <p data-probe="home">{'home step-${step}'}</p>
}
`
const dep = (framework: Framework, label: string) =>
  `import { createServerFn } from '@tanstack/${framework}-start'
export const base = createServerFn()
export const label = '${label}'
`

const open = async (framework: 'react' | 'solid', shape: 'kept' | 'erased') => {
  const app = apps[framework]
  const server = await startDevServer({
    ...app,
    start: {},
    browser: true,
    files: {
      ...app.files,
      'src/router.ts': `${app.files['src/router.ts']}import './hmr-sync'\n`,
      'src/hmr-sync.ts': hmrSyncModule,
      'src/dep.ts': dep(framework, 'DEP_FIRST'),
      'src/routes/index.tsx': route(framework, shape, 1),
    },
  })
  const browser = await openPage(server.url!, {
    registerCleanup: onTestFinished,
  })
  const inFlight = trackRequests(browser)
  await browser.waitForText('step-1', { selector: '[data-probe=home]' })
  await settlePage(server, browser, inFlight)
  const settle = () => settlePage(server, browser, inFlight)
  /** Edits the route to `step` and waits for the page to show it; returns the page loads it took. */
  const editRoute = async (step: number) => {
    const loads = browser.loads()
    await server.edit({ 'src/routes/index.tsx': route(framework, shape, step) })
    await browser.waitForText(`step-${step}`, {
      selector: '[data-probe=home]',
      timeout: 10_000,
    })
    await settle()
    return browser.loads() - loads
  }
  return { server, browser, settle, editRoute }
}

describe('Vite dev: a file a route reads, deleted and restored', () => {
  // `restoreShows`: the page shows the restored file with the return's own
  // update. Solid does not (it shows the old label until the next edit):
  // after the route was built with its import missing, the return's update
  // goes to the route module rather than its split component, and Solid's
  // route component stays the one it holds. Head reaches the same state
  // when the route is edited while the file is missing.
  test.each([
    ['react', true],
    ['solid', false],
  ] as const)(
    '%s, an import the component renders: edits after the return apply in place',
    async (framework, restoreShows) => {
      const { server, browser, settle, editRoute } = await open(
        framework,
        'kept',
      )
      await server.edit({ 'src/dep.ts': null })
      await settle()
      const loads = browser.loads()
      await server.edit({ 'src/dep.ts': dep(framework, 'DEP_BACK') })
      await settle()
      if (restoreShows) {
        await browser.waitForText('DEP_BACK step-1', {
          selector: '[data-probe=home]',
        })
      }
      expect(browser.loads() - loads).toBe(0)
      expect(await editRoute(2)).toBe(0)
      expect(await browser.text('[data-probe=home]')).toBe('DEP_BACK step-2')
      expect(await editRoute(3)).toBe(0)
      expect(await browser.page.locator('vite-error-overlay').count()).toBe(0)
    },
    timeout,
  )

  test.each(['react', 'solid'] as const)(
    '%s, an import only a server fn handler reads: a file created meanwhile sends nothing, edits after the return apply in place',
    async (framework) => {
      const { server, browser, settle, editRoute } = await open(
        framework,
        'erased',
      )
      const loads = browser.loads()
      await server.edit({ 'src/dep.ts': null })
      await settle()
      expect(
        (await server.edit({ 'src/other.ts': 'export const x = 1\n' })).filter(
          (m) => m.type !== 'custom',
        ),
      ).toEqual([])
      await server.edit({ 'src/dep.ts': dep(framework, 'DEP_BACK') })
      await settle()
      expect(browser.loads() - loads).toBe(0)
      expect(await editRoute(2)).toBe(0)
      expect(await editRoute(3)).toBe(0)
      expect(await browser.page.locator('vite-error-overlay').count()).toBe(0)
    },
    timeout,
  )
})
