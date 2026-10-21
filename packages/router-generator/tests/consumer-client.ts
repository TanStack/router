/** Generated trees mounted by the real framework and router in Chromium. */
import { randomUUID } from 'node:crypto'
import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createServer } from 'vite'
import { runInPage } from '@tanstack/compiler-test-utils/browser'
import { openDiagnosticChannel } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { inputsOf } from './consumer-inputs'
import type { PluginOption } from 'vite'

export async function createClientConsumer(
  treeFile: string,
  framework: string,
) {
  const { root } = inputsOf(treeFile)
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
    `import * as runtime from '@tanstack/${framework}-router'
import { routeTree } from ${JSON.stringify('./' + path.basename(treeFile))}
${mount}
export async function renderAt(url) {
  const router = runtime.createRouter({ routeTree, history: runtime.createMemoryHistory({ initialEntries: [url] }) })
  await router.load()
  const target = document.getElementById('root')
  await mount(router, target)
  return target.innerHTML
}
`,
  )
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
  const server = await createServer({
    root,
    cacheDir: path.join(root, '.vite-consumer', framework),
    configFile: false,
    envDir: false,
    appType: 'custom',
    plugins,
    customLogger: channel.viteLogger(),
    server: { host: '127.0.0.1', port: 0, watch: null },
    optimizeDeps: {
      include: [
        `@tanstack/${framework}-router`,
        ...(framework === 'react'
          ? ['react', 'react-dom/client', 'react-dom']
          : framework === 'solid'
            ? ['solid-js', 'solid-js/web']
            : ['vue']),
      ],
    },
  })
  await server.listen()
  const base = server.resolvedUrls!.local[0]!
  return {
    async renderAt(url: string) {
      const result = await runInPage<string>({
        pageUrl: new URL('/__consumer.html', base).href,
        moduleUrl: new URL(
          '/' + path.relative(root, entry).replaceAll(path.sep, '/'),
          base,
        ).href,
        script: `return module.renderAt(${JSON.stringify(url)})`,
      })
      if (result.errors.length) {
        throw new Error(result.errors.join('\n'))
      }
      return result.result
    },
    async close() {
      try {
        await server.close()
      } finally {
        channel.close()
        await rm(entry, { force: true })
      }
    },
  }
}
