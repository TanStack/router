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
import { describe, it } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'
import type { TargetFramework } from '../route-app'
import type { TestContext } from 'vitest'

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
  describe.concurrent.each(['react', 'solid', 'vue'] as const)(
    `${bundler} %s: a lazy route component whose import failed, saved while it still fails`,
    (target) => {
      it.for(['a navigation back', 'router.invalidate()'] as const)(
        'imports again at %s once the service answers',
        { timeout },
        async (retry, { expect, onTestFinished }: TestContext) => {
          const app = await openRouteHmrPage({
            bundler,
            target,
            onTestFinished,
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
