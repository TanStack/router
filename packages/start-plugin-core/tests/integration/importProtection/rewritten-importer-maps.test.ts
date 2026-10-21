/**
 * An importer whose denied import import protection replaces still maps to
 * its own source (SPEC G6, J6.8): on a Vite dev server with Start's whole
 * public plugin (mock mode), a module of each environment imports a denied
 * module (the client a `*.server.*` file, the server a `*.client.*` file)
 * and throws on a line after that import; the source map the environment
 * serves with the module (Vite's `transformRequest`) maps its `throw` statement back to that original
 * line. The served code is parsed independently (`tokenOffsets`) and mapped
 * with a standard consumer (`expectMapsTo`); the rewritten code's text is
 * never read.
 *
 * Replaces the internal control that read the source map of today's
 * rewrite output (`outside-compiler-corpus/importProtection/rewrite.test.ts`,
 * "the source map maps code after a rewritten import back to its origin").
 */
import { describe, test } from 'vitest'
import {
  expectMapsTo,
  inlineSourceMap,
  positionAt,
  tokenOffsets,
} from '@tanstack/compiler-test-utils/source-maps'
import { startProtectedDevServer } from '../../importProtection/start-apps'

/** A module importing `denied` and throwing on line 3. */
const importer = (denied: string) => `import { value } from '${denied}'
const unrelated = 'MARK_UNRELATED'
export const fail = (): never => { throw new Error('MARK_THROWN ' + unrelated + String(typeof value)) }
`

describe.each([
  { environment: 'client', denied: './secret.server' },
  { environment: 'ssr', denied: './widget.client' },
])('$environment', ({ environment, denied }) => {
  test('the throw after a mocked import maps to its original line', async () => {
    const server = await startProtectedDevServer(
      {
        'src/secret.server.ts': `export const value = () => 'MARK_SECRET'\n`,
        'src/widget.client.ts': `export const value = () => 'MARK_CLIENT'\n`,
        'src/mapped.ts': importer(denied),
        'src/entry.ts': `export * from './mapped'\n`,
      },
      { mockAccess: 'off' },
    )
    // What the environment serves for the module, with its map (Vite's
    // `transformRequest`)
    const served =
      await server.vite.environments[environment]!.transformRequest(
        '/src/mapped.ts',
      )
    const code = served!.code
    const map = (served!.map ?? inlineSourceMap(code)) as Parameters<
      typeof expectMapsTo
    >[0]
    const [throwAt] = tokenOffsets(code, { throw: true })
    expectMapsTo(map, positionAt(code, throwAt!), {
      file: 'src/mapped.ts',
      root: server.root,
      mapUrl: server.file('src/mapped.ts'),
      line: 3,
    })
  }, 30_000)
})
