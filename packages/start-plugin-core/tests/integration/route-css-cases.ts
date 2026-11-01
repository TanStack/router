/**
 * The CSS a route imports in a real page of a React Start app, run for each
 * bundler by its own test file (`known-bugs-route-css.test.ts`: Vite,
 * `known-bugs-route-css-rsbuild.test.ts`: Rsbuild), on the bundler's dev
 * server (Vite: `startDevServer`; Rsbuild: `startRsbuildStartDevServer`)
 * and in a production build served as the bundler's preview serves it,
 * Start's server entry rendering the pages (Vite: `createStartHost({
 * serve: false })` + `preview()`; Rsbuild: `buildStart` + `preview()`). The
 * root route renders a probe element with each route's class on every
 * page; the page is read at `/`, then after a client-side navigation to the
 * route, and, for two routes that share a module, after a reload there (the
 * page the server renders at the route).
 */
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  onTestFinished,
  test,
} from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { buildStart } from '../build-harness'
import { startDevServer } from '../dev-server'
import { startRsbuildStartDevServer } from '../rsbuild-dev-server'
import { createStartHost } from '../start-host'
import { reactApp } from './hydrate-dev-edits'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'
import type { RsbuildConfig } from '@rsbuild/core'
import type { StartBundler } from '../build-harness'

const timeout = 60_000

const head = `import { createFileRoute, notFound } from '@tanstack/react-router'\n`

/** The component module of a route whose component imports its CSS. */
const pageModule = (name: string) => `import './${name}.css'
import { Shared } from './shared'
export function Page() {
  return <p>${name} page <Shared /></p>
}
`

/**
 * Each route, by path: its options, what the page shows once it matched
 * (`shows-nothing` mounts no component) and who imports its CSS: the route
 * module (`./<name>.css` next to it), or, with `sharesWith`, its component
 * module (`src/pages/<name>.tsx`), which shares a module with the component
 * module of the route `sharesWith`.
 */
const routes: Record<
  string,
  { options: string; shows?: string; sharesWith?: string }
> = {
  'shows-component': {
    options: `component: () => <p>component page</p>`,
    shows: 'component page',
  },
  'shows-error': {
    options: `loader: () => {
    throw new Error('MARK_LOADER_ERROR')
  },
  errorComponent: () => <p>error page</p>`,
    shows: 'error page',
  },
  'shows-not-found': {
    options: `loader: () => {
    throw notFound()
  },
  notFoundComponent: () => <p>not found page</p>`,
    shows: 'not found page',
  },
  'shows-pending': {
    options: `loader: () => new Promise(() => {}),
  pendingMs: 0,
  pendingComponent: () => <p>pending page</p>`,
    shows: 'pending page',
  },
  'shows-nothing': { options: '' },
  'shares-module-a': {
    options: `component: Page`,
    shows: 'shares-module-a page',
    sharesWith: 'shares-module-c',
  },
  'shares-module-c': {
    options: `component: Page`,
    shows: 'shares-module-c page',
    sharesWith: 'shares-module-a',
  },
}

const color = 'rgb(1, 2, 3)'

const files: Record<string, string> = {
  'src/routes/__root.tsx': `import { HeadContent, Link, Outlet, Scripts, createRootRoute, useHydrated } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Root })
const names = ${JSON.stringify(Object.keys(routes))}
function Root() {
  const hydrated = useHydrated()
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <nav>{names.map((name) => <Link key={name} to={'/' + name}>{name}</Link>)}</nav>
        <div id="app"><Outlet /></div>
        {names.map((name) => <span key={name} data-probe={name} className={name + '-marker'}>probe</span>)}
        <span data-testid="hydrated">{hydrated ? 'hydrated' : 'hydrating'}</span>
        <Scripts />
      </body>
    </html>
  )
}
`,
  'src/routes/index.tsx': `${head}export const Route = createFileRoute('/')({ component: () => <p>home</p> })\n`,
  // The module the component modules share, and a module it imports
  'src/pages/shared.tsx': `import { Widget } from './widget'
export function Shared() {
  return <Widget />
}
`,
  'src/pages/widget.tsx': `export function Widget() {
  return <em>widget</em>
}
`,
  ...Object.fromEntries(
    Object.entries(routes).flatMap(([name, { options, sharesWith }]) => {
      const css = `.${name}-marker { color: ${color}; }\n`
      return sharesWith
        ? [
            [
              `src/routes/${name}.tsx`,
              `${head}import { Page } from '../pages/${name}'
export const Route = createFileRoute('/${name}')({
  ${options}
})
`,
            ],
            [`src/pages/${name}.tsx`, pageModule(name)],
            [`src/pages/${name}.css`, css],
          ]
        : [
            [
              `src/routes/${name}.tsx`,
              `${head}import './${name}.css'
export const Route = createFileRoute('/${name}')({
  ${options}
})
`,
            ],
            [`src/routes/${name}.css`, css],
          ]
    }),
  ),
}

