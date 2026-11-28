/**
 * Route HMR in a client-only app after an edit made the route component
 * throw (SPEC J3.3, G10): the edit that fixes it shows in place, with or
 * without a route error component, split or not. (Only a hydrated root's
 * global boundary loses the document it renders: the Start rows.) Shared rows of
 * route-hmr-browser-throw-then-fix.test.ts (Vite) and `-rsbuild.test.ts`.
 */
import { describe } from 'vitest'
import { it } from '../test'
import type { TargetFramework } from '../route-app'

/** A route whose component throws when it renders (`throws`), or shows `text`. */
const route = (
  target: TargetFramework,
  text: string,
  throws: boolean,
  errorComponent: boolean,
) => {
  const options = `{ component: Page${errorComponent ? `, errorComponent: () => <p>route error</p>` : ''} }`
  const body = `${throws ? `throw new Error('page broke')\n  ` : ''}return <p>${text}</p>`
  return target === 'vue'
    ? `import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
const Page = defineComponent({
  setup: () => () => {
    ${body}
  },
})
export const Route = createFileRoute('/')(${options})
`
    : `import { createFileRoute } from '@tanstack/${target}-router'
export const Route = createFileRoute('/')(${options})
function Page() {
  ${body}
}
`
}

export function throwThenFixSuite(bundler: 'vite' | 'rsbuild') {
  describe.each(['react', 'solid', 'vue'] as const)(
    `${bundler} %s, client-only: an edit makes the route component throw, the next one fixes it`,
    (target) => {
      it.for([
        { autoCodeSplitting: true, errorComponent: false },
        { autoCodeSplitting: true, errorComponent: true },
        { autoCodeSplitting: false, errorComponent: false },
        { autoCodeSplitting: false, errorComponent: true },
      ])(
        'the fix shows in place (autoCodeSplitting: $autoCodeSplitting, route error component: $errorComponent)',
        async (
          { autoCodeSplitting, errorComponent },
          { expect, openRouteHmrPage },
        ) => {
          const app = await openRouteHmrPage({
            bundler,
            target,
            pluginOptions: { autoCodeSplitting },
            files: {
              'routes/index.tsx': route(
                target,
                'page v1',
                false,
                errorComponent,
              ),
            },
            ready: 'page v1',
          })
          // (the broken version shows the router's or the route's error UI)
          await app.edit(
            {
              'routes/index.tsx': route(
                target,
                'page v2',
                true,
                errorComponent,
              ),
            },
            errorComponent ? 'route error' : /error|wrong|broke/i,
          )
          await app.edit(
            {
              'routes/index.tsx': route(
                target,
                'page v3',
                false,
                errorComponent,
              ),
            },
            'page v3',
          )
          expect({
            text: await app.page.text('#app'),
            loads: app.loads(),
          }).toEqual({ text: 'page v3', loads: 1 })
        },
      )
    },
  )
}
