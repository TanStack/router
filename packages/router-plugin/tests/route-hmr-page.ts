/**
 * Route HMR as an app sees it: a real dev server (Vite with the router
 * plugin and the framework's own Vite plugin, or Rsbuild with the router
 * plugin's Rspack entry and `@rsbuild/plugin-react`) serves a small
 * file-based app with the real router package, a real browser page
 * (headless Chromium) runs it with the dev server's own HMR client, and the
 * test edits route files on disk, which the dev server's own file watcher
 * reports. The test reads the page: what it shows, and whether it reloaded.
 *
 * Nothing of the HMR path is modelled: the bundler decides which modules
 * accept the update, the framework's refresh runtime (React Refresh, Solid
 * Refresh, Vue's HMR runtime) patches components, and the route HMR code
 * the router plugin emits updates the live router.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pluginReact } from '@rsbuild/plugin-react'
import react from '@vitejs/plugin-react'
import vueJsx from '@vitejs/plugin-vue-jsx'
import solid from 'vite-plugin-solid'
import { onTestFinished } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { createDevServer } from '@tanstack/compiler-test-utils/dev-server'
import { createRsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import { tanstackRouter as tanstackRouterRspack } from '../src/rspack'
import { tanstackRouter } from '../src/vite'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'
import type { RsbuildPlugin } from '@rsbuild/core'
import type { PluginOption } from 'vite'
import type { Config } from '../src/core/config'
import type { TargetFramework } from './regression-helpers'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

/** How the app mounts the router into `#app`, per framework. */
const mains: Record<TargetFramework, string> = {
  react: `import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
const router = createRouter({ routeTree })
createRoot(document.getElementById('app')!).render(<RouterProvider router={router} />)
`,
  solid: `import { render } from 'solid-js/web'
import { RouterProvider, createRouter } from '@tanstack/solid-router'
import { routeTree } from './routeTree.gen'
const router = createRouter({ routeTree })
render(() => <RouterProvider router={router} />, document.getElementById('app')!)
`,
  vue: `import { createApp } from 'vue'
import { RouterProvider, createRouter } from '@tanstack/vue-router'
import { routeTree } from './routeTree.gen'
const router = createRouter({ routeTree })
createApp({ setup: () => () => <RouterProvider router={router} /> }).mount('#app')
`,
}

/** The framework's own Vite plugin, as an app adds it. */
const frameworkPlugins: Record<TargetFramework, () => PluginOption> = {
  react: () => react(),
  solid: () => solid(),
  vue: () => vueJsx(),
}

/**
 * Dependencies the app imports, pre-bundled up front as Vite does for an app
 * that installed them (the router package is a linked workspace package
 * here, which Vite would otherwise serve as source and discover the
 * dependencies of late, reloading the page).
 */
const prebundled: Record<TargetFramework, Array<string>> = {
  react: [
    'react',
    'react/jsx-dev-runtime',
    'react-dom',
    'react-dom/client',
    '@tanstack/react-router',
  ],
  solid: [],
  vue: ['vue', '@tanstack/vue-router'],
}

export interface RouteHmrPageOptions {
  /** Default `vite`. Rsbuild runs React apps only. */
  bundler?: 'vite' | 'rsbuild'
  /** Default `react`. */
  target?: TargetFramework
  /** Router plugin options over the defaults (`autoCodeSplitting: true`). */
  pluginOptions?: Partial<Config>
  /**
   * Whether the app adds its framework's plugin (default `true`):
   * `@vitejs/plugin-react`, `vite-plugin-solid` or `@vitejs/plugin-vue-jsx`
   * with Vite, `@rsbuild/plugin-react` with Rsbuild. Without it, a React app
   * on Rsbuild runs without React Refresh.
   */
  frameworkPlugin?: boolean
  /**
   * Rsbuild: `@rsbuild/plugin-react`'s `fastRefresh` (default `true`); a
   * React app on Rsbuild without React Refresh sets it to `false`.
   */
  reactRefresh?: boolean
  /**
   * App files relative to its root: route files in `routes/`
   * (`routes/__root.tsx` defaults to an empty root route, which renders its
   * child routes) and any other module they import.
   */
  files: Record<string, string>
  /** Text the app shows once it rendered. */
  ready: string | RegExp
  /**
   * Registers the cleanup (closing the page and the dev server) to run when
   * the test ends. Default: vitest's `onTestFinished`; a concurrent test
   * passes the one of its test context.
   */
  onTestFinished?: (cleanup: () => Promise<void>) => void
}

export interface RouteHmrPage {
  /** The browser page. */
  page: BrowserPage
  /** Clicks the first element matching `selector`. */
  click: (selector: string) => Promise<void>
  /**
   * Writes app files (`null` deletes one) for the dev server's watcher to
   * pick up, waits until the app shows `expected`, then until the dev server
   * is quiet, and returns whether the page reloaded meanwhile (a full reload
   * instead of a hot update).
   */
  edit: (
    files: Record<string, string | null>,
    expected: string | RegExp,
    options?: { timeout?: number },
  ) => Promise<{ reloaded: boolean }>
  /**
   * Runs `script` in the page (e.g. reads the live router,
   * `window.__TSR_ROUTER__`) and returns its JSON value.
   */
  evaluate: <T>(script: string) => Promise<T>
}

