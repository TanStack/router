/**
 * Import protection on a Vite dev server (Start's import-protection plugin
 * after the Start compiler): what the browser gets for a denied import, and
 * the warnings the dev server logs, including after edits (without a
 * restart). The client loads modules the way a browser does: an importer
 * before the modules it imports.
 */
import { describe, expect, test } from 'vitest'
import {
  distinct,
  rejection,
  reportedViolations,
  startProtectedDevServer,
} from './start-apps'
import type { ImportProtectionOptions } from '../../src/schema'

const timeout = 30_000

/** Client modules (by URL) whose served code contains `marker`. */
function modulesContaining(modules: Record<string, string>, marker: string) {
  return Object.keys(modules).filter((url) => modules[url]!.includes(marker))
}

/** `src/a.ts` uses `secret` of the denied file `src/secret.server.ts`. */
const deniedFileApp = {
  'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
  'src/a.ts': `import { secret } from './secret.server'
export const read = () => secret()
`,
}

/** The location reported for `src/a.ts`'s use of `secret`. */
const deniedFileUse = 'src/a.ts:2:27'

describe('a client import of a denied file', () => {
  // Source: oracle-gaps M2 (the warning channel of dev violations).
  test(
    'is mocked, and the dev server logs a warning naming the importer at the use',
    async () => {
      const server = await startProtectedDevServer(deniedFileApp)
      const client = await server.load('/src/a.ts')
      expect(modulesContaining(client, 'MARK_SECRET')).toEqual([])
      expect(
        distinct(
          reportedViolations(server.logs).map(
            ({ environment, importer }) => `${environment} ${importer}`,
          ),
        ),
      ).toEqual([`client ${deniedFileUse}`])
    },
    timeout,
  )

  test(
    'added by an edit of the importer is mocked and logged, without a restart',
    async () => {
      const server = await startProtectedDevServer({
        ...deniedFileApp,
        'src/a.ts': `export const read = () => 'plain'\n`,
      })
      await server.load('/src/a.ts')
      await server.edit({ 'src/a.ts': deniedFileApp['src/a.ts'] })
      const client = await server.load('/src/a.ts')
      expect(modulesContaining(client, 'MARK_SECRET')).toEqual([])
      expect(
        distinct(reportedViolations(server.logs).map((v) => v.importer)),
      ).toEqual([deniedFileUse])
    },
    timeout,
  )

  // Source: oracle-gaps options table (`behavior: { dev, build }`), gap DV39
  // (`behavior: 'error'` in dev).
  test.each<{ behavior: NonNullable<ImportProtectionOptions>['behavior'] }>([
    { behavior: 'error' },
    { behavior: { dev: 'error', build: 'mock' } },
  ])(
    'fails to load with behavior $behavior, naming the importer at the use',
    async ({ behavior }) => {
      const server = await startProtectedDevServer(deniedFileApp, {
        behavior,
      })
      const error = await rejection(server.load('/src/a.ts'))
      expect(reportedViolations(error.message)).toEqual([
        { environment: 'client', importer: deniedFileUse },
      ])
    },
    timeout,
  )

  test(
    'is mocked with behavior { build: "error" } (the dev default applies)',
    async () => {
      const server = await startProtectedDevServer(deniedFileApp, {
        behavior: { build: 'error' },
      })
      const client = await server.load('/src/a.ts')
      expect(modulesContaining(client, 'MARK_SECRET')).toEqual([])
      expect(reportedViolations(server.logs)).not.toEqual([])
    },
    timeout,
  )
})

