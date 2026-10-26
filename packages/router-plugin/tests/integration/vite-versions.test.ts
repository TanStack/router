/**
 * The router plugin on the Vite majors its peer range admits besides the
 * workspace's (6 and 7; the suite runs on 8): a production build splits the
 * route and renders it; a dev server splits it and a route-option edit
 * hot-updates the page in place. Each version is an aliased package
 * (`@tanstack/compiler-vite-versions`) running its own plugin container on a real Chromium
 * page, with Vite's own TypeScript and JSX transform (no framework plugin:
 * the workspace's React plugin needs Vite 8). Vite 5's latest release fails
 * the workspace's trust policy and cannot be installed: not covered.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, onTestFinished, test } from 'vitest'
import { viteVersions } from '@tanstack/compiler-vite-versions'
import { servedDirectories } from '@tanstack/compiler-test-utils/app-directory'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { createApp } from '@tanstack/compiler-test-utils/build-harness'
import { runNodeProgram } from '@tanstack/compiler-test-utils/run-node'
import { tanstackRouter } from '../../src/vite'
import { head, rootRoute, ssrRenderEntry } from '../build-harness'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

const route = (label: string) => `${head}function Page() {
  return <p>MARK_COMPONENT</p>
}
export const Route = createFileRoute('/')({
  staticData: { label: '${label}' },
  component: Page,
})
`

const files = {
  'routes/__root.tsx': rootRoute,
  'routes/index.tsx': route('MARK_V1'),
  'entry.ts': ssrRenderEntry,
  'index.html': `<!doctype html><div id="root"></div><script type="module" src="/main.tsx"></script>`,
  'main.tsx': `import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { Route } from './routes/index'
// The router's lazy component (its public preload(), gone once it loaded)
;(window as any).__tsrSplit = typeof (Route.options.component as any)?.preload === 'function'
const router = createRouter({ routeTree })
;(window as any).__tsrRouter = router
import.meta.hot?.on('vite:beforeFullReload', () => console.log('hmr-full-reload'))
createRoot(document.getElementById('root')!).render(createElement(RouterProvider, { router }))
`,
}

const pluginOptions = (root: string) => ({
  target: 'react' as const,
  autoCodeSplitting: true,
  routesDirectory: path.join(root, 'routes'),
  generatedRouteTree: path.join(root, 'routeTree.gen.ts'),
})

describe.each(viteVersions)('Vite $major', ({ major, load }) => {
  test('a production build splits the route component and renders it', async () => {
    const vite = await load()
    const app = await createApp({
      dir: harnessDir,
      prefix: `.vite${major}-build-`,
      files,
      packageJson: { type: 'module' },
      registerCleanup: onTestFinished,
    })
    const outDir = path.join(app.root, 'dist')
    await vite.build({
      root: app.root,
      configFile: false,
      logLevel: 'silent',
      plugins: [tanstackRouter(pluginOptions(app.root))],
      esbuild: { jsx: 'automatic' },
      build: {
        ssr: 'entry.ts',
        outDir,
        minify: false,
        rollupOptions: { output: { entryFileNames: 'entry.js' } },
      },
    })
    const chunks = await Promise.all(
      (await readdir(outDir, { recursive: true }))
        .filter((name) => name.endsWith('.js'))
        .map(async (name) => ({
          name,
          code: await readFile(path.join(outDir, name), 'utf8'),
        })),
    )
    const holding = chunks.filter((c) => c.code.includes('MARK_COMPONENT'))
    expect(holding.map((c) => c.name)).not.toContain('entry.js')
    expect(holding.length).toBeGreaterThan(0)
    const { stdout } = await runNodeProgram(
      `import * as entry from ${JSON.stringify(path.join(outDir, 'entry.js'))}
console.log(await entry.render(entry.Route.options.component))`,
      { cwd: app.root },
    )
    expect(stdout.trim()).toBe('<p>MARK_COMPONENT</p>')
  }, 120_000)

  test('a dev server splits the route component and hot-updates a route option edit in place', async () => {
    const vite = await load()
    const app = await createApp({
      dir: harnessDir,
      prefix: `.vite${major}-dev-`,
      files,
      registerCleanup: onTestFinished,
    })
    const logs: Array<string> = []
    const log = (level: string) => (message: unknown) => {
      logs.push(`${level}: ${String(message)}`)
    }
    const server = await vite.createServer({
      root: app.root,
      configFile: false,
      appType: 'spa',
      clearScreen: false,
      customLogger: {
        info: log('info'),
        warn: log('warn'),
        warnOnce: log('warn'),
        error: log('error'),
        clearScreen() {},
        hasErrorLogged: () => false,
        hasWarned: false,
      },
      cacheDir: path.join(app.root, 'node_modules/.vite'),
      esbuild: { jsx: 'automatic' },
      optimizeDeps: {
        include: [
          'react',
          'react/jsx-runtime',
          'react/jsx-dev-runtime',
          'react-dom/client',
          '@tanstack/react-router',
        ],
      },
      server: {
        host: '127.0.0.1',
        fs: { allow: await servedDirectories(app.root) },
      },
      plugins: [tanstackRouter(pluginOptions(app.root))],
    })
    onTestFinished(() => server.close())
    await server.listen()
    const url = server.resolvedUrls?.local[0]
    if (!url) {
      throw new Error('the dev server has no URL')
    }
    const browser = await openPage(url, { registerCleanup: onTestFinished })
    await browser.waitForText('MARK_COMPONENT', { selector: '#root' })
    // The live route of the page's router, which the route HMR updates
    const label = () =>
      browser.page.evaluate(
        () =>
          (window as any).__tsrRouter.routesById['/'].options.staticData
            .label as string,
      )
    const split = await browser.page.evaluate(
      () => (window as any).__tsrSplit as boolean,
    )
    expect({ split, label: await label() }).toEqual({
      split: true,
      label: 'MARK_V1',
    })

    await writeFile(path.join(app.root, 'routes/index.tsx'), route('MARK_V2'))
    await browser.page
      .waitForFunction(
        () =>
          (window as any).__tsrRouter.routesById['/'].options.staticData
            .label === 'MARK_V2',
        null,
        { timeout: 15_000 },
      )
      .catch((error: unknown) => {
        throw new Error(
          `${String(error)}\nlogs:\n${logs.join('\n')}\nconsole:\n${browser.console.join('\n')}\nloads: ${browser.loads()}`,
        )
      })
    // In place: the route module accepted its own update
    expect({ loads: browser.loads(), errors: browser.errors }).toEqual({
      loads: 1,
      errors: [],
    })
  }, 120_000)
})
