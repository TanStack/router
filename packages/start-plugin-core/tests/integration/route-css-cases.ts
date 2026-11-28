/**
 * The CSS a route imports in a real page of a React Start app, run for each
 * bundler by its own test file (`route-css.test.ts`: Vite,
 * `route-css-rsbuild.test.ts`: Rsbuild), on the bundler's dev
 * server (Vite: `startDevServer`; Rsbuild: `startRsbuildStartDevServer`)
 * and in a production build served as the bundler's preview serves it,
 * Start's server entry rendering the pages (Vite: `createStartHost({
 * serve: false })` + `preview()`; Rsbuild: `buildStart` + `preview()`). The
 * root route renders a probe element with each route's class on every
 * page; the page is read at `/`, then after a client-side navigation to the
 * route, and, for two routes that share a module, after a reload there (the
 * page the server renders at the route).
 */
import { beforeAll, describe, expect, test } from 'vitest'
import { closeAfterAll } from '../file-end'
import { openTestPage } from '../test-page'
import { buildStartShared } from '../build-harness'
import { startDevServerShared } from '../dev-server'
import { startRsbuildStartDevServerShared } from '../rsbuild-dev-server'
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
export const rsbuildEntries = {
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
  /** The routes whose CSS each mode applies at `/` today, by name. */
  failsOn: Record<'dev' | 'build', Array<string>>,
) {
  describe.each(['dev', 'build'] as const)(
    `${bundlerName[bundler]} %s`,
    (mode) => {
      let url: string
      const opening = closeAfterAll()
      beforeAll(async () => {
        const opened = await opening(async () =>
          bundler === 'vite'
            ? mode === 'dev'
              ? startDevServerShared({
                  browser: true,
                  files: { ...reactApp, ...files },
                })
              : createStartHost({ serve: false, files })
            : mode === 'dev'
              ? startRsbuildStartDevServerShared({
                  browser: true,
                  config: {
                    ...rsbuildConfig,
                    // Start serves the pages, not an HTML template
                    tools: { htmlPlugin: false },
                  },
                  files: { ...rsbuildEntries, ...files },
                })
              : buildStartShared({
                  bundler,
                  rsbuildConfig,
                  files: { ...rsbuildEntries, ...files },
                }),
        )
        url = 'preview' in opened ? (await opened.preview()).url : opened.url!
      }, timeout)

      /** A page of the app at `/`, hydrated, everything it loads loaded. */
      const openHome = async () => {
        const page = await openTestPage(new URL('/', url).href)
        await page.waitForText('hydrated', {
          selector: '[data-testid=hydrated]',
        })
        await page.page.waitForLoadState('networkidle')
        return page
      }

      // SPEC J2.22: a route's CSS loads only when the route matches, whatever
      // it mounts.
      for (const name of Object.keys(routes)) {
        ;(failsOn[mode].includes(name) ? test.fails : test)(
          `the CSS of the /${name} route does not apply at /`,
          async () => {
            const page = await openHome()
            expect(await probeColor(page, name)).not.toBe(color)
          },
          timeout,
        )

        test(
          `the CSS of the /${name} route applies once the route matches`,
          async () => {
            const page = await openHome()
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