/**
 * Rsbuild: the app's own client and server entries (Start's defaults, as an
 * app writes them; the Rsbuild harnesses' test entries render nothing) and
 * its router.
 */
const rsbuildEntries = {
  'src/client.tsx': `import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
hydrateRoot(document, <StartClient />)
`,
  'src/server.ts': `export { default } from '@tanstack/react-start/server-entry'\n`,
  'src/router.ts': reactApp['src/router.ts'],
}

/**
 * Rsbuild: the module the component modules share is in a chunk of its
 * own, as an app's chunk splitting may put it (`splitChunks`); the module it
 * imports stays in each component's chunk.
 */
const rsbuildConfig = {
  splitChunks: {
    cacheGroups: {
      shared: {
        name: 'shared',
        test: /[\\/]src[\\/]pages[\\/]shared\./,
        chunks: 'async',
        enforce: true,
      },
    },
  },
} satisfies RsbuildConfig

/** The computed color of the probe element of route `name`. */
const probeColor = (page: BrowserPage, name: string) =>
  page.page
    .locator(`[data-probe="${name}"]`)
    .evaluate((element) => getComputedStyle(element).color)

const bundlerName = { vite: 'Vite', rsbuild: 'Rsbuild' } as const

/** The rows of `bundler`, in its dev server and in its production build. */
export function routeCssSuite(
  bundler: StartBundler,
  /** The rows each mode fails today, by name. */
  failsOn: Record<'dev' | 'build', Array<string>>,
) {
  describe.each(['dev', 'build'] as const)(
    `${bundlerName[bundler]} %s`,
    (mode) => {
      const cleanups: Array<() => Promise<void>> = []
      const registerCleanup = (cleanup: () => Promise<void>) => {
        cleanups.push(cleanup)
      }
      let url: string
      beforeAll(async () => {
        if (bundler === 'vite') {
          if (mode === 'dev') {
            const server = await startDevServer({
              browser: true,
              registerCleanup,
              files: { ...reactApp, ...files },
            })
            url = server.url!
          } else {
            const host = await createStartHost({ serve: false, files })
            registerCleanup(() => host.close())
            url = (await host.preview()).url
          }
        } else if (mode === 'dev') {
          const server = await startRsbuildStartDevServer({
            browser: true,
            registerCleanup,
            config: {
              ...rsbuildConfig,
              // Start serves the pages, not an HTML template
              tools: { htmlPlugin: false },
            },
            files: { ...rsbuildEntries, ...files },
          })
          url = server.url!
        } else {
          const build = await buildStart({
            bundler,
            registerCleanup,
            rsbuildConfig,
            files: { ...rsbuildEntries, ...files },
          })
          url = (await build.preview(registerCleanup)).url
        }
      }, timeout)
      afterAll(async () => {
        for (const cleanup of cleanups.reverse()) {
          await cleanup()
        }
      })

      // SPEC J2.22: a route's CSS loads only when the route matches, whatever
      // it mounts.
      for (const name of Object.keys(routes)) {
        ;(failsOn[mode].includes(name) ? test.fails : test)(
          `the CSS of the /${name} route applies only once the route matches`,
          async () => {
            const page = await openPage(new URL('/', url).href, {
              registerCleanup: onTestFinished,
            })
            await page.waitForText('hydrated', {
              selector: '[data-testid=hydrated]',
            })
            await page.page.waitForLoadState('networkidle')
            expect(await probeColor(page, name), 'at /').not.toBe(color)
            await page.page.locator(`nav a[href="/${name}"]`).click()
            await page.page.waitForURL(new URL(`/${name}`, url).href)
            const { shows, sharesWith } = routes[name]!
            /**
             * The route's CSS applies; the CSS of the route it shares a
             * module with does not.
             */
            const expectRouteCss = async (at: string) => {
              if (shows !== undefined) {
                await page.waitForText(shows, { selector: '#app' })
              }
              await expect
                .poll(() => probeColor(page, name), { timeout: 5_000 })
                .toBe(color)
              if (sharesWith !== undefined) {
                expect(
                  await probeColor(page, sharesWith),
                  `/${sharesWith} ${at}`,
                ).not.toBe(color)
              }
            }
            if (sharesWith !== undefined) {
              // (everything the navigation loads)
              await page.page.waitForLoadState('networkidle')
            }
            await expectRouteCss('after the navigation')
            if (sharesWith !== undefined) {
              // The page the server renders at the route, whose stylesheets
              // load before its `load` event
              await page.page.reload()
              await expectRouteCss('after a reload')
            }
          },
          timeout,
        )
      }
    },
  )
}
