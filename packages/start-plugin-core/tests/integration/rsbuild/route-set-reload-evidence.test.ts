/**
 * The route-set reload of Start's Rsbuild dev server waits until the server
 * serves what the generator has: a reload sent while the server still
 * builds the route file from its old bytes would load the old page
 * (`route-set-reload-app.ts`). It compares the bytes the server's compiler
 * was handed for the tree and the route files with the generator's, under
 * either path of a linked route file; a file the tree does not import
 * holds nothing up.
 * Source: design-routeset-v5.1.md §6 step 2, tests 5, 6, 7 and 9 (the
 * reviews' `phantom`, `linked`, `unused-root` and `err-recover` drivers).
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from 'vitest'
import { waitForOutcome } from '@tanstack/compiler-test-utils/outcome'
import {
  documentAfter,
  handlerRoute,
  openTab,
  pageRoute,
  startReloadServer,
} from './route-set-reload-app'
import type { Rspack } from '@rsbuild/core'

const timeout = 60_000

// No compiler's watcher has reported the edit yet (they poll), the
// generator's own watcher has: compilations started then (another plugin
// invalidates both compilers) build the client's new pruned tree, and the
// server's tree and route file from what they read before. The reload waits
// for the compilations that build the edit.
// Source: the review's `phantom` ordering (review A of design-routeset-v3).
test(
  "compilers invalidated before their watchers reported the edit: the tab's reload gets the server's new response",
  async () => {
    const compilers = new Map<string, Rspack.Compiler>()
    const reload = await startReloadServer({
      config: {
        tools: {
          rspack: (config, { environment }) => {
            config.watchOptions = { ...config.watchOptions, poll: 4_000 }
            config.plugins.push({
              apply(compiler: Rspack.Compiler) {
                compilers.set(environment.name, compiler)
              },
            })
          },
        },
      },
    })
    const tab = await openTab(reload, '/about')
    await tab.browser.waitForText('MARK_ABOUT', { selector: '#app' })
    const clientBefore = reload.clientHash()
    await reload.server.write({
      'src/routes/about.tsx': handlerRoute('/about', 'HANDLER_NEW'),
      'src/routes/new.tsx': pageRoute('/new', 'MARK_NEW'),
    })
    await waitForOutcome({
      timeout: 10_000,
      applied: async () =>
        (
          await readFile(
            path.join(reload.server.root, 'src/routeTree.gen.ts'),
            'utf8',
          )
        ).includes("'/new'"),
      describe: () => 'the generator did not publish the added route',
    })
    compilers.get('ssr')!.watching!.invalidate()
    compilers.get('client')!.watching!.invalidate()
    await waitForOutcome({
      timeout: 10_000,
      applied: () => reload.clientHash() !== clientBefore,
      describe: () => 'the client did not compile again',
    })
    await tab.loaded(2, { app: false })
    expect(await documentAfter(tab, 1)).toBe('HANDLER_NEW')
  },
  timeout,
)

test(
  'a route file linked from elsewhere in the app: the reload gets the new response, and a route added later reloads the tab',
  async () => {
    const reload = await startReloadServer({
      files: {
        'src/routes/about.tsx': null,
        'src/shared/about-route.tsx': pageRoute('/about', 'MARK_ABOUT'),
      },
      symlinks: { 'src/routes/about.tsx': 'src/shared/about-route.tsx' },
    })
    const tab = await openTab(reload, '/about')
    await tab.browser.waitForText('MARK_ABOUT', { selector: '#app' })
    await reload.server.edit({
      'src/shared/about-route.tsx': handlerRoute('/about', 'HANDLER_NEW'),
    })
    await tab.loaded(2, { app: false })
    expect(await documentAfter(tab, 1)).toBe('HANDLER_NEW')
    await tab.browser.page.goto(new URL('/', reload.url).href)
    await tab.loaded(3)
    await reload.server.edit({
      'src/routes/new.tsx': pageRoute('/new', 'MARK_NEW'),
    })
    await tab.loaded(4)
    await tab.visit('to-new', 'MARK_NEW')
  },
  timeout,
)

test(
  "an edit of a root lazy file the route tree does not import (the app's own code does) holds no later reload",
  async () => {
    const rootLazy = (marker: string) =>
      `import { createLazyFileRoute } from '@tanstack/react-router'
export const Route = createLazyFileRoute('__root__')({})
export const marker = '${marker}'
`
    const reload = await startReloadServer({
      files: {
        'src/routes/__root.lazy.tsx': rootLazy('ROOT_LAZY_1'),
        'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import './hmr-sync'
import './routes/__root.lazy'
export const getRouter = () => createRouter({ routeTree })
`,
      },
    })
    const tab = await openTab(reload, '/')
    await reload.server.edit({
      'src/routes/__root.lazy.tsx': rootLazy('ROOT_LAZY_2'),
    })
    await reload.server.settle()
    await tab.settled()
    const loads = tab.loads()
    await reload.server.edit({
      'src/routes/new.tsx': pageRoute('/new', 'MARK_NEW'),
    })
    await tab.loaded(loads + 1)
    await tab.visit('to-new', 'MARK_NEW')
  },
  timeout,
)

test(
  "a syntax error saved in another route with a page's turn into a handler: once fixed, the reload gets the handler's response",
  async () => {
    const reload = await startReloadServer()
    const tab = await openTab(reload, '/about')
    await tab.browser.waitForText('MARK_ABOUT', { selector: '#app' })
    await reload.server.edit({
      'src/routes/about.tsx': handlerRoute('/about', 'HANDLER_NEW'),
      'src/routes/index.tsx': `${pageRoute('/', 'MARK_INDEX')}export const broken = (\n`,
    })
    await reload.server.edit({
      'src/routes/index.tsx': pageRoute('/', 'MARK_INDEX_FIXED'),
    })
    await tab.loaded(2, { app: false })
    expect(await documentAfter(tab, 1)).toBe('HANDLER_NEW')
    await reload.server.settle()
    expect(tab.documents).toHaveLength(2)
  },
  timeout,
)
