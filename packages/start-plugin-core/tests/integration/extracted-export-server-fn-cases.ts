/**
 * An exported value only the split component reads, whose evaluation runs
 * a function of the route file that declares a server fn in its body
 * (Vite and Rsbuild production builds, Start's whole plugin, the server
 * bundle run by Start's own server entry inside a real request, the client
 * bundle in a browser). On the server the nested server fn is one binding
 * of the route module; the value reads it when it evaluates (it calls the
 * function, or hands it to an imported function that may call it then), so
 * it evaluates where that binding exists: the page renders what the source
 * gives, on the server and in the browser alike. Run with the compiler's
 * self-checks on (`start-build-extracted-export-server-fn.test.ts`) and
 * off, as in users' builds (`…-unchecked.test.ts`), where a compile the
 * self-checks would refuse builds and the page shows the result.
 * Source: the phase-end differential fuzz (F-PEG-1, seeds 1500250 1504862
 * 1509681 1510216 1514297 1515610 1516178 1519063).
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../build-harness'
import type { StartBuild } from '../build-harness'

const timeout = 60_000

const panel = `function Panel() {
  const inner = createServerFn().handler(async () => 'srv')
  return typeof inner
}
`

const files = {
  'src/keep.ts': 'export const keep = <T,>(value: T): T => value\n',
  // the value calls the function when it evaluates
  'src/routes/called.tsx': `import { createServerFn } from '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
${panel}export const x = [Panel()]
export const Route = createFileRoute('/called')({
  component: () => <p>MARK_CALLED {x.join()}</p>,
})
`,
  // the value hands the function to an imported function, which may call
  // it then (here it does not: the component calls it)
  'src/routes/passed.tsx': `import { createServerFn } from '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import { keep } from '../keep'
${panel}export const y = keep(Panel)
export const Route = createFileRoute('/passed')({
  component: () => <p>MARK_PASSED {y()}</p>,
})
`,
  'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
  'src/entry.ts': `export { getRouter } from './router'
export { renderPath } from '../harness/render'
`,
}

const render = `const { routeTree } = entry.getRouter()
return {
  called: await entry.renderPath(routeTree, '/called'),
  passed: await entry.renderPath(routeTree, '/passed'),
}`

const expected = {
  called: expect.stringContaining('MARK_CALLED <!-- -->function'),
  passed: expect.stringContaining('MARK_PASSED <!-- -->function'),
}

export function extractedExportServerFnTests() {
  describe.each(startBundlers)('a %s production build', (bundler) => {
    let build: StartBuild
    let dispose: (() => Promise<void>) | undefined
    beforeAll(async () => {
      build = await buildStart({
        bundler,
        files,
        entry: 'src/entry.ts',
        registerCleanup: (cleanup) => {
          dispose = cleanup
        },
      })
    }, timeout)
    afterAll(() => dispose?.())

    test(
      'SSR: an exported value running a function that declares a server fn renders what the source gives',
      async () => {
        const { result } = await build.ssr.run(render)
        expect(result).toEqual(expected)
      },
      timeout,
    )

    test(
      'client: an exported value running a function that declares a server fn renders what the source gives',
      async () => {
        const { result } = await build.client.run(render)
        expect(result).toEqual(expected)
      },
      timeout,
    )
  })
}
