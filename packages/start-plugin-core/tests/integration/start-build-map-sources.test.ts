/**
 * Every output Start compiles from one route file names that file once in
 * the emitted source maps (DECISIONS D3: a map's `sources` is the file's
 * path without the compiler's query): the split loader and component, the
 * module they share, the route module, the server fn's RPC stub and its
 * handler on the server each name `src/routes/index.tsx`, hold its text as
 * written, and map a position of their code to its line in the route file.
 * A debugger then shows one file and error trackers group by it. Real
 * production builds, client and SSR, Vite and Rsbuild; maps read from the
 * emitted `.map` files with a standard consumer.
 */
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  emittedMaps,
  emittedSourcePath,
  expectNamesFileOnce,
  originalPositionOf,
  positionAt,
  tokenOffsets,
} from '@tanstack/compiler-test-utils/source-maps'
import { buildStart, startBundlers } from '../build-harness'
import {
  pageEntries,
  rootDocument,
  routerFile,
  startPageEntries,
} from './start-compose-app'

const timeout = 60_000

const route = `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
const shared = { prefix: 'MARK_SHARED' }
export const getLabel = createServerFn().handler(async () => 'MARK_HANDLER')
function Page() {
  return <p>{'MARK_PAGE ' + shared.prefix + Route.useLoaderData()}</p>
}
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['component']],
  loader: async () => shared.prefix + (await getLabel()),
  component: Page,
})
`

/** Asserts the line `marker` (a string of the route file) maps to in the emitted file holding it. */
function expectMarkerMapsToItsLine(
  maps: Awaited<ReturnType<typeof emittedMaps>>,
  root: string,
  marker: string,
) {
  const routeFile = path.join(root, 'src/routes/index.tsx')
  const emitted = maps.find(({ code }) => code.includes(marker))
  expect(emitted, `an emitted file holding ${marker}`).toBeDefined()
  const original = originalPositionOf(
    emitted!.map,
    positionAt(emitted!.code, emitted!.code.indexOf(marker)),
  )
  expect(
    original && emittedSourcePath(original.source, emitted!.file, root),
    marker,
  ).toBe(routeFile)
  expect(original?.line, marker).toBe(
    positionAt(route, tokenOffsets(route, { string: marker })[0]!).line,
  )
}

describe.each(startBundlers)('%s build', (bundler) => {
  test(
    'every output of a route file names it once in the maps, client and server',
    async () => {
      const build = await buildStart({
        bundler,
        sourcemap: true,
        files: {
          ...startPageEntries,
          ...pageEntries,
          'src/router.ts': routerFile,
          'src/routes/__root.tsx': rootDocument(),
          'src/routes/index.tsx': route,
        },
      })
      const routeFile = path.join(build.root, 'src/routes/index.tsx')
      const client = await emittedMaps(build.client.outDir)
      const ssr = await emittedMaps(build.ssr.outDir)
      expectNamesFileOnce(client, build.root, routeFile, route)
      expectNamesFileOnce(ssr, build.root, routeFile, route)
      expectMarkerMapsToItsLine(client, build.root, 'MARK_PAGE ')
      expectMarkerMapsToItsLine(ssr, build.root, 'MARK_HANDLER')
    },
    timeout,
  )
})
