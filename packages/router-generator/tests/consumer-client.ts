/** Generated trees mounted by the real framework and router in Chromium. */
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createLogger, createServer } from 'vite'
import { linkDirectory } from '@tanstack/compiler-test-utils/app-directory'
import { runAsDevCommand } from '@tanstack/compiler-test-utils/dev-command'
import { forgetApp, inputsOf } from './consumer-inputs'
import type { Page } from '@tanstack/compiler-test-utils/test'
import type { PluginOption, ViteDevServer } from 'vite'

const nodeModules = path.resolve(import.meta.dirname, '../node_modules')

/** The packages a framework's page imports, pre-bundled once per server. */
const prebundled: Record<string, Array<string>> = {
  react: ['react', 'react/jsx-dev-runtime', 'react-dom/client', 'react-dom'],
  solid: ['solid-js', 'solid-js/web'],
  vue: ['vue'],
}

/**
 * The dev server of a framework shared by the apps of one test file
 * (`clientHost` of tests/test.ts): the packages are pre-bundled once. Each
 * app is served from its own directory (`/@fs/`), each render is a new
 * document.
 */
export type ClientHost = (framework: string) => Promise<ViteDevServer>

/** What a render in the browser uses: the file's servers, the test's page. */
export interface ClientPages {
  host: ClientHost
  page: Page
  /** The page's errors (`pageErrors` of the shared fixtures). */
  pageErrors: Array<string>
}

/**
 * Starts the dev server of `framework` in a new directory of `dir` (a test
 * file's `fileRoot`, which it goes with); the caller closes it.
 */
export async function createClientServer(dir: string, framework: string) {
  // (the packages every app links: pre-bundled from this root)
  const root = await mkdtemp(path.join(dir, 'tsr-client-'))
  await linkDirectory(nodeModules, path.join(root, 'node_modules'))
  const plugins: Array<PluginOption> = [
    {
      name: 'generator-consumer:page',
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          if (request.url !== '/__consumer.html') {
            next()
            return
          }
          try {
            response.setHeader('Content-Type', 'text/html')
            response.end(
              await server.transformIndexHtml(
                '/__consumer.html',
                '<!doctype html><html><head><link rel="icon" href="data:,"></head><body><div id="root"></div></body></html>',
              ),
            )
          } catch (error) {
            next(error)
          }
        })
      },
    },
  ]
  if (framework === 'vue') {
    plugins.push((await import('@vitejs/plugin-vue')).default())
  }
  if (framework === 'solid') {
    plugins.push((await import('vite-plugin-solid')).default())
  }
  const server = await runAsDevCommand(async () =>
    createServer({
      root,
      cacheDir: path.join(root, '.vite'),
      configFile: false,
      envDir: false,
      appType: 'custom',
      plugins,
      customLogger: createLogger('silent'),
      // (the apps are outside the root, in their own directories)
      server: {
        host: '127.0.0.1',
        port: 0,
        watch: null,
        fs: { strict: false },
      },
      optimizeDeps: {
        entries: [],
        include: [
          `@tanstack/${framework}-router`,
          '@tanstack/compiler-test-utils/outcome',
          ...prebundled[framework]!,
        ],
      },
    }),
  )
  await server.listen()
  return server
}

export async function createClientConsumer(
  { host, page, pageErrors }: ClientPages,
  treeFile: string,
  framework: string,
) {
  // (the app's imports resolve from its own directory, as the server's do)
  const { root } = inputsOf(treeFile)
  await linkDirectory(nodeModules, path.join(root, 'node_modules')).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') {
        throw error
      }
    },
  )
  const entry = path.join(
    path.dirname(treeFile),
    `.consumer-client-${randomUUID()}.tsx`,
  )
  const mount =
    framework === 'react'
      ? `import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
const mount = (router, target) => flushSync(() => createRoot(target).render(createElement(runtime.RouterProvider, { router })))`
      : framework === 'vue'
        ? `import { createApp, h, nextTick } from 'vue'
const mount = async (router, target) => {
  createApp({ render: () => h(runtime.RouterProvider, { router }) }).mount(target)
  await nextTick()
}`
        : `import { render, createComponent } from 'solid-js/web'
const mount = (router, target) => render(() => createComponent(runtime.RouterProvider, { router }), target)`
  await writeFile(
    entry,
    `import { waitForOutcome } from '@tanstack/compiler-test-utils/outcome'
import * as runtime from '@tanstack/${framework}-router'
import { routeTree } from ${JSON.stringify('./' + path.basename(treeFile))}
${mount}
export async function renderAt(url, expectedParagraphs) {
  const router = runtime.createRouter({ routeTree, history: runtime.createMemoryHistory({ initialEntries: [url] }) })
  await router.load()
  const target = document.getElementById('root')
  await mount(router, target)
  await waitForOutcome({
    applied: () => JSON.stringify([...target.querySelectorAll('p')].map((element) => element.textContent)) === JSON.stringify(expectedParagraphs),
    timeout: 15_000,
    describe: () => target.innerHTML,
  })
  return target.innerHTML
}
`,
  )
  const server = await host(framework)
  // (the app's files as they are now)
  forgetApp(server.environments.client, root)
  const base = server.resolvedUrls!.local[0]!
  return {
    /** Renders `url` in a new document of the page. */
    async renderAt(url: string, expectedParagraphs: Array<string>) {
      const moduleUrl = new URL(
        '/@fs/' + entry.replaceAll(path.sep, '/').replace(/^\/+/, ''),
        base,
      ).href
      const errors = pageErrors.length
      await page.goto(new URL('/__consumer.html', base).href)
      // (a string, run as the page's own code: a function would be
      // serialised as the test runner transformed it)
      const html = await page.evaluate<string>(
        `import(${JSON.stringify(moduleUrl)}).then((module) => module.renderAt(${JSON.stringify(url)}, ${JSON.stringify(expectedParagraphs)}))`,
      )
      if (pageErrors.length > errors) {
        throw new Error(pageErrors.slice(errors).join('\n'))
      }
      return html
    },
    async close() {
      await rm(entry, { force: true })
    },
  }
}