describe('log', () => {
  /**
   * The violations logged when the client loads `src/a.ts`, and those logged
   * when it loads it again after an edit that keeps the denied import.
   */
  async function logsAroundAnEdit(log: 'once' | 'always') {
    const server = await startProtectedDevServer(deniedFileApp, { log })
    await server.load('/src/a.ts')
    const first = reportedViolations(server.logs)
    await server.edit({
      'src/a.ts': `import { secret } from './secret.server'
export const read = () => secret()
export const other = 1
`,
    })
    await server.load('/src/a.ts')
    return {
      first,
      afterEdit: reportedViolations(server.logs).slice(first.length),
    }
  }

  // Source: oracle-gaps options table (`log`).
  test(
    "'once' does not log a violation again after an edit",
    async () => {
      const { first, afterEdit } = await logsAroundAnEdit('once')
      expect(first).not.toEqual([])
      expect(afterEdit).toEqual([])
    },
    timeout,
  )

  test(
    "'always' logs a violation again after an edit",
    async () => {
      const { first, afterEdit } = await logsAroundAnEdit('always')
      expect(first).not.toEqual([])
      expect(distinct(afterEdit.map((v) => v.importer))).toEqual([
        deniedFileUse,
      ])
    },
    timeout,
  )

  // Bug: in dev, one client import of a denied file is logged twice: once
  // for the import as written (`./secret.server`) and once for the resolved
  // path the dev mock rewrite puts in its place, which Vite resolves again;
  // the dedupe key of `log: 'once'` includes the specifier
  // (`dedupeViolationKey`, import-protection/utils.ts), so the two do not
  // dedupe (vite/import-protection-plugin/plugin.ts, transform-cache import
  // loop and `resolveId`).
  // Impact: every violation of a denied file appears twice in the dev server
  // output, the second time naming the resolved path as the import.
  // Source: found writing the `log` rows (oracle-gaps options table).
  test.fails(
    "'once' logs one warning for one import",
    async () => {
      const server = await startProtectedDevServer(deniedFileApp)
      await server.load('/src/a.ts')
      expect(reportedViolations(server.logs)).toHaveLength(1)
    },
    timeout,
  )
})

describe('a client import of a server-only-marked module', () => {
  /** `src/a.ts` imports `src/b.ts`, which starts with `marker`. */
  const markedApp = (marker: string) => ({
    'src/b.ts': `${marker}export const secret = () => 'MARK_B_CODE'\n`,
    'src/a.ts': `import { secret } from './b'
export const read = () => secret()
`,
  })
  const serverOnly = `import '@tanstack/react-start/server-only'\n`

  // Control for the pins below (same harness): once the server knows the
  // module is server-only, its importers get a mock.
  test(
    'is mocked when the client loaded the module before its importer',
    async () => {
      const server = await startProtectedDevServer(markedApp(serverOnly))
      await server.load('/src/b.ts')
      const client = await server.load('/src/a.ts')
      expect(modulesContaining(client, 'MARK_B_CODE')).toEqual([])
    },
    timeout,
  )

  // Bug: import protection decides to mock an import of a server-only-marked
  // module when it resolves the import, and only knows a module is marked
  // once it has transformed it. A browser requests the importer first, so
  // the import resolves to the real module; when the marker is then found,
  // the violation is only logged (vite/import-protection-plugin/plugin.ts,
  // retroactive marker check in `resolveId`), and the importer keeps its
  // import of the real module.
  // Impact: in dev, the browser runs the real code of server-only-marked
  // modules (in mock mode the import should be a mock), unlike the build,
  // which fails; whether the client gets the mock depends on load order.
  // Source: found writing the DV37 pin below (gaps/dev-hmr.md).
  test.fails(
    'is mocked when the client loads the importer first',
    async () => {
      const server = await startProtectedDevServer(markedApp(serverOnly))
      const client = await server.load('/src/a.ts')
      expect(modulesContaining(client, 'MARK_B_CODE')).toEqual([])
    },
    timeout,
  )

  // Bug: when an edit adds a server-only marker to a module the client
  // already loaded, import protection logs the violation, but the importers
  // keep their transform, and so their import of the real module (same
  // mechanism as the pin above; the opposite edit is pinned in
  // known-bugs-dev-server.test.ts "the importer of a module whose server-only
  // marker was removed loads the module").
  // Impact: after marking a module server-only in dev, the browser keeps
  // running its real code until the importers are edited or the server
  // restarts.
  // Source: gap DV37, adding direction (gaps/dev-hmr.md).
  test.fails(
    'is mocked after an edit adds the marker, and the violation is logged',
    async () => {
      const server = await startProtectedDevServer(markedApp(''))
      expect(
        modulesContaining(await server.load('/src/a.ts'), 'MARK_B_CODE'),
      ).toEqual(['/src/b.ts'])
      await server.edit(markedApp(serverOnly))
      await server.load('/src/b.ts')
      const client = await server.load('/src/a.ts')
      expect(reportedViolations(server.logs)).not.toEqual([])
      expect(modulesContaining(client, 'MARK_B_CODE')).toEqual([])
    },
    timeout,
  )
})
