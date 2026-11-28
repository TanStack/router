/**
 * A file a route reads, deleted and restored on Start's Vite dev server, in
 * a real page with each framework's own hot updates (`@vitejs/plugin-react`,
 * `vite-plugin-solid`). The deletion builds the route again at once, as any
 * change of what it read does (its compile records the missing import), so
 * a page that renders the route gets its update; the file's return builds it
 * again, and the page shows the restored file with that update; edits
 * after the return apply in place, without a reload. A route transformed
 * while one of its imports is missing used to be kept away from that state
 * (41ae553bbf: Vite then takes it for an update boundary no more, so its
 * split component would never be imported again); on Vite 8.3.4 the next
 * edits still apply in place. Solid: the return's update goes to the route
 * module alone, so solid-refresh never patches the split chunk the route
 * module imports again (it patches in the chunk's own accept callback): the
 * page reloads once there, when the route's lazy wrapper imports its chunk
 * again after the import failed (solid-router's `reloadOnRecover`, on
 * every host; main reloads too). Sources: Fable's review of the missing-import
 * experiment (a Solid delete, restore, edit row); Astra's round-4 route HMR
 * fact check (B3: Solid kept the old label until the next edit); Fable's
 * review of the restored-import fix (the edit of the restored file, the
 * component in another file).
 */
import { describe, expect, test } from 'vitest'
import {
  hmrSyncModule,
  settlePage,
  trackRequests,
} from '@tanstack/compiler-test-utils/hmr-sync'
import { openTestPage } from '../test-page'
import { startDevServer } from '../dev-server'
import { apps } from './route-error-apps'
import type { Framework } from './route-error-apps'

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
  const browser = await openTestPage(server.url!)
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

const plainDep = (label: string) => `export const label = '${label}'\n`

/**
 * The page loads the return takes when the route's lazy wrapper imported
 * its chunk while the file was missing (solid-router's
 * `reloadOnRecover`).
 */
const restoreReloads = { react: 0, solid: 1 }

describe('Vite dev: a file a route reads, deleted and restored', () => {
  test.each(['react', 'solid'] as const)(
    '%s, an import the component renders: the return shows the restored file, edits after it apply in place',
    async (framework) => {
      const { server, browser, settle, editRoute } = await open(
        framework,
        'kept',
      )
      await server.edit({ 'src/dep.ts': null })
      await settle()
      const loads = browser.loads()
      await server.edit({ 'src/dep.ts': dep(framework, 'DEP_BACK') })
      await settle()
      await browser.waitForText('DEP_BACK step-1', {
        selector: '[data-probe=home]',
      })
      expect(browser.loads() - loads).toBe(restoreReloads[framework])
      await settle()
      expect(await editRoute(2)).toBe(0)
      expect(await browser.text('[data-probe=home]')).toBe('DEP_BACK step-2')
      expect(await editRoute(3)).toBe(0)
      expect(await browser.page.locator('vite-error-overlay').count()).toBe(0)
    },
  )

  test.each(['react', 'solid'] as const)(
    '%s, an import the component renders: after the return, edits of the restored file apply in place',
    async (framework) => {
      const { server, browser, settle, editRoute } = await open(
        framework,
        'kept',
      )
      await server.edit({ 'src/dep.ts': null })
      await settle()
      const loads = browser.loads()
      await server.edit({ 'src/dep.ts': dep(framework, 'DEP_BACK') })
      await browser.waitForText('DEP_BACK step-1', {
        selector: '[data-probe=home]',
      })
      await settle()
      expect(browser.loads() - loads).toBe(restoreReloads[framework])
      const restored = browser.loads()
      for (const label of ['DEP_AFTER', 'DEP_AGAIN']) {
        await server.edit({ 'src/dep.ts': dep(framework, label) })
        await browser.waitForText(`${label} step-1`, {
          selector: '[data-probe=home]',
          timeout: 10_000,
        })
        await settle()
      }
      expect(await editRoute(2)).toBe(0)
      expect(await browser.text('[data-probe=home]')).toBe('DEP_AGAIN step-2')
      expect(browser.loads() - restored).toBe(0)
      expect(await browser.page.locator('vite-error-overlay').count()).toBe(0)
    },
  )

  // The component lives in `src/home.tsx`, which reads the file: the
  // deletion's update goes to that module (solid-refresh accepts it), so the
  // route's lazy wrapper imports nothing and nothing reloads. On Solid the
  // return then leaves the page one version behind until the next edit (the
  // same solid-refresh behaviour, outside what the route's wrapper sees;
  // not asserted): the next edit of the file shows.
  test.each(['react', 'solid'] as const)(
    '%s, the file read by the module of the route component: no reload, the next edit of the file shows',
    async (framework) => {
      const app = apps[framework]
      const server = await startDevServer({
        ...app,
        start: {},
        browser: true,
        files: {
          ...app.files,
          'src/router.ts': `${app.files['src/router.ts']}import './hmr-sync'\n`,
          'src/hmr-sync.ts': hmrSyncModule,
          'src/dep.ts': plainDep('DEP_FIRST'),
          'src/home.tsx': `import { label } from './dep'
export function Home() {
  return <p data-probe="home">{label}</p>
}
`,
          'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/${framework}-router'
import { Home } from '../home'
export const Route = createFileRoute('/')({ ssr: false, component: Home })
`,
        },
      })
      const browser = await openTestPage(server.url!)
      const inFlight = trackRequests(browser)
      await browser.waitForText('DEP_FIRST', { selector: '[data-probe=home]' })
      const settle = () => settlePage(server, browser, inFlight)
      await settle()
      const loads = browser.loads()
      await server.edit({ 'src/dep.ts': null })
      await settle()
      await server.edit({ 'src/dep.ts': plainDep('DEP_BACK') })
      await settle()
      if (framework === 'react') {
        await browser.waitForText('DEP_BACK', {
          selector: '[data-probe=home]',
        })
      }
      await server.edit({ 'src/dep.ts': plainDep('DEP_AFTER') })
      await browser.waitForText('DEP_AFTER', {
        selector: '[data-probe=home]',
        timeout: 10_000,
      })
      await settle()
      expect(browser.loads() - loads).toBe(0)
    },
  )

  // (the update of the return goes to the route module alone here too)
  test('solid, an import the component renders, the route edited while the file is missing: the return shows both, edits after it apply in place', async () => {
    const framework = 'solid'
    const { server, browser, settle, editRoute } = await open(framework, 'kept')
    await server.edit({ 'src/dep.ts': null })
    await settle()
    await server.edit({
      'src/routes/index.tsx': route(framework, 'kept', 2),
    })
    await settle()
    const loads = browser.loads()
    await server.edit({ 'src/dep.ts': dep(framework, 'DEP_BACK') })
    await settle()
    await browser.waitForText('DEP_BACK step-2', {
      selector: '[data-probe=home]',
    })
    expect(browser.loads() - loads).toBe(restoreReloads[framework])
    await settle()
    expect(await editRoute(3)).toBe(0)
    expect(await browser.text('[data-probe=home]')).toBe('DEP_BACK step-3')
    expect(await browser.page.locator('vite-error-overlay').count()).toBe(0)
  })

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
  )
})
