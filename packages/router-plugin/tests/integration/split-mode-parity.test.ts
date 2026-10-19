/**
 * Dev/build parity of the split decision (FIX-PLAN V2-16; SPEC G13, J2.13):
 * for one app and one configuration, which route options are lazy, which
 * load together and which `deleteNodes` removed are the same in a dev
 * server and in a production build, on Vite and on Rsbuild, and are what
 * the configuration asks for. The app has a route with the default
 * groupings, one with its own `codeSplitGroupings`, one the plugin's
 * `splitBehavior` groups, and one with the options Start deletes from the
 * client (`ssr`, `server`, `headers`). Each loader and component imports a
 * module recording when it loads (`loadMarker`), and the same script
 * observes every environment through the real router's public contract
 * (`component.preload()`, a loader call) in a real browser page.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pluginReact } from '@rsbuild/plugin-react'
import react from '@vitejs/plugin-react'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { createRsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import {
  loadMarker,
  loadedModulesExpression,
} from '@tanstack/compiler-test-utils/importers'
import { tanstackRouter as tanstackRouterRspack } from '../../src/rspack'
import { build, buildWithRsbuild, routeHead } from '../build-harness'
import { routerDevServer } from '../dev-server'
import type { RouterPluginOptions } from '../build-harness'
import type { RsbuildPlugin } from '@rsbuild/core'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))
const timeout = 90_000

/** The route files and the marker modules their options import. */
function routeFiles() {
  const files: Record<string, string> = {
    'routes/__root.tsx': `import { Outlet, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: () => <Outlet /> })
`,
  }
  const route = (id: string, file: string, options: string) => {
    const name = file.replace(/\.tsx$/, '')
    files[`markers/${name}-loader.ts`] =
      `${loadMarker(`${id}:loader`)}export const data = 'MARK_${name.toUpperCase()}_DATA'\n`
    files[`markers/${name}-component.ts`] =
      `${loadMarker(`${id}:component`)}export const label = 'MARK_${name.toUpperCase()}_LABEL'\n`
    files[`routes/${file}`] =
      `${routeHead()}import { data } from '../markers/${name}-loader'
import { label } from '../markers/${name}-component'
export const Route = createFileRoute('${id}')({
  loader: () => data,
  component: () => <p>{label}</p>,${options}
})
`
  }
  route('/', 'index.tsx', '')
  route(
    '/grouped',
    'grouped.tsx',
    `
  codeSplitGroupings: [['loader', 'component']],`,
  )
  route('/behavior', 'behavior.tsx', '')
  // The options Start deletes from the client are `ssr`, `server` and
  // `headers`; `server` exists only with Start's types, so this plain
  // router app has the other two.
  route(
    '/deleted',
    'deleted.tsx',
    `
  ssr: false,
  headers: () => ({ 'x-mark': 'MARK_DELETED_HEADER' }),`,
  )
  return files
}

const pluginOptions: RouterPluginOptions = {
  codeSplittingOptions: {
    deleteNodes: ['ssr', 'server', 'headers'],
    splitBehavior: ({ routeId }) =>
      routeId === '/behavior' ? [['loader'], ['component']] : undefined,
  },
}

/**
 * Body of an async function observing, for each route of `tree` (a route
 * tree of the real router), which of its options are lazy (loading one
 * records a marker module that had not loaded), whether loading the
 * component brings the loader's code (one group), and which of the
 * options Start deletes from the client are there.
 */
const observe = `const loaded = () => [...${loadedModulesExpression}]
const routes = (route) => Object.values(route.children ?? {}).flatMap((child) => [child, ...routes(child)])
const result = {}
for (const route of routes(tree)) {
  const id = route.options.id
  const marker = (option) => id + ':' + option
  const before = loaded()
  await route.options.component?.preload?.()
  const afterComponent = loaded()
  await route.options.loader?.()
  const afterLoader = loaded()
  result[id] = {
    serverOptions: ['ssr', 'server', 'headers'].filter((key) => key in route.options),
    componentLazy: !before.includes(marker('component')) && afterComponent.includes(marker('component')),
    loaderLazy: !before.includes(marker('loader')) && afterLoader.includes(marker('loader')),
    loaderWithComponent: !before.includes(marker('loader')) && afterComponent.includes(marker('loader')),
  }
}
return result`

type Observation = Record<
  string,
  {
    serverOptions: Array<string>
    componentLazy: boolean
    loaderLazy: boolean
    loaderWithComponent: boolean
  }
>

/** What the configuration asks for, per route. */
const expected: Observation = {
  '/': {
    serverOptions: [],
    componentLazy: true,
    loaderLazy: false,
    loaderWithComponent: false,
  },
  '/grouped': {
    serverOptions: [],
    componentLazy: true,
    loaderLazy: true,
    loaderWithComponent: true,
  },
  '/behavior': {
    serverOptions: [],
    componentLazy: true,
    loaderLazy: true,
    loaderWithComponent: false,
  },
  '/deleted': {
    serverOptions: [],
    componentLazy: true,
    loaderLazy: false,
    loaderWithComponent: false,
  },
}

