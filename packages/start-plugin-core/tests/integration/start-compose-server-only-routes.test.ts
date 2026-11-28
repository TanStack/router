/**
 * Server-only routes among pages (SPEC J2.15, J1.9, J1.13):
 * a route with only server handlers (`/admin`) that is the parent of a page
 * (`/admin/users`), a server-only subtree (`/api`, `/api/users`), and a
 * page whose component comes in through a spread (`/spread`), and a route
 * with server handlers whose component is in its `.lazy` file (`/pair`). Built with
 * Start's Vite and Rsbuild plugins and served like a deployed app
 * (start-compose-app.ts): the client route tree keeps the page under its
 * server-only ancestor and the spread route, and leaves out the server-only
 * subtree, so client-side navigation reaches the pages and finds nothing at
 * the server-only routes (the `.lazy` component is client-visible: `/pair`
 * stays); the server keeps every route: each handler
 * answers and each page renders; and the generated route tree's types know
 * every route (tsc). The page under the server-only ancestor has a server
 * handler of its own, reading a Node builtin through a helper: Start's
 * client `deleteNodes` takes both with the handler, so the client build
 * neither resolves nor warns about it (SPEC J2.14, J4.12, G16).
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { beforeAll, describe, expect, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { expectNoDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { closeAfterAll } from '../file-end'
import { buildStartShared, startBundlers } from '../build-harness'
import { probeRoutePath } from '../request-probe'
import {
  openAppPage,
  pageEntries,
  rootDocument,
  routerFile,
  serveStartBuildShared,
  startPageEntries,
  typeCheck,
} from './start-compose-app'
import type { AppPage, ServedStartBuild } from './start-compose-app'
import type { StartBuild } from '../build-harness'

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
    '/pair',
  ]),
  'src/routes/index.tsx': `${head}export const Route = createFileRoute('/')({ component: () => <p>MARK_HOME</p> })\n`,
  // A server-only route with a page under it (its handler answers POST, so
  // nothing renders at its own path).
  'src/routes/admin.tsx': `${head}export const Route = createFileRoute('/admin')({ ${handler('POST', 'MARK_ADMIN_HANDLER')} })\n`,
  'src/routes/admin/users.tsx': `${head}import { Buffer } from 'node:buffer'
const encode = (value: string) => Buffer.from(value).toString('base64')
export const Route = createFileRoute('/admin/users')({
  server: { handlers: { POST: () => new Response(encode('admin users')) } },
  component: () => <p>MARK_ADMIN_PAGE</p>,
})
`,
  // A server-only subtree.
  'src/routes/api/route.tsx': `${head}export const Route = createFileRoute('/api')({ ${handler('GET', 'MARK_API_HANDLER')} })\n`,
  'src/routes/api/users.ts': `${head}export const Route = createFileRoute('/api/users')({ ${handler('GET', 'MARK_USERS_HANDLER')} })\n`,
  // A page whose component the route options spread in (its handler
  // answers POST, so GET renders the page).
  'src/routes/spread.tsx': `${head}const page = { component: () => <p>MARK_SPREAD_PAGE</p> }
export const Route = createFileRoute('/spread')({ ${handler('POST', 'MARK_SPREAD_HANDLER')}, ...page })
`,
  // A route with server handlers whose page is in its lazy file (its
  // handler answers POST, so GET renders the page).
  'src/routes/pair.tsx': `${head}export const Route = createFileRoute('/pair')({ ${handler('POST', 'MARK_PAIR_HANDLER')} })\n`,
  'src/routes/pair.lazy.tsx': `import { createLazyFileRoute } from '@tanstack/react-router'
export const Route = createLazyFileRoute('/pair')({ component: () => <p>MARK_PAIR_PAGE</p> })
`,
  'src/router.ts': routerFile,
  // The types of the builtin the handler above reads, as @types/node gives
  // them to a real app (the type check below loads no `@types`).
  'src/node-buffer.d.ts': `declare module 'node:buffer' {
  export const Buffer: { from(value: string): { toString(encoding: string): string } }
}
`,
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
  '/pair',
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
  Expect<'/pair' extends FileRouteTypes['to'] ? true : false>,
  Expect<'/admin' extends FileRouteTypes['id'] ? true : false>,
  Expect<'/api' extends FileRouteTypes['id'] ? true : false>,
  Expect<'/api/users' extends FileRouteTypes['id'] ? true : false>,
]
`

describe.each(startBundlers)('%s build, served', (bundler) => {
  let build: StartBuild
  let served: ServedStartBuild
  /** Ids of the routes of the client build's route tree. */
  let clientRoutes: Array<string>

  const building = closeAfterAll()
  const serving = closeAfterAll()
  beforeAll(async () => {
    build = await building(() =>
      buildStartShared({
        bundler,
        files,
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
      }),
    )
    served = await serving(() => serveStartBuildShared(build))
    // (a page of the hook's own: `openAppPage` closes its page with a test)
    const page = await openPage(new URL('/', served.url).href)
    try {
      await page.waitForText('hydrated', { selector: '[data-testid=hydrated]' })
      clientRoutes = await page.page.evaluate<Array<string>>(
        `(() => { ${routeIds}; return ids(globalThis.__app.getRouter().routeTree) })()`,
      )
    } finally {
      await page.close()
    }
  }, 60_000)

  test('the server route tree has every route', async () => {
    const { result } = await build.ssr.run(
      `${routeIds}\nreturn ids(entry.getRouter().routeTree)`,
    )
    // (besides the harness's probe route, which serves the requests SSR
    // scripts run in)
    expect(
      (result as Array<string>).filter((id) => id !== probeRoutePath).sort(),
    ).toEqual([...allRoutes].sort())
  })

  test('every server handler answers, and every page renders on the server', async () => {
    const text = async (pathname: string, method: 'GET' | 'POST' = 'GET') =>
      (await served.fetch(pathname, { method })).text()
    expect({
      admin: await text('/admin', 'POST'),
      adminUsers: await text('/admin/users', 'POST'),
      spread: await text('/spread', 'POST'),
      pair: await text('/pair', 'POST'),
      api: await text('/api'),
      users: await text('/api/users'),
      adminPage: await text('/admin/users'),
      spreadPage: await text('/spread'),
      pairPage: await text('/pair'),
    }).toEqual({
      admin: 'MARK_ADMIN_HANDLER',
      adminUsers: Buffer.from('admin users').toString('base64'),
      spread: 'MARK_SPREAD_HANDLER',
      pair: 'MARK_PAIR_HANDLER',
      api: 'MARK_API_HANDLER',
      users: 'MARK_USERS_HANDLER',
      adminPage: expect.stringContaining('MARK_ADMIN_PAGE'),
      spreadPage: expect.stringContaining('MARK_SPREAD_PAGE'),
      pairPage: expect.stringContaining('MARK_PAIR_PAGE'),
    })
  })

  test('the client build neither bundles nor warns about the builtin only a deleted handler reads', () => {
    expect(build.client.where('node:buffer')).toBe('nowhere')
    expectNoDiagnostic(build.client.warnings, {
      file: 'src/routes/admin/users.tsx',
      root: build.root,
    })
  })

  test('the generated route tree types every route', async () => {
    await writeFile(path.join(build.ssr.root, 'src/check.ts'), typeChecks)
    expect(
      typeCheck(build.ssr.root, [
        'src/routeTree.gen.ts',
        'src/check.ts',
        'src/node-buffer.d.ts',
      ]),
    ).toEqual([])
  })

  test('the client route tree keeps the page under its server-only ancestor, and the ancestor', () => {
    expect(clientRoutes).toEqual(
      expect.arrayContaining(['/', '/admin', '/admin/users']),
    )
  })

  // Rsbuild: same bug as start-build-route-option-keys.test.ts "a route with
  // only server handlers is not in the client route tree" (only Start's
  // Vite plugin prunes the client route tree).
  test('the client route tree leaves out the server-only subtree', () => {
    expect(clientRoutes.filter((id) => id.startsWith('/api'))).toEqual([])
  })

  // Vite: same bug as start-build-route-option-keys.test.ts "a route with server
  // handlers and these options is in the client route tree: a spread" (the
  // route generator misses the spread component, so Start takes the route
  // for server-only and prunes it; Rsbuild prunes nothing).
  test('the client route tree keeps the page whose component is spread in', () => {
    expect(clientRoutes).toContain('/spread')
  })

  // A `.lazy` file's options are client-visible props of the route
  // (overall #1: the lazy component was not counted).
  test('the client route tree keeps the route whose component is in its lazy file', () => {
    expect(clientRoutes).toContain('/pair')
  })

  test('client-side navigation reaches the page in a lazy file of a route with server handlers', async () => {
    const page = await openAppPage(served, '/')
    await page.waitForText('MARK_HOME', { selector: '#app' })
    await page.follow('pair')
    expect(await settledOutlet(page, /\/pair$/)).toContain('MARK_PAIR_PAGE')
    expect(page.loads()).toBe(1)
  })

  test('client-side navigation reaches the page under the server-only ancestor', async () => {
    const page = await openAppPage(served, '/')
    await page.waitForText('MARK_HOME', { selector: '#app' })
    await page.follow('adminusers')
    await page.waitForText('MARK_ADMIN_PAGE', { selector: '#app' })
    await page.follow('home')
    await page.waitForText('MARK_HOME', { selector: '#app' })
    expect({ loads: page.loads(), errors: page.errors }).toEqual({
      loads: 1,
      errors: [],
    })
  })

  // Rsbuild: the server-only route is in the client route tree (pinned
  // above), so the navigation finds a route without a page.
  test('client-side navigation to a server-only route finds nothing', async () => {
    const page = await openAppPage(served, '/')
    await page.waitForText('MARK_HOME', { selector: '#app' })
    await page.follow('apiusers')
    expect(await settledOutlet(page, /\/api\/users$/)).toContain(
      'MARK_NOT_FOUND',
    )
    expect(page.loads()).toBe(1)
  })

  // Vite: the spread route is pruned (pinned above).
  test('client-side navigation reaches the page whose component is spread in', async () => {
    const page = await openAppPage(served, '/')
    await page.waitForText('MARK_HOME', { selector: '#app' })
    await page.follow('spread')
    expect(await settledOutlet(page, /\/spread$/)).toContain('MARK_SPREAD_PAGE')
    expect(page.loads()).toBe(1)
  })
})
