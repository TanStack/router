/**
 * Route HMR of one save that changes a loader's data shape and the
 * component reading it (SPEC J3.3), in a client-only app: every save shows,
 * in the document the page loaded. Each version's loader data has another
 * shape, which only that version's component reads: a component of one
 * version rendering the other's data throws. Shared rows of
 * route-hmr-browser-shape-change.test.ts (Vite) and `-rsbuild.test.ts`.
 */
import { describe } from 'vitest'
import { it } from '../test'

type Bundler = 'vite' | 'rsbuild'

/** React: a counter in the component, whose state the edit may keep or not. */
const reactRoute = (n: number, loader: 'sync' | 'async') =>
  `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
export const Route = createFileRoute('/')({
  loader: ${loader === 'async' ? 'async ' : ''}() => ({ k${n}: { text: 'v${n}' } }),
  component: Page,
})
function Page() {
  const [count, setCount] = useState(0)
  const data: any = Route.useLoaderData()
  return <button onClick={() => setCount(count + 1)}>shape {data.k${n}.text} count {count}</button>
}
`

const route = (target: 'solid' | 'vue', n: number, errorComponent: boolean) => {
  const options = `{
  loader: () => ({ k${n}: { text: 'v${n}' } }),
  component: Page,${errorComponent ? `\n  errorComponent: () => <p>route error</p>,` : ''}
}`
  return target === 'vue'
    ? `import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
const Page = defineComponent({
  setup: () => {
    const data: any = Route.useLoaderData()
    return () => <p>shape {data.value.k${n}.text}</p>
  },
})
export const Route = createFileRoute('/')(${options})
`
    : `import { createFileRoute } from '@tanstack/solid-router'
export const Route = createFileRoute('/')(${options})
function Page() {
  const data: any = Route.useLoaderData()
  return <p>shape {data().k${n}.text}</p>
}
`
}

export function shapeChangeSuite(bundler: Bundler) {
  describe(`${bundler} react: one save changing a loader's data shape and the component reading it`, () => {
    it.for([
      { loader: 'sync', autoCodeSplitting: true },
      { loader: 'async', autoCodeSplitting: true },
      { loader: 'sync', autoCodeSplitting: false },
    ] as const)(
      'shows each save in place ($loader loader, autoCodeSplitting: $autoCodeSplitting)',
      async ({ loader, autoCodeSplitting }, { expect, openRouteHmrPage }) => {
        const app = await openRouteHmrPage({
          bundler,
          pluginOptions: { autoCodeSplitting },
          files: { 'routes/index.tsx': reactRoute(1, loader) },
          ready: 'shape v1 count 0',
        })
        await app.click('button')
        await app.page.waitForText('shape v1 count 1', { selector: '#app' })
        for (const n of [2, 3, 4]) {
          await app.edit(
            { 'routes/index.tsx': reactRoute(n, loader) },
            new RegExp(`^shape v${n} count \\d$`),
          )
          // (the count is the state of a component that threw rendering
          // the other version's data: it starts again)
          expect({
            text: await app.page.text('#app'),
            loads: app.loads(),
          }).toEqual({ text: `shape v${n} count 0`, loads: 1 })
        }
      },
    )
  })

  describe.each(['solid', 'vue'] as const)(
    `${bundler} %s: one save changing a loader's data shape and the component reading it`,
    (target) => {
      it.for([
        { autoCodeSplitting: true, errorComponent: false },
        { autoCodeSplitting: true, errorComponent: true },
        { autoCodeSplitting: false, errorComponent: false },
      ])(
        'shows each save in place (autoCodeSplitting: $autoCodeSplitting, route error component: $errorComponent)',
        async (
          { autoCodeSplitting, errorComponent },
          { expect, openRouteHmrPage },
        ) => {
          const app = await openRouteHmrPage({
            bundler,
            target,
            pluginOptions: { autoCodeSplitting },
            files: { 'routes/index.tsx': route(target, 1, errorComponent) },
            ready: 'shape v1',
          })
          for (const n of [2, 3, 4]) {
            await app.edit(
              { 'routes/index.tsx': route(target, n, errorComponent) },
              `shape v${n}`,
            )
            expect({
              text: await app.page.text('#app'),
              loads: app.loads(),
            }).toEqual({ text: `shape v${n}`, loads: 1 })
          }
        },
      )
    },
  )
}