/** Observes a production client build in a page (`app.run`). */
async function observeBuild(app: {
  run: (script: string) => Promise<{ result: unknown }>
}) {
  const { result } = await app.run(`const tree = entry.routeTree\n${observe}`)
  return result as Observation
}

/**
 * The page of a dev server: exposes the generated route tree as
 * `globalThis.__app.routeTree` and shows `MARK_READY` (it renders no route,
 * so nothing loads before the observation).
 */
const devPageFiles = {
  'index.html': `<!doctype html>
<html>
  <body>
    <div id="app"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
`,
  'main.tsx': `import { routeTree } from './routeTree.gen'
;(globalThis as any).__app = { routeTree }
document.getElementById('app')!.textContent = 'MARK_READY'
`,
}

/**
 * The Vite page's entry: React Refresh's preamble first
 * (`@vitejs/plugin-react`'s virtual module for entries of its own), as the
 * route modules the tree imports are compiled with Fast Refresh.
 */
const vitePageFiles = {
  ...devPageFiles,
  'main.tsx': `import '@vitejs/plugin-react/preamble'\n${devPageFiles['main.tsx']}`,
}

/** Observes a dev server's client in a real page. */
async function observeDevPage(
  url: string,
  registerCleanup: (cleanup: () => Promise<void>) => void,
) {
  const page = await openPage(url, { registerCleanup })
  await page.waitForText('MARK_READY', { selector: '#app' })
  const result = await page.page.evaluate<Observation>(
    `(async () => { const tree = globalThis.__app.routeTree\n${observe} })()`,
  )
  expect(page.errors).toEqual([])
  return result
}

describe('the split decision in dev and in a production build', () => {
  const cleanups: Array<() => Promise<void>> = []
  const registerCleanup = (cleanup: () => Promise<void>) => {
    cleanups.push(cleanup)
  }
  const observations: Record<string, Observation> = {}

  beforeAll(async () => {
    const files = routeFiles()
    const entry = `export { routeTree } from './routeTree.gen'\n`
    // The dev servers first, one at a time, the builds after: a production
    // build sets the process's `NODE_ENV` to `production` while it runs
    // (as a build command does), and a dev server starting meanwhile would
    // be configured from it.
    await Promise.all([
      (async () => {
        const server = await routerDevServer({
          browser: true,
          registerCleanup,
          files: { ...files, ...vitePageFiles },
          pluginOptions,
          plugins: [react()],
          config: {
            optimizeDeps: {
              include: [
                'react',
                'react/jsx-dev-runtime',
                'react-dom',
                'react-dom/client',
                '@tanstack/react-router',
              ],
            },
          },
        })
        observations.viteDev = await observeDevPage(
          server.url!,
          registerCleanup,
        )
      })(),
    ])
    // One dev server at a time: a second one starting meanwhile changes
    // the process's environment the first one is configured from.
    await Promise.all([
      (async () => {
        const server = await createRsbuildDevServer({
          dir: harnessDir,
          prefix: '.split-mode-parity-rsbuild-',
          registerCleanup,
          browser: true,
          entry: 'main.tsx',
          files: { ...files, 'main.tsx': devPageFiles['main.tsx'] },
          config: { html: { mountId: 'app' } },
          plugins: ({ root }) => [
            pluginReact(),
            {
              name: 'split-mode-parity',
              setup(api) {
                api.modifyRspackConfig((config) => {
                  config.plugins.push(
                    tanstackRouterRspack({
                      target: 'react',
                      autoCodeSplitting: true,
                      // The Rspack plugin resolves relative paths from the
                      // working directory
                      routesDirectory: path.join(root, 'routes'),
                      generatedRouteTree: path.join(root, 'routeTree.gen.ts'),
                      ...pluginOptions,
                    }),
                  )
                })
              },
            } satisfies RsbuildPlugin,
          ],
        })
        observations.rsbuildDev = await observeDevPage(
          server.url!,
          registerCleanup,
        )
      })(),
    ])
    await Promise.all([
      (async () => {
        const app = await build({
          bundler: 'vite',
          env: 'client',
          files: { ...files, 'entry.ts': entry },
          pluginOptions,
          registerCleanup,
        })
        observations.viteBuild = await observeBuild(app)
      })(),
      (async () => {
        const app = await buildWithRsbuild({
          files: { ...files, 'entry.ts': entry },
          pluginOptions,
          registerCleanup,
        })
        observations.rsbuildBuild = await observeBuild(app)
      })(),
    ])
  }, timeout)

  afterAll(async () => {
    await Promise.all(cleanups.map((cleanup) => cleanup()))
  })

  test.each(['vite', 'rsbuild'])(
    '%s: the production build splits, groups and deletes as configured',
    (bundler) => {
      expect(observations[`${bundler}Build`]).toEqual(expected)
    },
  )

  test.each(['vite', 'rsbuild'])(
    '%s: the dev server splits, groups and deletes like the production build',
    (bundler) => {
      expect(observations[`${bundler}Dev`]).toEqual(
        observations[`${bundler}Build`],
      )
    },
  )
})
