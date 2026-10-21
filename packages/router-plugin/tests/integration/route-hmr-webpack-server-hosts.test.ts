/**
 * Route modules compiled for the dev server evaluate and render where a
 * webpack or Rspack server build with hot module replacement runs them
 * (SPEC J3.8): webpack's hot API (`import.meta.webpackHot`) present and no
 * `window`, the webpack-style cell no other host reaches. The page hosts,
 * Rsbuild's server environment (no hot API there) and the Vite hosts of the
 * same rows: integration/route-hmr-rsbuild-hosts.test.ts and
 * route-hmr.test.ts "route modules compiled for the dev server".
 *
 * The host is a server bundle built the way an app's own webpack or Rspack
 * configuration builds one for development with hot updates (the server-HMR
 * setup of webpack's guides: `target: 'node'`, development mode, the
 * bundler's `HotModuleReplacementPlugin`), with the router plugin's public
 * entry of that bundler; the bundle runs in Node (`run()` of the build
 * harness). Initial evaluation only, no router on the page yet: what an
 * edit does is tested in a real dev server and page
 * (integration/route-hmr-browser*.test.ts).
 */
import { describe, expect, it } from 'vitest'
import { build, routeApp } from '../build-harness'

const timeout = 60_000

const posts = `function PostsComponent() {
  return <div>posts data</div>
}`

/** What the modules see: the hot APIs and `window`. */
const environment = `export const environment = {
  hot: typeof (import.meta as any).hot,
  webpackHot: typeof import.meta.webpackHot,
  window: typeof window,
}
`

/**
 * The server entry: loads the route's component (the router's `preload()`
 * of a split component), renders it with React's server renderer, and
 * reports it with the loader's value and what the modules see.
 */
const serverEntry = (route: string) => `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { Route } from './routes/${route}'
import { environment } from './environment'
export async function check() {
  const component = (Route.options as any).component
  await component.preload?.()
  return {
    data: await (Route.options as any).loader(),
    html: renderToString(createElement(component)),
    environment,
  }
}
`

const routes = [
  {
    name: 'a split route',
    files: routeApp(
      `import { createFileRoute } from '@tanstack/react-router'
${posts}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: PostsComponent,
})`,
      { files: { 'entry.ts': serverEntry('index') } },
    ),
    html: '<div>posts data</div>',
  },
  {
    name: 'a root route',
    files: routeApp(
      `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({})
`,
      {
        files: {
          'routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({
  loader: () => 'data',
  component: () => <div>root</div>,
})`,
          'entry.ts': serverEntry('__root'),
        },
      },
    ),
    html: '<div>root</div>',
  },
]

/** Adds the bundler's own `HotModuleReplacementPlugin`, as the app's configuration does. */
async function withHotModuleReplacement(bundler: 'webpack' | 'rspack') {
  const { HotModuleReplacementPlugin } =
    bundler === 'webpack'
      ? (await import('webpack')).default
      : // (Rspack as Rsbuild ships it)
        (await import('@rsbuild/core')).rspack
  return (options: Record<string, unknown>) => {
    ;(options.plugins as Array<unknown>).push(new HotModuleReplacementPlugin())
  }
}

describe.each(routes)('$name', ({ files, html }) => {
  it.each(['webpack', 'rspack'] as const)(
    'renders and loads in a %s server build with hot module replacement (webpack hot API, no window)',
    async (bundler) => {
      const app = await build({
        bundler,
        env: 'ssr',
        mode: 'development',
        minify: false,
        files: { ...files, 'environment.ts': environment },
        pluginOptions: {
          codeSplittingOptions: { addHmr: true },
          plugin: { hmr: { style: 'webpack' } },
        },
        configure: await withHotModuleReplacement(bundler),
      })
      try {
        expect((await app.run('return await entry.check()')).result).toEqual({
          data: 'data',
          html,
          environment: {
            hot: 'undefined',
            webpackHot: 'object',
            window: 'undefined',
          },
        })
      } finally {
        await app.dispose()
      }
    },
    timeout,
  )
})
