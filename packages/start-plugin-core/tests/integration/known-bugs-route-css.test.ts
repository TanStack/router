/**
 * The CSS a route module imports (`import './users.css'`) in a real page of
 * a React Start app, on Vite's dev server (`startDevServer`) and in a
 * production build served by Start's preview server (`createStartHost({
 * serve: false })` + `preview()`). The root route renders a probe element
 * with each route's class on every page; the page is read at `/`, then
 * after a client-side navigation to the route.
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
import { startDevServer } from '../dev-server'
import { createStartHost } from '../start-host'
import { reactApp } from './hydrate-dev-edits'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'

const timeout = 60_000

const head = `import { createFileRoute, notFound } from '@tanstack/react-router'\n`

/**
 * Each route, by path: its options and what the page shows once it matched
 * (`shows-nothing` mounts no component).
 */
const routes: Record<string, { options: string; shows?: string }> = {
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
  ...Object.fromEntries(
    Object.entries(routes).flatMap(([name, { options }]) => [
      [
        `src/routes/${name}.tsx`,
        `${head}import './${name}.css'
export const Route = createFileRoute('/${name}')({
  ${options}
})
`,
      ],
      [`src/routes/${name}.css`, `.${name}-marker { color: ${color}; }\n`],
    ]),
  ),
}

/** The computed color of the probe element of route `name`. */
const probeColor = (page: BrowserPage, name: string) =>
  page.page
    .locator(`[data-probe="${name}"]`)
    .evaluate((element) => getComputedStyle(element).color)

describe.each(['dev', 'build'] as const)('Vite %s', (mode) => {
  const cleanups: Array<() => Promise<void>> = []
  const registerCleanup = (cleanup: () => Promise<void>) => {
    cleanups.push(cleanup)
  }
  let url: string
  beforeAll(async () => {
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
  }, timeout)
  afterAll(async () => {
    for (const cleanup of cleanups.reverse()) {
      await cleanup()
    }
  })

  const expectCssOnlyOnMatch = async (name: string) => {
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
    const { shows } = routes[name]!
    if (shows !== undefined) {
      await page.waitForText(shows, { selector: '#app' })
    }
    await expect
      .poll(() => probeColor(page, name), { timeout: 5_000 })
      .toBe(color)
  }

  // SPEC J2.22: a route's CSS loads only when the route matches, whatever
  // it mounts. The CSS import moves with a split component's chunk.
  test.each(['shows-component', 'shows-error', 'shows-not-found'])(
    'the CSS of the /%s route applies only once the route matches',
    expectCssOnlyOnMatch,
    timeout,
  )

  // Bug: with no split component to carry it (a pending component, which
  // the default groupings do not split, or no component), the code splitter
  // keeps the bare CSS import in the route module, which the route tree
  // imports eagerly: in dev the CSS is injected on every page once the
  // client runs, and in a build it is merged into the entry's CSS, which
  // every page links.
  // Source: #4396.
  // Impact: a route's styles apply on every page of the app.
  test.fails.each(['shows-pending', 'shows-nothing'])(
    'the CSS of the /%s route applies only once the route matches',
    expectCssOnlyOnMatch,
    timeout,
  )
})
