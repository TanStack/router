/**
 * Start forces route HMR on in its client code splitting (`addHmr: true`,
 * vite/start-router-plugin/plugin.ts, rsbuild/start-router-plugin.ts), so
 * its dev servers serve route modules with route HMR code. Production
 * client builds, through Start's Vite and Rsbuild plugins
 * (build-harness.ts), carry none of it (R7), and the page still renders.
 *
 * The dev-only code is looked for by the names of the HMR APIs and of the
 * React Refresh support route HMR uses; each dev server's client output of
 * the same app has some of them.
 */
import { describe, expect, test } from 'vitest'
import { buildStart, routerRuntimeFiles, startBundlers } from './build-harness'
import { startDevServer } from './dev-server'
import { startRsbuildStartDevServer } from './rsbuild-dev-server'

const timeout = 60_000

/**
 * Names of HMR APIs, route HMR data and React Refresh support.
 * (`__TSR_ROUTER__` is not one: the router sets it in production too.)
 */
const devOnlyNames: Record<string, RegExp> = {
  'import.meta.hot': /\bimport\.meta\.hot\b/,
  'import.meta.webpackHot': /\bimport\.meta\.webpackHot\b/,
  'module.hot': /\bmodule\.hot\b/,
  'tsr-route-id': /tsr-route-id/,
  'tsr-split-component': /tsr-split-component/,
  $RefreshReg$: /\$RefreshReg\$/,
  $RefreshSig$: /\$RefreshSig\$/,
  __TSR_REACT_REFRESH__: /__TSR_REACT_REFRESH__/,
  __getReactRefreshIgnoredExports: /__getReactRefreshIgnoredExports/,
  TSRFastRefreshAnchor: /TSRFastRefreshAnchor/,
}

/** The dev-only names some module of `modules` contains. */
function devOnlyNamesIn(modules: Array<string>) {
  return Object.keys(devOnlyNames).filter((name) =>
    modules.some((code) => devOnlyNames[name]!.test(code)),
  )
}

/** An app with a page route whose loader and component carry markers. */
const files = {
  ...routerRuntimeFiles,
  'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
function Page() {
  return 'MARK_PAGE'
}
export const Route = createFileRoute('/')({
  loader: () => 'MARK_LOADER',
  component: Page,
})
`,
  'src/router.ts': `import { routeTree } from './routeTree.gen'
export const getRouter = () => ({ routeTree })
`,
  'src/entry.ts': `export { getRouter } from './router'\n`,
}

describe("dev servers with Start's plugin add route HMR code (controls)", () => {
  test(
    'Vite dev: the client route module has route HMR code',
    async () => {
      const server = await startDevServer({ start: {}, files })
      const modules = await server.load('/src/routes/index.tsx')
      expect(devOnlyNamesIn(Object.values(modules))).not.toEqual([])
    },
    timeout,
  )

  test(
    'Rsbuild dev: the client output has route HMR code',
    async () => {
      const server = await startRsbuildStartDevServer({ files })
      expect(
        devOnlyNamesIn(Object.values(await server.outputs('client'))),
      ).not.toEqual([])
    },
    timeout,
  )
})

describe.each(startBundlers)('%s production build', (bundler) => {
  // Source: audit E2 missing coverage #1 (only router-plugin's
  // build-production.test.ts checked R7, without Start's forced `addHmr`).
  test(
    'the client output has no route HMR code, and the page renders',
    async () => {
      const { client } = await buildStart({
        bundler,
        files,
        entry: 'src/entry.ts',
      })
      expect(devOnlyNamesIn(client.chunks.map((chunk) => chunk.code))).toEqual(
        [],
      )
      const { result } = await client.run(`const route = Object.values(
  entry.getRouter().routeTree.children,
).find((candidate) => candidate.options.id === '/')
const { loader, component } = route.options
await component.preload?.()
return { loader: await loader(), page: component() }`)
      expect(result).toEqual({ loader: 'MARK_LOADER', page: 'MARK_PAGE' })
    },
    timeout,
  )
})
