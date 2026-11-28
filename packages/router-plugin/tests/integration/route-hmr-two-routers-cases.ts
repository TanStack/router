/**
 * Apps with two routers on one page, for the route HMR rows of
 * `route-hmr-browser-two-routers*.test.ts` and
 * `route-hmr-browser-shared-tree.test.ts`: the app's router in `#app` and a
 * widget's router in `#widget`, each with a route `/`.
 */
import type { TargetFramework } from '../route-app'

export const hosts = [
  { bundler: 'vite', target: 'react' },
  { bundler: 'vite', target: 'solid' },
  { bundler: 'vite', target: 'vue' },
  { bundler: 'rsbuild', target: 'react' },
  { bundler: 'rsbuild', target: 'solid' },
  { bundler: 'rsbuild', target: 'vue' },
] as const

/** How a component reads a loader's data (`useLoaderData()` gives a value, an accessor or a ref). */
export const read: Record<TargetFramework, string> = {
  react: '',
  solid: '()',
  vue: '.value',
}

const frameworkImport: Record<TargetFramework, string> = {
  react: `import { createRoot } from 'react-dom/client'`,
  solid: `import { render } from 'solid-js/web'`,
  vue: `import { createApp } from 'vue'`,
}

/** Mounts `router` into `element` (two expressions). */
export const mount: Record<
  TargetFramework,
  (element: string, router: string) => string
> = {
  react: (element, router) =>
    `createRoot(${element}).render(<RouterProvider router={${router}} />)`,
  solid: (element, router) =>
    `render(() => <RouterProvider router={${router}} />, ${element})`,
  vue: (element, router) =>
    `createApp({ setup: () => () => <RouterProvider router={${router}} /> }).mount(${element})`,
}

/** Creates the `#widget` element after `#app`. */
export const widgetElement = `const element = document.createElement('div')
element.id = 'widget'
document.body.append(element)`

/**
 * The app's file-based router (`window.__APP_ROUTER__`) and a widget's code
 * router of its own (`window.__WIDGET_ROUTER__`, memory history), whose
 * route `/` is lazy (`widget.lazy.tsx`) or eager; `order`: which router the
 * entry creates first.
 */
export const twoRouters = (
  target: TargetFramework,
  widget: 'lazy' | 'eager',
  order: 'widget-last' | 'widget-first',
) => {
  const widgetRoute =
    widget === 'lazy'
      ? `const widgetIndex = createRoute({ getParentRoute: () => widgetRoot, path: '/' }).lazy(() => import('./widget.lazy').then((m) => m.Route))`
      : `const widgetIndex = createRoute({ getParentRoute: () => widgetRoot, path: '/', loader: () => 'widget data', component: () => <p>Widget {widgetIndex.useLoaderData()${read[target]}}</p> })`
  const app = `const router = createRouter({ routeTree })
;(window as any).__APP_ROUTER__ = router`
  const widgetPart = `const widgetRoot = createRootRoute()
${widgetRoute}
const widget = createRouter({
  routeTree: widgetRoot.addChildren([widgetIndex]),
  history: createMemoryHistory({ initialEntries: ['/'] }),
})
;(window as any).__WIDGET_ROUTER__ = widget`
  return `${frameworkImport[target]}
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/${target}-router'
import { routeTree } from './routeTree.gen'
${order === 'widget-first' ? `${widgetPart}\n${app}` : `${app}\n${widgetPart}`}
${widgetElement}
${mount[target]("document.getElementById('app')!", 'router')}
${mount[target]('element', 'widget')}
`
}

/** Two file-based routers, of the route trees of `routes/` and `widget-routes/`, each compiled by a plugin instance of its own. */
export const twoTrees = (target: TargetFramework) => `${frameworkImport[target]}
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/${target}-router'
import { routeTree } from './routeTree.gen'
import { routeTree as widgetTree } from './widgetTree.gen'
const router = createRouter({ routeTree })
;(window as any).__APP_ROUTER__ = router
const widget = createRouter({
  routeTree: widgetTree,
  history: createMemoryHistory({ initialEntries: ['/'] }),
})
;(window as any).__WIDGET_ROUTER__ = widget
${widgetElement}
${mount[target]("document.getElementById('app')!", 'router')}
${mount[target]('element', 'widget')}
`

/** The second route tree of `twoTrees`, for `openRouteHmrPage`'s `moreRouteTrees`. */
export const widgetTree = {
  routesDirectory: 'widget-routes',
  generatedRouteTree: 'widgetTree.gen.ts',
}

/**
 * A route file at `/` whose loader names `version` (`name`: its
 * component's); with `counter`, each loader run counts in
 * `globalThis[counter]`.
 */
export const loaderRoute = (
  target: TargetFramework,
  version: string,
  name = 'Page',
  counter?: string,
) =>
  `import { createFileRoute } from '@tanstack/${target}-router'
export const Route = createFileRoute('/')({
  loader: () => ${counter ? `{ ;(globalThis as any).${counter} = ((globalThis as any).${counter} ?? 0) + 1; return '${version}' }` : `'${version}'`},
  component: ${name},
})
function ${name}() {
  const data = Route.useLoaderData()
  return <p>{data${read[target]}}</p>
}
`

/** A lazy route file at `/` whose component shows `text`. */
export const lazyFile = (
  target: TargetFramework,
  text: string,
  name = 'Page',
) =>
  `import { createLazyFileRoute } from '@tanstack/${target}-router'
export const Route = createLazyFileRoute('/')({ component: ${name} })
function ${name}() {
  return <p>${text}</p>
}
`

/** A route file at `/` with no options (its lazy route file holds them). */
export const emptyRoute = (target: TargetFramework) =>
  `import { createFileRoute } from '@tanstack/${target}-router'
export const Route = createFileRoute('/')({})
`
