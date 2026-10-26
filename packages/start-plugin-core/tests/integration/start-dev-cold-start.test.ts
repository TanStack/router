/**
 * A Start app's first page load on a cold Vite dependency cache: the dev
 * server discovers the app's dependencies as it serves the page (no
 * `optimizeDeps` configured, as in a freshly installed app), and the page
 * still hydrates in the document it first loaded. Vite reloads every open
 * page when a dependency it discovers late changes a chunk it already
 * pre-bundled, and a page whose module graph fails meanwhile (a stale
 * pre-bundled chunk) never hydrates and never gets that reload: both show
 * as more than one document, or no hydration.
 */
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import react from '@vitejs/plugin-react'
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import {
  hmrSyncModule,
  settlePage,
  trackRequests,
} from '@tanstack/compiler-test-utils/hmr-sync'
import { startDevServer } from '../dev-server'
import type { StartDevServerOptions } from '../dev-server'

const timeout = 90_000

/**
 * A page app per framework: Start's default entries (hydration of
 * `StartClient`, the HTTP handler), the real router over the generated
 * route tree, a root route rendering the document with a hydration marker,
 * and an index page. The router module loads `src/hmr-sync.ts`
 * (`settlePage`).
 */
const apps: Record<
  'react' | 'vue',
  Pick<StartDevServerOptions, 'framework' | 'plugins' | 'files'>
> = {
  react: {
    framework: 'react',
    plugins: [react()],
    files: {
      'harness/client-entry.ts': `import { createElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
hydrateRoot(document, createElement(StartClient))
`,
      'harness/server-entry.ts': `export { default } from '@tanstack/react-start/server-entry'\n`,
      'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import './hmr-sync'
export const getRouter = () => createRouter({ routeTree })
`,
      'src/hmr-sync.ts': hmrSyncModule,
      'src/routes/__root.tsx': `import { HeadContent, Outlet, Scripts, createRootRoute, useHydrated } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Root })
function Root() {
  const hydrated = useHydrated()
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <div id="app"><Outlet /></div>
        <span data-testid="hydrated">{hydrated ? 'hydrated' : 'hydrating'}</span>
        <Scripts />
      </body>
    </html>
  )
}
`,
      'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <p>MARK_PAGE</p> })
`,
    },
  },
  vue: {
    framework: 'vue',
    plugins: [vue(), vueJsx()],
    files: {
      'harness/client-entry.ts': `import { createSSRApp } from 'vue'
import { StartClient, hydrateStart } from '@tanstack/vue-start/client'
hydrateStart().then((router) => {
  createSSRApp(StartClient, { router }).mount('#__app')
})
`,
      'harness/server-entry.ts': `export { default } from '@tanstack/vue-start/server-entry'\n`,
      'src/router.ts': `import { createRouter } from '@tanstack/vue-router'
import { routeTree } from './routeTree.gen'
import './hmr-sync'
export const getRouter = () => createRouter({ routeTree })
`,
      'src/hmr-sync.ts': hmrSyncModule,
      'src/routes/__root.tsx': `import { defineComponent, onMounted, ref } from 'vue'
import { Body, HeadContent, Html, Outlet, Scripts, createRootRoute } from '@tanstack/vue-router'
const Root = defineComponent({
  setup() {
    const hydrated = ref(false)
    onMounted(() => {
      hydrated.value = true
    })
    return () => (
      <Html>
        <head>
          <HeadContent />
        </head>
        <Body>
          <div id="app"><Outlet /></div>
          <span data-testid="hydrated">{hydrated.value ? 'hydrated' : 'hydrating'}</span>
          <Scripts />
        </Body>
      </Html>
    )
  },
})
export const Route = createRootRoute({ component: Root })
`,
      'src/routes/index.tsx': `import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
const Page = defineComponent({ setup: () => () => <p>MARK_PAGE</p> })
export const Route = createFileRoute('/')({ component: Page })
`,
    },
  },
}

describe('Vite dev: the first page load on a cold dependency cache', () => {
  // Source: Vue Start cold starts stalled (the page never hydrated) or
  // reloaded once on every cold start; React is the control.
  test.each(['react', 'vue'] as const)(
    '%s: the page hydrates in the document it first loaded',
    async (framework) => {
      const server = await startDevServer({
        ...apps[framework],
        start: {},
        browser: true,
      })
      const browser = await openPage(new URL('/', server.url).href, {
        registerCleanup: onTestFinished,
      })
      const inFlight = trackRequests(browser)
      await browser.waitForText('MARK_PAGE', { selector: '#app' })
      await browser.waitForText('hydrated', {
        selector: '[data-testid=hydrated]',
      })
      // Everything the server sent the page meanwhile has been taken in
      // (a reload it announced has happened)
      await settlePage(server, browser, inFlight)
      expect(browser.loads()).toBe(1)
      expect(browser.errors).toEqual([])
    },
    timeout,
  )
})
