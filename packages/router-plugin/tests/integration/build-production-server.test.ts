/**
 * A production server holds no route HMR runtime (SPEC G7), per framework:
 * Vite SSR builds of a split route, with the router packages bundled (the
 * harness's default for linked packages) and left for Node to load (an
 * app's installed dependencies, as Start's server leaves them; Solid's
 * router package only runs compiled with the app, so only router-core is
 * left). The server renders the split component; neither the modules Node
 * loads (a load hook registered before the app loads) nor the emitted
 * chunks hold a module of the runtime (`@tanstack/router-core/hmr`, the
 * framework's `/hmr`). The lazy wrapper's hot slot is no part of it: a
 * development block of the framework package, which only a build that
 * replaces `process.env.NODE_ENV` removes (build-production.test.ts).
 */
import { describe, expect, test } from 'vitest'
import { tanstackRouter } from '../../src/vite'
import { build, frameworks, routeApp, routeHead } from '../build-harness'
import type { Framework, RouterPluginOptions } from '../build-harness'

const timeout = 120_000

const route = (
  framework: Framework,
) => `${routeHead(framework)}function Page() {
  return <p>MARK_PAGE</p>
}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: Page,
})
`

/**
 * Names only the route HMR runtime reads (`router-core/src/hmr.ts`, the
 * framework's `src/hmr.ts`): properties and strings, which minifiers keep.
 */
const hmrMarkers =
  /__TSR_ROUTERS__|vite:afterUpdate|__tsrRouteHmr|MissingFactoryError|addStatusHandler/

/** A module file of the route HMR runtime (`@tanstack/*-router/hmr`, `@tanstack/router-core/hmr`, Solid's `hmr-chunk-importer`). */
const hmrModule = /\/dist\/(?:esm|cjs|source)\/hmr[.-][\w.-]*$/

/** Records the URL of every module Node loads from now on, then loads the app and renders its route's component. */
const script = `const { registerHooks } = await import('node:module')
const loaded = []
registerHooks({
  load(url, context, nextLoad) {
    loaded.push(url)
    return nextLoad(url, context)
  },
})
const app = await entry.load()
const html = await app.render(app.Route.options.component)
return { html, loaded }`

describe.each([false, true])('external packages: %s', (external) => {
  test.each(frameworks)(
    'a production %s server loads no route HMR code',
    async (framework) => {
      const files = routeApp(route(framework), { framework })
      const result = await build({
        bundler: 'vite',
        framework,
        files: {
          ...files,
          'app.ts': files['entry.ts']!,
          'entry.ts': `export const load = () => import('./app')\n`,
        },
        routerPlugins: (config: RouterPluginOptions) => [
          tanstackRouter(config),
          ...(external
            ? [
                {
                  name: 'test:external-router',
                  config: () => ({
                    ssr: {
                      external: [
                        ...(framework === 'solid'
                          ? []
                          : [`@tanstack/${framework}-router`]),
                        '@tanstack/router-core',
                      ],
                    },
                  }),
                },
              ]
            : []),
        ],
      })
      const { html, loaded } = (await result.run(script)).result as {
        html: string
        loaded: Array<string>
      }
      expect(html).toContain('MARK_PAGE')
      expect(loaded.some((url) => url.includes('/router-core/dist/'))).toBe(
        external,
      )
      expect(loaded.filter((url) => hmrModule.test(url))).toEqual([])
      for (const chunk of result.chunks) {
        expect(chunk.code, chunk.fileName).not.toMatch(hmrMarkers)
      }
    },
    timeout,
  )
})
