/**
 * Server-only routes among pages (FIX-PLAN V2-03; SPEC J2.15, J1.9, J1.13):
 * a route with only server handlers (`/admin`) that is the parent of a page
 * (`/admin/users`), a server-only subtree (`/api`, `/api/users`), and a
 * page whose component comes in through a spread (`/spread`). Built with
 * Start's Vite and Rsbuild plugins and served like a deployed app
 * (start-compose-app.ts): the client route tree keeps the page under its
 * server-only ancestor and the spread route, and leaves out the server-only
 * subtree, so client-side navigation reaches the pages and finds nothing at
 * the server-only routes; the server keeps every route: each handler
 * answers and each page renders; and the generated route tree's types know
 * every route (tsc).
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  onTestFinished,
  test,
} from 'vitest'
import { buildStart, startBundlers } from '../build-harness'
import {
  openAppPage,
  pageEntries,
  rootDocument,
  routerFile,
  serveStartBuild,
  startPageEntries,
  typeCheck,
} from './start-compose-app'
import type { AppPage, ServedStartBuild } from './start-compose-app'
import type { StartBuild } from '../build-harness'

const timeout = 60_000

const head = `import { createFileRoute } from '@tanstack/react-router'\n`
const handler = (method: 'GET' | 'POST', text: string) =>
  `server: { handlers: { ${method}: () => new Response('${text}') } }`

const files = {
  ...startPageEntries,
  'src/routes/__root.tsx': rootDocument([
    '/',
    '/admin/users',
    '/spread',
    '/api/users',
  ]),
  'src/routes/index.tsx': `${head}export const Route = createFileRoute('/')({ component: () => <p>MARK_HOME</p> })\n`,
  // A server-only route with a page under it (its handler answers POST, so
  // nothing renders at its own path).
  'src/routes/admin.tsx': `${head}export const Route = createFileRoute('/admin')({ ${handler('POST', 'MARK_ADMIN_HANDLER')} })\n`,
  'src/routes/admin/users.tsx': `${head}export const Route = createFileRoute('/admin/users')({ component: () => <p>MARK_ADMIN_PAGE</p> })\n`,
  // A server-only subtree.
  'src/routes/api/route.tsx': `${head}export const Route = createFileRoute('/api')({ ${handler('GET', 'MARK_API_HANDLER')} })\n`,
  'src/routes/api/users.ts': `${head}export const Route = createFileRoute('/api/users')({ ${handler('GET', 'MARK_USERS_HANDLER')} })\n`,
  // A page whose component the route options spread in (its handler
  // answers POST, so GET renders the page).
  'src/routes/spread.tsx': `${head}const page = { component: () => <p>MARK_SPREAD_PAGE</p> }
export const Route = createFileRoute('/spread')({ ${handler('POST', 'MARK_SPREAD_HANDLER')}, ...page })
`,
  'src/router.ts': routerFile,
  ...pageEntries,
}

/** Ids of the routes of a route tree of the real router, depth first. */
const routeIds = `const ids = (route) => Object.values(route.children ?? {}).flatMap((child) => [
  child.id,
  ...ids(child),
])`

/**
 * After a link click from the home page: waits until the page's URL
 * matches `url` and the outlet no longer shows the home page, and returns
 * the outlet's text (empty for a route without a page).
 */
async function settledOutlet(page: AppPage, url: RegExp) {
  await page.page.waitForURL(url, { timeout: 5_000 })
  const deadline = Date.now() + 5_000
  let text = await page.text('#app')
  while (text.includes('MARK_HOME') && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25))
    text = await page.text('#app')
  }
  return text
}

/** Every route of the app. */
const allRoutes = [
  '/',
  '/admin',
  '/admin/users',
  '/api',
  '/api/users',
  '/spread',
]

/**
 * Type assertions on the generated route tree: every route, the server-only
 * ones included, is in its types.
 */
const typeChecks = `import type { FileRouteTypes } from './routeTree.gen'
type Expect<T extends true> = T
export type Checks = [
  Expect<'/admin/users' extends FileRouteTypes['to'] ? true : false>,
  Expect<'/spread' extends FileRouteTypes['to'] ? true : false>,
  Expect<'/admin' extends FileRouteTypes['id'] ? true : false>,
  Expect<'/api' extends FileRouteTypes['id'] ? true : false>,
  Expect<'/api/users' extends FileRouteTypes['id'] ? true : false>,
]
`

