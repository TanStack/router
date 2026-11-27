/** Generated trees mounted by the real framework and router in Chromium. */
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createServer } from 'vite'
import { linkDirectory } from '@tanstack/compiler-test-utils/app-directory'
import { runInPage } from '@tanstack/compiler-test-utils/browser'
import { runAsDevCommand } from '@tanstack/compiler-test-utils/dev-command'
import { openDiagnosticChannel } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { runDirectory } from '@tanstack/compiler-test-utils/run-directory'
import { onFileFinished } from '@tanstack/compiler-test-utils/test-scope'
import { inputsOf } from './consumer-inputs'
import type { PluginOption, ViteDevServer } from 'vite'

const nodeModules = path.resolve(import.meta.dirname, '../node_modules')

/** The packages a framework's page imports, pre-bundled once per server. */
const prebundled: Record<string, Array<string>> = {
  react: ['react', 'react/jsx-dev-runtime', 'react-dom/client', 'react-dom'],
  solid: ['solid-js', 'solid-js/web'],
  vue: ['vue'],
}

/**
 * The dev server of a framework shared by the apps of one test file (closed
 * when the file ends): the packages are pre-bundled once, and the browser
 * keeps what it fetched of them (one origin). Each app is served from its
 * own directory (`/@fs/`), each page is a new document.
 */
const servers = new Map<string, Promise<ViteDevServer>>()

function serverOf(framework: string) {
  let server = servers.get(framework)
  if (!server) {
    server = createConsumerServer(framework)
    servers.set(framework, server)
    onFileFinished(async () => {
      servers.delete(framework)
      await (await server!).close()
    })
  }
  return server
}

async function createConsumerServer(framework: string) {
  // (the packages every app links: pre-bundled from this root)
  const root = await mkdtemp(path.join(runDirectory(), 'tsr-client-'))
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
  const channel = openDiagnosticChannel()
  const server = await runAsDevCommand(async () =>
    createServer({
      root,
      cacheDir: path.join(root, '.vite'),
      configFile: false,
      envDir: false,
      appType: 'custom',
      plugins,
      customLogger: channel.viteLogger(),
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
  const close = server.close.bind(server)
  server.close = async () => {
    try {
      await close()
    } finally {
      channel.close()
      await rm(root, { recursive: true, force: true })
    }
  }
  return server
}

export async function createClientConsumer(
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
  const server = await serverOf(framework)
  const base = server.resolvedUrls!.local[0]!
  return {
    async renderAt(url: string, expectedParagraphs: Array<string>) {
      const result = await runInPage<string>({
        pageUrl: new URL('/__consumer.html', base).href,
        moduleUrl: new URL(
          '/@fs/' + entry.replaceAll(path.sep, '/').replace(/^\/+/, ''),
          base,
        ).href,
        script: `return module.renderAt(${JSON.stringify(url)}, ${JSON.stringify(expectedParagraphs)})`,
      })
      if (result.errors.length) {
        throw new Error(result.errors.join('\n'))
      }
      return result.result
    },
    async close() {
      await rm(entry, { force: true })
    },
  }
}