/** The part of a dev server the page needs. */
interface AppServer {
  url: string
  /** Writes files for the server's watcher. */
  write: (files: Record<string, string | null>) => Promise<void>
  /** Waits until the server is quiet. */
  quiet: () => Promise<void>
  /** Full reloads the server sent the page so far. */
  fullReloads: () => number
}

/** How long the dev server must stay silent after an edit showed. */
const quietTime = 300

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Starts a dev server on an app of `files` (see `RouteHmrPageOptions`), opens
 * it in a browser page and waits until it shows `ready`.
 */
export async function openRouteHmrPage(
  options: RouteHmrPageOptions,
): Promise<RouteHmrPage> {
  const target = options.target ?? 'react'
  const files = {
    'main.tsx': mains[target],
    'routes/__root.tsx': `import { createRootRoute } from '@tanstack/${target}-router'
export const Route = createRootRoute({})
`,
    ...options.files,
  }
  const server =
    (options.bundler ?? 'vite') === 'vite'
      ? await viteServer(target, files, options)
      : await rsbuildServer(target, files, options)
  const page = await openPage(server.url, {
    registerCleanup: options.onTestFinished ?? onTestFinished,
  })
  await page.waitForText(options.ready, { selector: '#app' })
  await server.quiet()

  return {
    page,
    click: async (selector) => {
      await page.page.locator(selector).first().click()
    },
    edit: async (edited, expected, editOptions = {}) => {
      const loads = page.loads()
      const fullReloads = server.fullReloads()
      await server.write(edited)
      await page.waitForText(expected, {
        selector: '#app',
        timeout: editOptions.timeout,
      })
      await server.quiet()
      return {
        reloaded:
          server.fullReloads() !== fullReloads || page.loads() !== loads,
      }
    },
    evaluate: (script) => page.page.evaluate(script),
  }
}

async function viteServer(
  target: TargetFramework,
  files: Record<string, string>,
  options: RouteHmrPageOptions,
): Promise<AppServer> {
  const server = await createDevServer({
    dir: harnessDir,
    prefix: '.route-hmr-page-',
    registerCleanup: options.onTestFinished ?? onTestFinished,
    browser: true,
    files: {
      'index.html': `<!doctype html>
<html>
  <body>
    <div id="app"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
`,
      ...files,
    },
    config: { optimizeDeps: { include: prebundled[target] } },
    plugins: [
      tanstackRouter({
        target,
        routesDirectory: './routes',
        generatedRouteTree: './routeTree.gen.ts',
        autoCodeSplitting: true,
        ...options.pluginOptions,
      }),
      ...(options.frameworkPlugin === false
        ? []
        : [frameworkPlugins[target]()]),
    ],
  })
  return {
    url: server.url!,
    write: server.write,
    // Until the server sent no HMR message for a while
    quiet: async () => {
      let count = server.hmr.length
      let since = Date.now()
      for (;;) {
        await sleep(25)
        if (server.hmr.length !== count) {
          count = server.hmr.length
          since = Date.now()
        } else if (Date.now() - since >= quietTime) {
          await server.idle()
          return
        }
      }
    },
    fullReloads: () =>
      server.hmr.filter(
        (message) =>
          message.environment === 'client' && message.type === 'full-reload',
      ).length,
  }
}

async function rsbuildServer(
  target: TargetFramework,
  files: Record<string, string>,
  options: RouteHmrPageOptions,
): Promise<AppServer> {
  if (target !== 'react') {
    throw new Error('the Rsbuild page runs React apps only')
  }
  const server = await createRsbuildDevServer({
    dir: harnessDir,
    prefix: '.route-hmr-page-rsbuild-',
    registerCleanup: options.onTestFinished ?? onTestFinished,
    browser: true,
    entry: 'main.tsx',
    files,
    config: { html: { mountId: 'app' } },
    plugins: ({ root }) => [
      ...(options.frameworkPlugin === false
        ? []
        : [pluginReact({ fastRefresh: options.reactRefresh ?? true })]),
      {
        name: 'route-hmr-page',
        setup(api) {
          api.modifyRspackConfig((config) => {
            config.plugins.push(
              tanstackRouterRspack({
                target,
                // The Rspack plugin resolves relative paths from the working
                // directory
                routesDirectory: path.join(root, 'routes'),
                generatedRouteTree: path.join(root, 'routeTree.gen.ts'),
                autoCodeSplitting: true,
                ...options.pluginOptions,
              }),
            )
          })
        },
      } satisfies RsbuildPlugin,
    ],
  })
  return {
    url: server.url!,
    write: server.edit,
    quiet: () => sleep(quietTime),
    // Rsbuild's client reloads the page itself
    fullReloads: () => 0,
  }
}
