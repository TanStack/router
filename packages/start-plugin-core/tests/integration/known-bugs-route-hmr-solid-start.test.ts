/**
 * Route HMR on a Solid Start app whose root route renders the document
 * (`shellComponent` with `<html>`), on Start's Vite dev server, with Solid's
 * own hot updates (`vite-plugin-solid`): an edit that fixes a route
 * component that threw in the browser shows (SPEC J3.3).
 */
import solid from 'vite-plugin-solid'
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { startDevServer } from '../dev-server'

const timeout = 60_000

const root = `import { HeadContent, Scripts, createRootRoute } from '@tanstack/solid-router'
import { HydrationScript } from 'solid-js/web'
import type { JSX } from 'solid-js'
export const Route = createRootRoute({ shellComponent: Shell })
function Shell(props: { children: JSX.Element }) {
  return (
    <html>
      <head>
        <HydrationScript />
        <HeadContent />
      </head>
      <body>
        {props.children}
        <Scripts />
      </body>
    </html>
  )
}
`

/** The index route; `throwInBrowser`: its component throws when it renders in the browser (SSR renders it). */
const index = (text: string, throwInBrowser: boolean) =>
  `import { createFileRoute } from '@tanstack/solid-router'
export const Route = createFileRoute('/')({ component: Home })
function Home() {
  ${throwInBrowser ? `if (typeof window !== 'undefined') throw new Error('home-throws-in-browser')\n  ` : ''}return <p data-probe="home">${text}</p>
}
`

const files = {
  'harness/client-entry.ts': `import { createComponent, hydrate } from 'solid-js/web'
import { StartClient, hydrateStart } from '@tanstack/solid-start/client'
hydrateStart().then((router) => {
  hydrate(() => createComponent(StartClient, { router }), document)
})
`,
  'harness/server-entry.ts': `export { default } from '@tanstack/solid-start/server-entry'\n`,
  'src/router.ts': `import { createRouter } from '@tanstack/solid-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
  'src/routes/__root.tsx': root,
}

describe('Vite dev, Solid Start with a document shell', () => {
  // Found by the real-app differential corpus (thomascarter613/bun-monorepo,
  // a Solid Start template): a component in the shell throws in the browser
  // (a query devtools without a QueryClientProvider), so the page keeps the
  // server's HTML and the router's global catch boundary holds the error.
  // On main a route edit full-reloads and the page shows it; with route HMR
  // the edit hot-updates, the boundary resets and re-renders the root match,
  // whose shell renders `<html>`: Solid cannot render a hydratable `<html>`
  // outside hydration ("template is not a function"), so no edit shows
  // until the user reloads. The same holds for a route edit that makes a
  // component throw and the edit that fixes it.
  test(
    'an edit that fixes a route component that threw in the browser shows',
    async () => {
      const server = await startDevServer({
        start: {},
        framework: 'solid',
        browser: true,
        plugins: [solid({ ssr: true })],
        files: {
          ...files,
          'src/routes/index.tsx': index('home-v1', true),
        },
      })
      const browser = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      // the server rendered the page; hydration reached the component and it threw
      await browser.waitForText('home-v1', { selector: '[data-probe=home]' })
      await expect
        .poll(
          () =>
            browser.console.some((line) =>
              line.includes('home-throws-in-browser'),
            ),
          { timeout: 15_000 },
        )
        .toBe(true)
      await server.idle()

      await server.edit({ 'src/routes/index.tsx': index('home-v2', false) })
      await browser.waitForText('home-v2', {
        selector: '[data-probe=home]',
        timeout: 20_000,
      })
    },
    timeout,
  )
})
