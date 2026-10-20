/**
 * Dev/build parity of the split decision (FIX-PLAN V2-16; SPEC G13, J2.13,
 * J2.2, J2.3): for one app and one configuration, which route options are
 * lazy, which load together and which `deleteNodes` removed are the same in
 * a dev server and in a production build, on Vite and on Rsbuild, and are
 * what the configuration asks for; the loaders return and the routes render
 * what they did unsplit. The app's routes cover the precedence of the
 * groupings (a route's own `codeSplitGroupings` over the plugin's
 * `splitBehavior` over its `defaultBehavior`), the five splittable options
 * (`component`, `errorComponent`, `pendingComponent`, `notFoundComponent`,
 * `loader`) and the options Start deletes from the client (`ssr`, `server`,
 * `headers`). Each option imports a module recording when it loads
 * (`loadMarker`), and the same script observes every environment through
 * the real router's public contract (`preload()` of a component, a loader
 * call, then the route rendered by the real router) in a real browser page.
 *
 * Which options load together is observed from each group's first option:
 * the routes come in pairs with the same options and groupings, one
 * observed in the order of `options`, the other (`-reverse`) in the reverse
 * order, so a group that loads from one of its options but not from another
 * (or that pulls in another group) shows.
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
import type { CodeSplitGroupings } from '../../src/core/constants'
import type { RsbuildPlugin } from '@rsbuild/core'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))
const timeout = 90_000

/** The splittable options, in the order the forward routes observe them. */
const options = [
  'component',
  'errorComponent',
  'pendingComponent',
  'notFoundComponent',
  'loader',
] as const

/** The plugin's groupings for routes that set none of their own. */
const defaultBehavior: CodeSplitGroupings = [
  ['component', 'errorComponent'],
  ['loader'],
]
/** The plugin's groupings for `/behavior` (over `defaultBehavior`). */
const behaviorGroupings: CodeSplitGroupings = [['loader'], ['component']]
/** `/grouped`'s own groupings (over `splitBehavior` and `defaultBehavior`). */
const routeGroupings: CodeSplitGroupings = [
  ['loader', 'component'],
  ['pendingComponent'],
  ['notFoundComponent', 'errorComponent'],
]

const pluginOptions: RouterPluginOptions = {
  codeSplittingOptions: {
    deleteNodes: ['ssr', 'server', 'headers'],
    defaultBehavior,
    splitBehavior: ({ routeId }) =>
      routeId.startsWith('/behavior') ? behaviorGroupings : undefined,
  },
}

/** The routes: id, the groupings that apply, and extra route options. */
const routes = [
  { id: '/', groupings: defaultBehavior, extra: '' },
  { id: '/reverse', groupings: defaultBehavior, extra: '' },
  {
    id: '/grouped',
    groupings: routeGroupings,
    extra: `\n  codeSplitGroupings: ${JSON.stringify(routeGroupings)},`,
  },
  {
    id: '/grouped-reverse',
    groupings: routeGroupings,
    extra: `\n  codeSplitGroupings: ${JSON.stringify(routeGroupings)},`,
  },
  { id: '/behavior', groupings: behaviorGroupings, extra: '' },
  { id: '/behavior-reverse', groupings: behaviorGroupings, extra: '' },
  // `server` exists only with Start's types, so this plain router app has
  // the other two options Start deletes.
  {
    id: '/deleted',
    groupings: defaultBehavior,
    extra: `
  ssr: false,
  headers: () => ({ 'x-mark': 'MARK_DELETED_HEADER' }),`,
  },
]

/** File name of a route (`/` is `index`). */
const fileOf = (id: string) => (id === '/' ? 'index' : id.slice(1))

/** Marker text of a route's option module. */
const markOf = (id: string, option: string) =>
  `MARK_${fileOf(id).replaceAll('-', '_').toUpperCase()}_${option.toUpperCase()}`

/**
 * The app: the route files, the marker modules their options import, and
 * `app.tsx`, which exports the route tree and `renderAt(path, text)`
 * (renders the app at `path` through the real router and returns its HTML
 * once it shows `text`, or after 2 seconds).
 */
function appFiles() {
  const files: Record<string, string> = {
    'routes/__root.tsx': `import { Outlet, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: () => <Outlet /> })
`,
    'app.tsx': `import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export { routeTree }
export async function renderAt(path: string, text: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  flushSync(() => root.render(createElement(RouterProvider, { router })))
  for (let tries = 0; tries < 200 && !container.innerHTML.includes(text); tries++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  const html = container.innerHTML
  root.unmount()
  container.remove()
  return html
}
`,
  }
  for (const { id, extra } of routes) {
    const name = fileOf(id)
    const imports = options
      .map(
        (option) =>
          `import { mark as ${option}Mark } from '../markers/${name}-${option}'`,
      )
      .join('\n')
    for (const option of options) {
      files[`markers/${name}-${option}.ts`] =
        `${loadMarker(`${id}:${option}`)}export const mark = '${markOf(id, option)}'\n`
    }
    files[`routes/${name}.tsx`] = `${routeHead()}${imports}
export const Route = createFileRoute('${id}')({
  loader: () => loaderMark,
  component: () => <p>{componentMark} {Route.useLoaderData()}</p>,
  errorComponent: () => <p>{errorComponentMark}</p>,
  pendingComponent: () => <p>{pendingComponentMark}</p>,
  notFoundComponent: () => <p>{notFoundComponentMark}</p>,${extra}
})
`
  }
  return files
}

/** The order a route's options are activated in by the observation. */
const orderOf = (id: string) =>
  id.endsWith('-reverse') ? [...options].reverse() : [...options]

