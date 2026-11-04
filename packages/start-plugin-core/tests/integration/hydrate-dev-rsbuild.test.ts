/**
 * The edit rows of hydrate-dev.test.ts (SPEC J5.2, G10) on
 * Start's Rsbuild dev server, seen from a real browser page: React Refresh
 * from `@rsbuild/plugin-react`, Solid's hot updates from
 * `@rsbuild/plugin-solid` (with `@rsbuild/plugin-babel`, configured like a
 * Solid Start app, `solidAppConfig`). Its own file so that each bundler's
 * dev servers run in a worker of their own.
 */
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { pluginReact } from '@rsbuild/plugin-react'
import {
  reportedErrors,
  startRsbuildStartDevServer,
} from '../rsbuild-dev-server'
import {
  editLoadedChild,
  expectEditsReached,
  expectRouteBoundaryCounts,
  reactApp,
  reactWidgets,
  solidApp,
  solidRouteWithBoundary,
  solidWidgets,
} from './hydrate-dev-edits'
import { solidAppConfig } from './hydrate-pages'

const timeout = 60_000

describe('Rsbuild dev', () => {
  test(
    'React: a loaded child hot-updates in place, and a sibling opened later shows the edited version',
    async () => {
      const server = await startRsbuildStartDevServer({
        hmr: true,
        browser: true,
        // Start serves the pages, not an HTML template.
        config: { tools: { htmlPlugin: false }, plugins: [pluginReact()] },
        files: {
          ...reactApp,
          'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { Widgets } from '../widgets'
export const Route = createFileRoute('/')({ component: Widgets })
`,
          'src/widgets.tsx': reactWidgets('<i>v1</i>', 'capture-v1'),
        },
      })
      expect(reportedErrors(server)).toEqual([])
      const browser = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      await browser.waitForText('hydrated', {
        selector: '[data-testid=hydrated]',
      })
      expectEditsReached(await editLoadedChild(server, browser, reactWidgets))
      expect(reportedErrors(server)).toEqual([])
      expect(browser.loads()).toBe(1)
      expect(browser.errors).toEqual([])
    },
    timeout,
  )

  test(
    'Solid: a loaded child hot-updates in place, and a sibling opened later shows the edited version',
    async () => {
      const server = await startRsbuildStartDevServer({
        framework: 'solid',
        hmr: true,
        browser: true,
        config: {
          ...solidAppConfig.rsbuildConfig,
          // Start serves the pages, not an HTML template.
          tools: { htmlPlugin: false },
        },
        files: {
          ...solidApp,
          'src/widgets.tsx': solidWidgets('<i>v1</i>', 'capture-v1'),
        },
      })
      expect(reportedErrors(server)).toEqual([])
      const browser = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      await browser.waitForText('hydrated', {
        selector: '[data-testid=hydrated]',
      })
      expectEditsReached(await editLoadedChild(server, browser, solidWidgets))
      expect(reportedErrors(server)).toEqual([])
      expect(browser.loads()).toBe(1)
      expect(browser.errors).toEqual([])
    },
    timeout,
  )

  // Rspack hot-updates the modules whose build output changed: the edit
  // changes the boundary's module only, so the route (its loader) stays as is.
  test(
    'React: an edit inside a boundary of a route component updates the boundary without refreshing the route',
    async () => {
      const route = (
        text: string,
      ) => `import { createFileRoute } from '@tanstack/react-router'
import { Hydrate } from '@tanstack/react-start'
import { visible } from '@tanstack/react-start/hydration'
export const Route = createFileRoute('/')({
  loader: () => {
    const page = globalThis as any
    page.__loads = (page.__loads ?? 0) + 1
    return 'data'
  },
  component: Home,
})
function Home() {
  return <section><Hydrate when={visible()}><p data-testid="deferred">{'${text}'}</p></Hydrate></section>
}
`
      const server = await startRsbuildStartDevServer({
        hmr: true,
        browser: true,
        // Start serves the pages, not an HTML template.
        config: { tools: { htmlPlugin: false }, plugins: [pluginReact()] },
        files: { ...reactApp, 'src/routes/index.tsx': route('deferred-v1') },
      })
      expect(reportedErrors(server)).toEqual([])
      const browser = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      await browser.waitForText('hydrated', {
        selector: '[data-testid=hydrated]',
      })
      await browser.waitForText('deferred-v1', {
        selector: '[data-testid=deferred]',
      })
      const loads = () =>
        browser.page.evaluate(() => (globalThis as any).__loads ?? 0)
      const before = await loads()
      await server.edit({ 'src/routes/index.tsx': route('deferred-v2') })
      await browser.waitForText('deferred-v2', {
        selector: '[data-testid=deferred]',
      })
      // a route refresh would have started with the hot update
      await browser.page.waitForTimeout(500)
      expect({
        loads: await loads(),
        pageLoads: browser.loads(),
        errors: browser.errors,
      }).toEqual({ loads: before, pageLoads: 1, errors: [] })
    },
    timeout,
  )

  // A boundary in the split route component itself: the route's chunk is
  // split again, and each module still gets Solid's JSX transform.
  test(
    'Solid: a boundary written in a split route component loads on a click, hydrates and counts',
    async () => {
      const server = await startRsbuildStartDevServer({
        framework: 'solid',
        hmr: true,
        browser: true,
        config: {
          ...solidAppConfig.rsbuildConfig,
          // Start serves the pages, not an HTML template.
          tools: { htmlPlugin: false },
        },
        files: { ...solidApp, ...solidRouteWithBoundary },
      })
      expect(reportedErrors(server)).toEqual([])
      const browser = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      await expectRouteBoundaryCounts(browser)
      expect(reportedErrors(server)).toEqual([])
    },
    timeout,
  )
})
