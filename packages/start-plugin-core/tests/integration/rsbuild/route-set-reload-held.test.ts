/**
 * The route-set reload of Start's Rsbuild dev server under other plugins
 * and environments of the app (`route-set-reload-app.ts`): a third
 * environment with an error of its own holds nothing; while another plugin
 * vetoes the server's emit the tab keeps its document, and once a
 * compilation emits it reloads into the new response; another `pre` loader
 * of the route tree (Start's loader is not the first to read it) holds no
 * reload; and a lazy file added to a route (its route ids unchanged) is a
 * change of the client's tree.
 * Source: design-routeset-v5.1.md §6 step 2, tests 8, 10, 11 and 12 (the
 * reviews' `third`, `emit-current`, `veto-recover`, `treepre` and `lazy`
 * drivers).
 */
import path from 'node:path'
import { expect, test } from 'vitest'
import {
  documentAfter,
  handlerRoute,
  openTab,
  pageRoute,
  startReloadServer,
} from './route-set-reload-app'
import type { Rspack } from '@rsbuild/core'

test('a third environment with a syntax error in its own entry: a route added reloads the tab', async () => {
  const reload = await startReloadServer({
    files: { 'src/extra.ts': 'export const broken = (\n' },
    config: {
      environments: {
        extra: { source: { entry: { extra: './src/extra.ts' } } },
      },
      // (Rsbuild's overlay of that environment's error would cover the page)
      dev: { client: { overlay: false } },
    },
  })
  const tab = await openTab(reload, '/')
  await reload.server.edit({
    'src/routes/new.tsx': pageRoute('/new', 'MARK_NEW'),
  })
  await tab.loaded(2)
  await tab.visit('to-new', 'MARK_NEW')
})

test("while another plugin vetoes the server's emit the tab keeps its document; the next emit reloads it into the handler", async () => {
  let vetoed = false
  const veto: Rspack.RspackPluginInstance = {
    apply(compiler) {
      compiler.hooks.shouldEmit.tap('test:veto', () =>
        vetoed ? false : undefined,
      )
    },
  }
  const reload = await startReloadServer({
    config: {
      tools: {
        rspack: (config, { environment }) => {
          if (environment.name === 'ssr') {
            config.plugins.push(veto)
          }
        },
      },
    },
  })
  const tab = await openTab(reload, '/about')
  await tab.browser.waitForText('MARK_ABOUT', { selector: '#app' })
  vetoed = true
  await reload.server.edit({
    'src/routes/about.tsx': handlerRoute('/about', 'HANDLER_NEW'),
  })
  await reload.server.settle()
  await tab.settled()
  expect(tab.loads()).toBe(1)
  expect(tab.documents).toHaveLength(1)
  vetoed = false
  await reload.server.edit({
    'src/routes/index.tsx': pageRoute('/', 'MARK_INDEX_EDITED'),
  })
  await tab.loaded(2, { app: false })
  expect(await documentAfter(tab, 1)).toBe('HANDLER_NEW')
})

test("another pre loader reads the server's route tree first: a route added, then a handler turned into a page, reach the tab", async () => {
  const reload = await startReloadServer({
    files: {
      'src/routes/about.tsx': handlerRoute('/about', 'HANDLER'),
      'pass-through.cjs': 'module.exports = (source) => source\n',
    },
    config: {
      tools: {
        rspack: (config, { environment }) => {
          if (environment.name === 'ssr') {
            ;(config.module.rules ??= []).push({
              test: /routeTree\.gen\.ts$/,
              enforce: 'pre',
              use: [{ loader: path.join(config.context!, 'pass-through.cjs') }],
            })
          }
        },
      },
    },
  })
  const tab = await openTab(reload, '/')
  await reload.server.edit({
    'src/routes/extra.tsx': pageRoute('/extra', 'MARK_EXTRA'),
  })
  await tab.loaded(2)
  await reload.server.edit({
    'src/routes/about.tsx': pageRoute('/about', 'MARK_ABOUT_PAGE'),
  })
  await tab.loaded(3)
  await tab.visit('to-about', 'MARK_ABOUT_PAGE')
})

test('a lazy file added to a route: the tab reloads once and shows its component', async () => {
  const reload = await startReloadServer()
  const tab = await openTab(reload, '/about')
  await tab.browser.waitForText('MARK_ABOUT', { selector: '#app' })
  await reload.server.edit({
    'src/routes/about.lazy.tsx': `import { createLazyFileRoute } from '@tanstack/react-router'
export const Route = createLazyFileRoute('/about')({ component: () => <p>MARK_ABOUT_LAZY</p> })
`,
  })
  await tab.loaded(2)
  await tab.browser.waitForText('MARK_ABOUT_LAZY', { selector: '#app' })
  await reload.server.settle()
  expect(tab.loads()).toBe(2)
})