/**
 * Body of an async function observing, with `app` (`app.tsx`'s exports) in
 * scope, for each route: which of its options are lazy (activating it loads
 * its marker module, which had not loaded), which other options' modules
 * activating it loads, what its loader returns, which of the options Start
 * deletes from the client are there, and whether the route renders its
 * component with its loader's data through the real router.
 */
const observe = `const loaded = () => [...${loadedModulesExpression}]
const all = (route) => Object.values(route.children ?? {}).flatMap((child) => [child, ...all(child)])
const options = ${JSON.stringify(options)}
const result = {}
for (const route of all(app.routeTree)) {
  const id = route.options.id
  const order = id.endsWith('-reverse') ? [...options].reverse() : options
  const lazy = {}
  const loadsWith = {}
  let data
  for (const option of order) {
    const before = loaded()
    const value = route.options[option]
    if (option === 'loader') {
      data = await (typeof value === 'function' ? value() : value?.handler?.())
    } else {
      await value?.preload?.()
    }
    const after = loaded().filter((name) => !before.includes(name))
    lazy[option] = after.includes(id + ':' + option)
    loadsWith[option] = options.filter((other) => other !== option && after.includes(id + ':' + other)).sort()
  }
  result[id] = {
    serverOptions: ['ssr', 'server', 'headers'].filter((key) => key in route.options),
    lazy,
    loadsWith,
    data,
  }
}
for (const id of Object.keys(result)) {
  result[id].html = await app.renderAt(id, result[id].data)
}
return result`

type Observation = Record<
  string,
  {
    serverOptions: Array<string>
    lazy: Record<string, boolean>
    loadsWith: Record<string, Array<string>>
    data: string
    renders: boolean
  }
>

/**
 * An observation of the page, its routes' HTML read as whether each route
 * rendered its component with its loader's data.
 */
function readObservation(
  observed: Record<string, Observation[string] & { html?: string }>,
): Observation {
  return Object.fromEntries(
    Object.entries(observed).map(([id, { html = '', ...route }]) => [
      id,
      {
        ...route,
        renders:
          html.includes(markOf(id, 'component')) && html.includes(route.data),
      },
    ]),
  )
}

/**
 * What the configuration asks for, per route: an option of a group is lazy
 * when it is the first of its group the observation activates, and then
 * loads the rest of its group and nothing else; an option in no group loads
 * with the route module.
 */
function expectedObservation(): Observation {
  const observation: Observation = {}
  for (const { id, groupings } of routes) {
    const done = new Set<string>()
    const lazy: Record<string, boolean> = {}
    const loadsWith: Record<string, Array<string>> = {}
    for (const option of orderOf(id)) {
      const group = groupings.find((members) =>
        (members as Array<string>).includes(option),
      ) as Array<string> | undefined
      const first = group !== undefined && !done.has(option)
      lazy[option] = first
      loadsWith[option] = first
        ? group.filter((other) => other !== option).sort()
        : []
      group?.forEach((member) => done.add(member))
    }
    observation[id] = {
      serverOptions: [],
      lazy,
      loadsWith,
      data: markOf(id, 'loader'),
      renders: true,
    }
  }
  return observation
}

/** Observes a production client build in a page (`app.run`). */
async function observeBuild(app: {
  run: (script: string) => Promise<{ result: unknown }>
}) {
  const { result } = await app.run(`const app = entry\n${observe}`)
  return readObservation(result as Observation)
}

/**
 * The page of a dev server: exposes `app.tsx`'s exports as
 * `globalThis.__app` and shows `MARK_READY` (it renders no route, so
 * nothing loads before the observation).
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
  'main.tsx': `import * as app from './app'
;(globalThis as any).__app = app
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
    `(async () => { const app = globalThis.__app\n${observe} })()`,
  )
  expect(page.errors).toEqual([])
  return readObservation(result)
}

describe('the split decision in dev and in a production build', () => {
  const cleanups: Array<() => Promise<void>> = []
  const registerCleanup = (cleanup: () => Promise<void>) => {
    cleanups.push(cleanup)
  }
  const observations: Record<string, Observation> = {}
  /** Where the code of the deleted `headers` option is, per build. */
  const deletedCode: Record<string, string> = {}

  beforeAll(async () => {
    const files = appFiles()
    const entry = `export * from './app'\n`
    // The dev servers first, one at a time, the builds after: a production
    // build sets the process's `NODE_ENV` to `production` while it runs
    // (as a build command does), and a dev server starting meanwhile would
    // be configured from it.
    const viteServer = await routerDevServer({
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
      viteServer.url!,
      registerCleanup,
    )
    // One dev server at a time: a second one starting meanwhile changes
    // the process's environment the first one is configured from.
    const rsbuildServer = await createRsbuildDevServer({
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
      rsbuildServer.url!,
      registerCleanup,
    )
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
        deletedCode.vite = app.where('MARK_DELETED_HEADER')
      })(),
      (async () => {
        const app = await buildWithRsbuild({
          files: { ...files, 'entry.ts': entry },
          pluginOptions,
          registerCleanup,
        })
        observations.rsbuildBuild = await observeBuild(app)
        deletedCode.rsbuild = app.where('MARK_DELETED_HEADER')
      })(),
    ])
  }, timeout)

  afterAll(async () => {
    await Promise.all(cleanups.map((cleanup) => cleanup()))
  })

  test.each(['vite', 'rsbuild'])(
    '%s: the production build splits, groups and deletes as configured, and the routes work',
    (bundler) => {
      expect(observations[`${bundler}Build`]).toEqual(expectedObservation())
      // The deleted `headers` option's code is in no chunk of the client.
      expect(deletedCode[bundler]).toBe('nowhere')
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
