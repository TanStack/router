/**
 * Route HMR in Start apps whose root route renders the document
 * (`shellComponent`), on Vite dev: saves that each change a loader's data
 * shape and the component reading it (SPEC J3.3). The component of one
 * version rendering the other's data throws. Each save waits until the page
 * shows it and that version's client effect ran (the document hydrated).
 *
 * - With a route error component, which catches the throw: every save shows
 *   in place.
 * - React, only the router's global boundary: that boundary replaced the
 *   document, so the save reloads the page once and shows.
 * - Solid and Vue, only the global boundary: the save leaves the page blank
 *   or on the error, and the next save reloads and shows (oracle
 *   KNOWN-BUGS.md, "Accepted limits").
 *
 * Rsbuild: rsbuild/start-dev-route-shape-change.test.ts.
 */
import { describe, expect, test } from 'vitest'
import { openTestPage } from '../test-close'
import { startDevServer } from '../dev-server'
import { apps } from './route-error-apps'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'
import type { Framework } from './route-error-apps'

const timeout = 120_000

const effect: Record<Framework, (n: number) => [string, string]> = {
  react: (n) => [
    `import { useEffect } from 'react'\n`,
    `useEffect(() => { (window as any).__effect = ${n} }, [])`,
  ],
  solid: (n) => [
    `import { onMount } from 'solid-js'\n`,
    `onMount(() => { (window as any).__effect = ${n} })`,
  ],
  vue: (n) => [
    `import { onMounted } from 'vue'\n`,
    `onMounted(() => { (window as any).__effect = ${n} })`,
  ],
}

/** Version `n` of the index route: its loader data is `{ k<n>: { text } }`, which only its component reads. */
const index = (framework: Framework, n: number, errorComponent: boolean) => {
  const options = `{ loader: () => ({ k${n}: { text: 'home-v${n}' } }), component: Home${errorComponent ? `, errorComponent: () => <p data-probe="error">route-error</p>` : ''} }`
  const [imports, mounted] = effect[framework](n)
  return framework === 'vue'
    ? `import { defineComponent } from 'vue'
${imports}import { createFileRoute } from '@tanstack/vue-router'
const Home = defineComponent({
  setup: () => {
    ${mounted}
    const data: any = Route.useLoaderData()
    return () => <p data-probe="home">{data.value.k${n}.text}</p>
  },
})
export const Route = createFileRoute('/')(${options})
`
    : `${imports}import { createFileRoute } from '@tanstack/${framework}-router'
export const Route = createFileRoute('/')(${options})
function Home() {
  ${mounted}
  const data: any = Route.useLoaderData()
  return <p data-probe="home">{data${framework === 'solid' ? '()' : ''}.k${n}.text}</p>
}
`
}

/** Waits until the page shows version `n` and its client effect ran. */
async function shows(browser: BrowserPage, n: number) {
  await browser.waitForText(`home-v${n}`, {
    selector: '[data-probe=home]',
    timeout: 20_000,
  })
  await browser.page.waitForFunction((v) => (window as any).__effect === v, n)
}

/** How many of the page's errors so far report a component reading data of the other shape. */
const shapeErrors = (browser: BrowserPage) =>
  [...browser.errors, ...browser.console].filter((line) =>
    line.includes("reading 'text'"),
  ).length

describe.each([true, false])(
  'Vite dev, Start with a document shell, route error component: %s',
  (errorComponent) => {
    test.each(['react', 'solid', 'vue'] as const)(
      '%s: four saves that change the loader data shape and the component reading it',
      async (framework) => {
        const app = apps[framework]
        const server = await startDevServer({
          ...app,
          start: {},
          browser: true,
          files: {
            ...app.files,
            'src/routes/index.tsx': index(framework, 1, errorComponent),
          },
        })
        const browser = await openTestPage(server.url!)
        await shows(browser, 1)
        await server.idle()
        for (const n of [2, 3, 4, 5]) {
          const errors = shapeErrors(browser)
          await server.edit({
            'src/routes/index.tsx': index(framework, n, errorComponent),
          })
          if (errorComponent) {
            await shows(browser, n)
            expect(browser.loads()).toBe(1)
          } else if (framework === 'react') {
            // one reload per save
            await shows(browser, n)
            expect(browser.loads()).toBe(n)
          } else if (n % 2 === 0) {
            // (the known limit: the page keeps what the boundary caught)
            await expect
              .poll(() => shapeErrors(browser) > errors, { timeout: 20_000 })
              .toBe(true)
          } else {
            // the next save reloads
            await shows(browser, n)
            expect(browser.loads()).toBe((n + 1) / 2)
          }
          await server.idle()
        }
      },
      timeout,
    )
  },
)