describe.each(startBundlers)('%s build, served', (bundler) => {
  let build: StartBuild
  let served: ServedStartBuild
  const cleanups: Array<() => Promise<void>> = []
  /** Ids of the routes of the client build's route tree. */
  let clientRoutes: Array<string>

  beforeAll(async () => {
    build = await buildStart({
      bundler,
      files,
      entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
      registerCleanup: (cleanup) => cleanups.push(cleanup),
    })
    served = await serveStartBuild(build, {
      registerCleanup: (cleanup) => cleanups.push(cleanup),
    })
    const page = await openAppPage(served, '/', {
      registerCleanup: (cleanup) => cleanups.push(cleanup),
    })
    clientRoutes = await page.page.evaluate<Array<string>>(
      `(() => { ${routeIds}; return ids(globalThis.__app.getRouter().routeTree) })()`,
    )
  }, timeout)

  afterAll(async () => {
    await Promise.all(cleanups.map((cleanup) => cleanup()))
  })

  test('the server route tree has every route', async () => {
    const { result } = await build.ssr.run(
      `${routeIds}\nreturn ids(entry.getRouter().routeTree)`,
    )
    expect((result as Array<string>).sort()).toEqual([...allRoutes].sort())
  })

  test('every server handler answers, and every page renders on the server', async () => {
    const text = async (pathname: string, method: 'GET' | 'POST' = 'GET') =>
      (await served.fetch(pathname, { method })).text()
    expect({
      admin: await text('/admin', 'POST'),
      spread: await text('/spread', 'POST'),
      api: await text('/api'),
      users: await text('/api/users'),
      adminPage: await text('/admin/users'),
      spreadPage: await text('/spread'),
    }).toEqual({
      admin: 'MARK_ADMIN_HANDLER',
      spread: 'MARK_SPREAD_HANDLER',
      api: 'MARK_API_HANDLER',
      users: 'MARK_USERS_HANDLER',
      adminPage: expect.stringContaining('MARK_ADMIN_PAGE'),
      spreadPage: expect.stringContaining('MARK_SPREAD_PAGE'),
    })
  })

  test('the generated route tree types every route', async () => {
    await writeFile(path.join(build.ssr.root, 'src/check.ts'), typeChecks)
    expect(
      typeCheck(build.ssr.root, ['src/routeTree.gen.ts', 'src/check.ts']),
    ).toEqual([])
  })

  test('the client route tree keeps the page under its server-only ancestor, and the ancestor', () => {
    expect(clientRoutes).toEqual(
      expect.arrayContaining(['/', '/admin', '/admin/users']),
    )
  })

  // Rsbuild: same bug as known-bugs-route-options.test.ts "a route with
  // only server handlers is not in the client route tree" (only Start's
  // Vite plugin prunes the client route tree).
  ;(bundler === 'vite' ? test : test.fails)(
    'the client route tree leaves out the server-only subtree',
    () => {
      expect(clientRoutes.filter((id) => id.startsWith('/api'))).toEqual([])
    },
  )

  // Vite: same bug as known-bugs-route-options.test.ts "a route with server
  // handlers and these options is in the client route tree: a spread" (the
  // route generator misses the spread component, so Start takes the route
  // for server-only and prunes it; Rsbuild prunes nothing).
  ;(bundler === 'vite' ? test.fails : test)(
    'the client route tree keeps the page whose component is spread in',
    () => {
      expect(clientRoutes).toContain('/spread')
    },
  )

  test(
    'client-side navigation reaches the page under the server-only ancestor',
    async () => {
      const page = await openAppPage(served, '/', {
        registerCleanup: onTestFinished,
      })
      await page.waitForText('MARK_HOME', { selector: '#app' })
      await page.follow('adminusers')
      await page.waitForText('MARK_ADMIN_PAGE', { selector: '#app' })
      await page.follow('home')
      await page.waitForText('MARK_HOME', { selector: '#app' })
      expect({ loads: page.loads(), errors: page.errors }).toEqual({
        loads: 1,
        errors: [],
      })
    },
    timeout,
  )

  // Rsbuild: the server-only route is in the client route tree (pinned
  // above), so the navigation finds a route without a page.
  ;(bundler === 'vite' ? test : test.fails)(
    'client-side navigation to a server-only route finds nothing',
    async () => {
      const page = await openAppPage(served, '/', {
        registerCleanup: onTestFinished,
      })
      await page.waitForText('MARK_HOME', { selector: '#app' })
      await page.follow('apiusers')
      expect(await settledOutlet(page, /\/api\/users$/)).toContain(
        'MARK_NOT_FOUND',
      )
      expect(page.loads()).toBe(1)
    },
    timeout,
  )

  // Vite: the spread route is pruned (pinned above).
  ;(bundler === 'vite' ? test.fails : test)(
    'client-side navigation reaches the page whose component is spread in',
    async () => {
      const page = await openAppPage(served, '/', {
        registerCleanup: onTestFinished,
      })
      await page.waitForText('MARK_HOME', { selector: '#app' })
      await page.follow('spread')
      expect(await settledOutlet(page, /\/spread$/)).toContain(
        'MARK_SPREAD_PAGE',
      )
      expect(page.loads()).toBe(1)
    },
    timeout,
  )
})
