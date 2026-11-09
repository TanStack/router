/**
 * Route HMR after a loader failed in the browser, on Start's Vite dev server
 * with each framework's own hot updates, in the apps of
 * start-dev-route-error-recovery (a root route that renders the document):
 * a loader error is the router's state, not a render error, so route edits
 * after it update in place, but for Vue's global boundary, which replaced
 * the document shell (`router._hmrReload`).
 */
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { startDevServer } from '../dev-server'
import { apps, index } from './route-error-apps'
import type { Framework } from './route-error-apps'

const timeout = 90_000

/** A route at `/fails`; `throwInBrowser`: its loader throws when it runs in the browser (a failing API, say). */
const failing = (
  framework: Framework,
  text: string,
  throwInBrowser: boolean,
  errorComponent: boolean,
) => {
  const loader = `loader: () => {
    ${throwInBrowser ? `if (typeof window !== 'undefined') throw new Error('loader-fails-in-browser')\n    ` : ''}return '${text}'
  }`
  const options = `{
  ${loader},
  component: Fails,${errorComponent ? `\n  errorComponent: () => <p data-probe="error">route-error</p>,` : ''}
}`
  return framework === 'vue'
    ? `import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
const Fails = defineComponent({
  setup: () => {
    const data = Route.useLoaderData()
    return () => <p data-probe="fails">{data.value}</p>
  },
})
export const Route = createFileRoute('/fails')(${options})
`
    : `import { createFileRoute } from '@tanstack/${framework}-router'
export const Route = createFileRoute('/fails')(${options})
function Fails() {
  const data = Route.useLoaderData()
  return <p data-probe="fails">{${framework === 'solid' ? 'data()' : 'data'}}</p>
}
`
}

describe('Vite dev, Start with a document shell: route edits after a loader failed', () => {
  // A loader error is the router's state, not a render error: the boundary
  // that shows it resets when the route loads again. Source: review of
  // 2026-11-09 (LK-2): after any loader failure the next route edit reloaded
  // the page.
  describe.each([
    ['a route error component', true],
    ['the global boundary', false],
  ] as const)('caught by %s', (_, errorComponent) => {
    test.each(['react', 'solid', 'vue'] as const)(
      '%s: an edit of another route updates in place, and an edit that fixes the loader shows the fix',
      async (framework) => {
        const app = apps[framework]
        const server = await startDevServer({
          ...app,
          start: {},
          browser: true,
          files: {
            ...app.files,
            'src/routes/index.tsx': index(framework, 'home-v1', false),
            'src/routes/fails.tsx': failing(
              framework,
              'fails-v1',
              true,
              errorComponent,
            ),
          },
        })
        const browser = await openPage(server.url!, {
          registerCleanup: onTestFinished,
        })
        await browser.waitForText('home-v1', {
          selector: '[data-probe=home]',
        })
        await browser.page.waitForFunction(
          () => (window as any).__TSR_ROUTER__ !== undefined,
        )
        await browser.page.evaluate(() =>
          (window as any).__TSR_ROUTER__.navigate({ to: '/fails' }),
        )
        await expect
          .poll(
            () =>
              browser.page.evaluate(() =>
                (window as any).__TSR_ROUTER__.stores.matches
                  .get()
                  .some((match: any) => match.status === 'error'),
              ),
            { timeout: 15_000 },
          )
          .toBe(true)
        if (errorComponent) {
          await browser.waitForText('route-error', {
            selector: '[data-probe=error]',
          })
        }
        await server.idle()

        await server.edit({
          'src/routes/index.tsx': index(framework, 'home-v2', false),
        })
        // Vue cannot render the document shell again once its global
        // boundary replaced it: route edits reload the page, as after a
        // render error
        const reloads = framework === 'vue' && !errorComponent
        if (reloads) {
          await expect.poll(() => browser.loads()).toBe(2)
          await browser.waitForText('fails-v1', {
            selector: '[data-probe=fails]',
          })
          await browser.page.waitForFunction(
            () => (window as any).__TSR_ROUTER__ !== undefined,
          )
        }
        await server.idle()
        await server.edit({
          'src/routes/fails.tsx': failing(
            framework,
            'fails-v2',
            false,
            errorComponent,
          ),
        })
        await browser.waitForText('fails-v2', {
          selector: '[data-probe=fails]',
          timeout: 20_000,
        })
        expect(browser.loads()).toBe(reloads ? 2 : 1)
      },
      timeout,
    )
  })
})
