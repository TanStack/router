/**
 * The edit scenario of the route-tree-rebuild dev tests, shared by their
 * Vite (`route-edits-after-tree-rebuild.test.ts`) and Rsbuild
 * (`rsbuild/route-edits-after-tree-rebuild.test.ts`) files: a route's
 * loader is edited, the route tree is rebuilt (a route added, a route
 * renamed), and the loader is edited again. Every edit shows on the
 * route's open page. Found by the compiler soak on Rsbuild: after a route
 * tree rebuild, the second loader edit never showed (the route HMR runtime
 * only updated the first evaluation of the route module, while the rebuilt
 * tree held the module's current export as the live route).
 */
import { expect } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import {
  hmrSyncModule,
  trackRequests,
} from '@tanstack/compiler-test-utils/hmr-sync'
import { reactApp } from './hydrate-dev-edits'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'

/** A route whose loader returns `token`, shown by its component. */
export const loaderRoute = (token: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/with-loader')({
  loader: async () => ({ probe: '${token}' }),
  component: Page,
})
function Page() {
  const data = Route.useLoaderData()
  return <p data-probe="loader">{data.probe}</p>
}
`

const childRoute = (path: string, text: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('${path}')({
  component: () => <p data-probe="child">${text}</p>,
})
`

/** The files of the app: the loader route, a route to rename, an index. */
export const treeRebuildApp = {
  ...reactApp,
  // Vite: the page tells the harness when it took in what the server sent (`settlePage`)
  'src/hmr-sync.ts': hmrSyncModule,
  'harness/client-entry.ts': `import '../src/hmr-sync'\n${reactApp['harness/client-entry.ts']}`,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <p>index</p> })
`,
  'src/routes/with-loader.tsx': loaderRoute('probe-loader-v0'),
  'src/routes/renamed.tsx': childRoute('/renamed', 'renamed-route'),
}

/** What the scenario needs of a dev server (Vite's and Rsbuild's harnesses differ in names). */
export interface TreeRebuildServer {
  url: string | undefined
  edit: (files: Record<string, string | null>) => Promise<unknown>
  rename: (from: string, to: string) => Promise<void>
  /** Waits for the compiles of a rename. */
  settled: () => Promise<void>
  /**
   * Waits until a page took in everything the server sent it, a reload it
   * announced included (Vite reloads the pages of a changed route tree;
   * `settlePage`): an edit made before that would be missed by the page.
   */
  settlePage?: (page: BrowserPage, inFlight: () => number) => Promise<void>
}

/**
 * Edits the loader, adds a route, edits the loader, renames a route, edits
 * the loader: each loader edit must show on the loader route's page (open
 * from the start), and each tree change on a page visiting the new route.
 */
export async function editLoaderAroundTreeRebuilds(
  server: TreeRebuildServer,
  registerCleanup: (fn: () => Promise<void> | void) => void,
): Promise<{ loader: BrowserPage; visit: BrowserPage }> {
  const open = async (url: string) => {
    const page = await openPage(`${server.url}${url}`, { registerCleanup })
    await page.waitForText('hydrated', { selector: '[data-testid=hydrated]' })
    return page
  }
  const loader = await open('/with-loader')
  const inFlight = trackRequests(loader)
  await loader.waitForText('probe-loader-v0', {
    selector: '[data-probe=loader]',
  })
  const visit = await open('/')
  let shown = 'probe-loader-v0'
  const loaderShows = async (token: string) => {
    await server.edit({ 'src/routes/with-loader.tsx': loaderRoute(token) })
    await loader.waitForText(token, {
      selector: '[data-probe=loader]',
      timeout: 20_000,
    })
    shown = token
  }
  const visits = async (url: string, text: string) => {
    await visit.page.goto(`${server.url}${url}`)
    await visit.waitForText(text, { selector: '[data-probe=child]' })
  }
  /** An edit that rebuilds the route tree; the loader page settles on it before the next edit. */
  const treeChange = async (edit: () => Promise<unknown>) => {
    await edit()
    await server.settlePage?.(loader, inFlight)
    await loader.waitForText(shown, { selector: '[data-probe=loader]' })
  }

  await loaderShows('probe-loader-v1')
  // a route added: the route tree is regenerated
  await treeChange(() =>
    server.edit({
      'src/routes/added.tsx': childRoute('/added', 'added-route'),
    }),
  )
  await visits('/added', 'added-route')
  await loaderShows('probe-loader-v2')
  // a route renamed: the tree is regenerated again
  await treeChange(async () => {
    await server.rename('src/routes/renamed.tsx', 'src/routes/renamed-2.tsx')
    await server.settled()
    return server.edit({
      'src/routes/renamed-2.tsx': childRoute('/renamed-2', 'renamed-route'),
    })
  })
  await visits('/renamed-2', 'renamed-route')
  await loaderShows('probe-loader-v3')

  expect(loader.errors).toEqual([])
  expect(visit.errors).toEqual([])
  return { loader, visit }
}
