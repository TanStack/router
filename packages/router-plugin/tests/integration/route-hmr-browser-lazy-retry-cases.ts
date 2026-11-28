/**
 * A route whose component is the app's own `lazyRouteComponent`, whose
 * importer first fetches a configuration the service cannot answer yet
 * (the dev server's page comes back, which is no JSON), so the route shows
 * its error component. A save of the route file while the service is still
 * down hot-updates the route; once the service answers, the router's next
 * load of the route (a navigation back, or `router.invalidate()`, which an
 * error component's "Try Again" calls) imports again and shows the view, as
 * without the save (review of the route HMR implementation, 11-23: the
 * runtime had dropped the wrapper's `preload` after a failed hot import).
 * Shared rows of route-hmr-browser-lazy-retry.test.ts (Vite) and
 * `-rsbuild.test.ts`.
 */
import { describe } from 'vitest'
import { it } from '../test'
import type { TargetFramework } from '../route-app'

const timeout = 90_000

const route = (target: TargetFramework, version: number) =>
  `import { createFileRoute, lazyRouteComponent } from '@tanstack/${target}-router'
export const Route = createFileRoute('/')({
  component: lazyRouteComponent(async () => {
    // (the dev server answers its page until the service does: no JSON)
    await (await fetch('/page-config.json?v=${version}')).json()
    return import('../view')
  }),
  errorComponent: () => <p>config error</p>,
})
`

const view: Record<TargetFramework, string> = {
  react: `export default function View() {
  return <p>the view</p>
}
`,
  solid: `export default function View() {
  return <p>the view</p>
}
`,
  vue: `import { defineComponent } from 'vue'
export default defineComponent({ setup: () => () => <p>the view</p> })
`,
}

const away = (target: TargetFramework) =>
  `import { createFileRoute } from '@tanstack/${target}-router'
export const Route = createFileRoute('/away')({ component: () => <p>away</p> })
`

export function lazyRetrySuite(bundler: 'vite' | 'rsbuild') {
  describe.each(['react', 'solid', 'vue'] as const)(
    `${bundler} %s: a lazy route component whose import failed, saved while it still fails`,
    (target) => {
      it.for(['a navigation back', 'router.invalidate()'] as const)(
        'imports again at %s once the service answers',
        { timeout },
        async (retry, { expect, openRouteHmrPage }) => {
          const app = await openRouteHmrPage({
            bundler,
            target,
            // (split, the app's wrapper renders inside the compiler's,
            // which the router's load does not import again: oracle
            // KNOWN-BUGS.md, "Accepted limits")
            pluginOptions: { autoCodeSplitting: false },
            files: {
              'routes/index.tsx': route(target, 1),
              'routes/away.tsx': away(target),
              'view.tsx': view[target],
            },
            ready: 'config error',
          })
          await app.edit(
            { 'routes/index.tsx': route(target, 2) },
            'config error',
          )
          if (retry === 'a navigation back') {
            await app.evaluate(
              `void window.__APP_ROUTER__.navigate({ to: '/away' })`,
            )
            await app.page.waitForText('away', { selector: '#app' })
          }
          // the service answers from now on
          await app.page.page.route('**/page-config.json*', (request) =>
            request.fulfill({ status: 200, body: '{}' }),
          )
          await app.evaluate(
            retry === 'a navigation back'
              ? `void window.__APP_ROUTER__.navigate({ to: '/' })`
              : `void window.__APP_ROUTER__.invalidate()`,
          )
          await app.page.waitForText('the view', { selector: '#app' })
          expect(app.loads()).toBe(1)
        },
      )
    },
  )
}

/** A loaded route `/item` whose lazy component fetches its configuration (`v=<version>`) first. */
const item = (target: TargetFramework, version: number) =>
  `import { createFileRoute, lazyRouteComponent } from '@tanstack/${target}-router'
export const Route = createFileRoute('/item')({
  component: lazyRouteComponent(async () => {
    await (await fetch('/page-config.json?v=${version}')).json()
    return import('../view')
  }),
  pendingMs: 0,
  pendingMinMs: 800,
  pendingComponent: () => <p>loading item</p>,
})
`

const home = (target: TargetFramework) =>
  `import { createFileRoute } from '@tanstack/${target}-router'
export const Route = createFileRoute('/')({ component: () => <p>home</p> })
`

export function overlappingFailuresSuite(bundler: 'vite' | 'rsbuild') {
  describe.each(['react', 'solid', 'vue'] as const)(
    `${bundler} %s: a loaded lazy route component, two saves whose imports both fail`,
    (target) => {
      it(
        'shows the component again without its pending component (review of the implementation, Astra re-check P2)',
        { timeout },
        async ({ expect, openRouteHmrPage }) => {
          const app = await openRouteHmrPage({
            bundler,
            target,
            pluginOptions: { autoCodeSplitting: false },
            files: {
              'routes/index.tsx': home(target),
              'routes/item.tsx': item(target, 1),
              'view.tsx': view[target],
            },
            ready: 'home',
          })
          // the service answers the first version; it is slow, then down, for
          // the two saves': each answers when released
          const releases = new Map<string, () => void>()
          const released = (version: string) =>
            new Promise<void>((resolve) => releases.set(version, resolve))
          const waits = { '2': released('2'), '3': released('3') }
          await app.page.page.route('**/page-config.json*', async (request) => {
            const version = new URL(request.request().url()).searchParams.get(
              'v',
            )!
            if (version === '1') {
              return request.fulfill({ status: 200, body: '{}' })
            }
            await waits[version as '2' | '3']
            return request.fulfill({ status: 503, body: 'Service Unavailable' })
          })
          const navigate = (to: string) =>
            app.evaluate(`void window.__APP_ROUTER__.navigate({ to: '${to}' })`)
          await navigate('/item')
          await app.page.waitForText('the view', { selector: '#app' })
          await navigate('/')
          await app.page.waitForText('home', { selector: '#app' })
          // two saves, each importing again while the service is slow (each
          // edit's outcome waits for its request)
          const edits: Array<Promise<unknown>> = []
          for (const version of [2, 3]) {
            const requested = app.page.page.waitForRequest((request) =>
              request.url().includes(`page-config.json?v=${version}`),
            )
            edits.push(
              app.edit({ 'routes/item.tsx': item(target, version) }, 'home'),
            )
            await requested
          }
          // the newest fails first, then the older one
          for (const version of ['3', '2']) {
            const answered = app.page.page.waitForResponse((response) =>
              response.url().includes(`page-config.json?v=${version}`),
            )
            releases.get(version)!()
            await answered
          }
          await Promise.all(edits)
          const shown = await app.evaluate<Array<string>>(`(async () => {
  const root = document.querySelector('#app')
  const texts = [root.textContent]
  const observer = new MutationObserver(() => {
    if (texts.at(-1) !== root.textContent) texts.push(root.textContent)
  })
  observer.observe(root, { subtree: true, childList: true, characterData: true })
  await window.__APP_ROUTER__.navigate({ to: '/item' })
  await new Promise((resolve) => setTimeout(resolve, 50))
  observer.disconnect()
  return texts
})()`)
          expect(shown).not.toContain('loading item')
          expect(shown.at(-1)).toBe('the view')
          expect(app.loads()).toBe(1)
        },
      )
    },
  )
}
