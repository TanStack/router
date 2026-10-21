/**
 * A React app served by a real Vite dev server with the router plugins a
 * test configures itself (`@tanstack/compiler-test-utils/plugin-host`, the
 * public plugin array plus `@vitejs/plugin-react`), for tests whose plugin
 * setup is not the one route of `route-app.ts`: several router plugins,
 * environment-scoped code splitters, a whole app of route and non-route
 * modules. Client code runs in the shared Chromium page (`runClient`);
 * server code through the SSR environment's own module runner
 * (`importServer`).
 */
import react from '@vitejs/plugin-react'
import { onTestFinished } from 'vitest'
import { createPluginHost } from '@tanstack/compiler-test-utils/plugin-host'
import type {
  PluginHost,
  PluginHostApp,
} from '@tanstack/compiler-test-utils/plugin-host'
import type { PluginOption } from 'vite'

/** Dependencies the app imports, pre-bundled up front as Vite does for an app. */
const prebundled = [
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom',
  'react-dom/client',
  '@tanstack/react-router',
]

/**
 * An app module the page imports to render a component with React's client
 * renderer (`render(component, props)`, after `preload()` when the
 * component is a lazy route component): the HTML it renders.
 */
export const renderProbe = '/render-probe.ts'

const renderProbeSource = `import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
export async function render(component: any, props: Record<string, unknown> = {}) {
  await component?.preload?.()
  const el = document.createElement('div')
  document.body.append(el)
  const errors: Array<unknown> = []
  const root = createRoot(el, { onUncaughtError: (error) => errors.push(error) })
  flushSync(() => root.render(createElement(component, props)))
  const html = el.innerHTML
  root.unmount()
  el.remove()
  if (errors.length > 0) throw errors[0]
  return html
}
`

/**
 * Starts the dev server on `files` with `plugins(app)` (the router plugins)
 * followed by `@vitejs/plugin-react`; it closes when the test ends.
 */
export function createReactDevPage(options: {
  files: Record<string, string>
  plugins: (app: PluginHostApp) => Array<PluginOption>
}): Promise<PluginHost> {
  return createPluginHost({
    dir: import.meta.dirname,
    prefix: '.dev-page-',
    registerCleanup: onTestFinished,
    files: { ...options.files, [renderProbe.slice(1)]: renderProbeSource },
    client: true,
    config: { optimizeDeps: { noDiscovery: true, include: prebundled } },
    plugins: (app) => [...options.plugins(app), react()],
  })
}
