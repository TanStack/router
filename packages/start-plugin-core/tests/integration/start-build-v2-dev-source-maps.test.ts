/**
 * Source maps in development of a server fn module (SPEC G6, dev as in
 * build): Start's dev servers (Vite and Rsbuild, with Start's whole plugin)
 * serve a map for the client module in which the server fn became an RPC
 * stub and for every server module derived from the file (the SSR caller,
 * the provider the server fn resolver loads), and a throw's position in
 * each resolves to the user's file and line. The derived modules are found
 * by what they hold, whatever they are (Vite: every module the SSR
 * environment served for a call by id; Rsbuild: the emitted files), never
 * by their ids or by the file a module graph attaches them to (SPEC §5.3).
 * Maps are
 * read with the standard consumer (`@tanstack/compiler-test-utils/
 * source-maps`).
 * Source: FIX-PLAN V2-15b (#6667, #3828 as quoted).
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  expectMapsTo,
  inlineSourceMap,
  positionAt,
  tokenOffsets,
} from '@tanstack/compiler-test-utils/source-maps'
import { callServerFn, startDevServer, startRequestFiles } from '../dev-server'
import {
  reportedErrors,
  startRsbuildStartDevServer,
} from '../rsbuild-dev-server'
import type { AnySourceMap } from '@tanstack/compiler-test-utils/source-maps'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'

const timeout = 60_000

/** A server fn whose handler throws, next to a client function that throws. */
const fail = `import { createServerFn } from '@tanstack/react-start'
import { secret } from './secret'
export const getSecret = createServerFn().handler(async () => {
  throw new Error('MARK_HANDLER_THROW ' + secret())
})
export function fail(): never {
  throw new Error('MARK_CLIENT_THROW')
}
`
const files = {
  'src/fail.ts': fail,
  'src/secret.ts': `export const secret = () => 'MARK_SECRET'\n`,
}
const markers = ['MARK_HANDLER_THROW ', 'MARK_CLIENT_THROW']

/** The 1-based line of `marker` in the user's file: the line of its throw. */
function lineOf(marker: string) {
  return positionAt(fail, tokenOffsets(fail, { string: marker })[0]!).line
}

/**
 * Asserts that every marker `code` holds maps, through `map`, to the user's
 * file at the marker's line. Returns the markers found.
 */
function expectMarkersMapToFile(
  id: string,
  code: string,
  map: AnySourceMap | undefined,
  root: string,
  mapUrl?: string,
) {
  const held = markers.filter((marker) => code.includes(marker))
  if (held.length === 0) {
    return held
  }
  expect(
    map,
    `${id} holds ${held.join(', ')} and has a source map`,
  ).toBeDefined()
  for (const marker of held) {
    const [offset] = tokenOffsets(code, { string: marker }, { filename: id })
    expect(offset, `the string ${marker} in ${id}`).toBeDefined()
    expectMapsTo(map!, positionAt(code, offset!), {
      file: 'src/fail.ts',
      root,
      mapUrl,
      line: lineOf(marker),
    })
  }
  return held
}

describe('vite dev server', () => {
  test(
    'the client stub module and every server module of the file map a throw to its line in the file',
    async () => {
      const server = await startDevServer({
        start: {},
        listen: true,
        files: { ...startRequestFiles, ...files },
      })
      // The client module, as the browser gets it (an inline map).
      const { status, body } = await server.fetch('/src/fail.ts')
      expect(status).toBe(200)
      expect(
        expectMarkersMapToFile(
          '/src/fail.ts',
          body,
          inlineSourceMap(body),
          server.root,
          // (the module's URL path is relative to the app root)
          path.join(server.root, 'src/fail.ts'),
        ),
      ).toEqual(['MARK_CLIENT_THROW'])
      // A call by id loads the server modules of the file: the SSR caller
      // and whatever module the resolver runs the handler from. Every module
      // the SSR environment served is checked.
      const { getSecret } = await server.import('/src/fail.ts')
      await expect(callServerFn(server, getSecret)).rejects.toThrow(
        /MARK_HANDLER_THROW/,
      )
      const ssr = server.vite.environments.ssr
      const modules = [...ssr.moduleGraph.idToModuleMap.values()]
      const checked: Array<string> = []
      for (const module of modules) {
        const result = module.transformResult
        if (!result) {
          continue
        }
        const held = expectMarkersMapToFile(
          module.id ?? module.url,
          result.code,
          result.map ? (result.map as AnySourceMap) : undefined,
          server.root,
          // (the module's id is its file, with its query)
          module.id ?? path.join(server.root, module.url),
        )
        if (held.length > 0) {
          checked.push(module.url)
        }
      }
      // The handler's throw lives in at least one server module.
      expect(checked.length, checked.join(', ')).toBeGreaterThanOrEqual(1)
      expect(
        modules.some((module) =>
          module.transformResult?.code.includes('MARK_HANDLER_THROW '),
        ),
      ).toBe(true)
    },
    timeout,
  )
})

/**
 * The map of the emitted file `file` of `environment` (relative to the
 * environment's output directory, which Rsbuild's normalized config names):
 * the `.map` next to it.
 */
async function emittedMap(
  server: RsbuildDevServer,
  environment: string,
  file: string,
) {
  const config = await server.rsbuild.getNormalizedConfig({ environment })
  const mapFile = path.resolve(
    server.root,
    config.output.distPath.root,
    `${file}.map`,
  )
  return readFile(mapFile, 'utf8').then(
    (json) => JSON.parse(json) as AnySourceMap,
    () => undefined,
  )
}

describe('rsbuild dev server', () => {
  test(
    'the client stub module and every server module of the file map a throw to its line in the file',
    async () => {
      const server = await startRsbuildStartDevServer({
        files: {
          ...files,
          'src/entry.ts': `export { getSecret, fail } from './fail'\n`,
        },
        config: { output: { sourceMap: { js: 'source-map' } } },
      })
      await server.settle()
      expect(reportedErrors(server)).toEqual([])
      const checked: Record<string, Array<string>> = {}
      for (const environment of ['client', 'ssr']) {
        for (const [file, code] of Object.entries(
          await server.outputs(environment),
        )) {
          const held = expectMarkersMapToFile(
            `${environment}:${file}`,
            code,
            await emittedMap(server, environment, file),
            server.root,
          )
          if (held.length > 0) {
            checked[`${environment}:${file}`] = held
          }
        }
      }
      const held = Object.values(checked).flat()
      expect(held, Object.keys(checked).join(', ')).toContain(
        'MARK_CLIENT_THROW',
      )
      expect(held).toContain('MARK_HANDLER_THROW ')
    },
    timeout,
  )
})
