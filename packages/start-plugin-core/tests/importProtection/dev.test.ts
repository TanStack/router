/**
 * Import protection on a Vite dev server (Start's import-protection plugin
 * after the Start compiler, with Start's entries registered): what the
 * browser gets for a denied import, and the warnings the dev server logs,
 * including after edits (without a restart). The client loads modules the way
 * a browser does: from the app's router entry `src/entry.ts`, an importer
 * before the modules it imports.
 */
import path from 'node:path'
import { evaluateServed } from '@tanstack/compiler-test-utils/dev-server'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  distinct,
  factoryTopLevelCall,
  reactRuntimeFiles,
  rejection,
  reportedViolations,
  serverFnFactoryApp,
  startProtectedDevServer,
} from './start-apps'
import type { ImportProtectionOptions } from '../../src/schema'

const timeout = 30_000

afterEach(() => {
  vi.restoreAllMocks()
})

/** Client modules (by URL) whose served code contains `marker`. */
function modulesContaining(modules: Record<string, string>, marker: string) {
  return Object.keys(modules).filter((url) => modules[url]!.includes(marker))
}

/** `environment importer` of each distinct violation logged in `logs`. */
function loggedViolations(logs: Array<string>) {
  return distinct(
    reportedViolations(logs).map(
      ({ environment, importer }) => `${environment} ${importer}`,
    ),
  )
}

/** The files of the `Trace:` steps of an import-protection warning. */
function traceFiles(report: string) {
  return (/Trace:\n([\s\S]*?)\n\n/.exec(report)?.[1] ?? '')
    .split('\n')
    .map((line) => /^\s*\d+\. ([^\s:]+)/.exec(line)?.[1])
}

/**
 * `src/a.ts` uses `secret` of the denied file `src/secret.server.ts`; the
 * router entry re-exports `src/a.ts`.
 */
const deniedFileApp = {
  'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
  'src/a.ts': `import { secret } from './secret.server'
export const read = () => secret()
`,
  'src/entry.ts': `export * from './a'\n`,
}

/** The location reported for `src/a.ts`'s use of `secret`. */
const deniedFileUse = 'src/a.ts:2:27'

describe('a client import of a denied file', () => {
  // Source: oracle-gaps M2 (the warning channel of dev violations).
  test(
    'is mocked, and the dev server logs a warning naming the importer at the use',
    async () => {
      const server = await startProtectedDevServer(deniedFileApp)
      const client = await server.load('/src/entry.ts')
      expect(modulesContaining(client, 'MARK_SECRET')).toEqual([])
      expect(loggedViolations(server.logs)).toEqual([`client ${deniedFileUse}`])
    },
    timeout,
  )

  /**
   * Starts the app with a `src/a.ts` that imports nothing, loads it, then
   * edits `src/a.ts` to import the denied file and loads it again.
   */
  async function addDeniedImportByAnEdit() {
    const server = await startProtectedDevServer({
      ...deniedFileApp,
      'src/a.ts': `export const read = () => 'plain'\n`,
    })
    await server.load('/src/entry.ts')
    await server.edit({ 'src/a.ts': deniedFileApp['src/a.ts'] })
    const client = await server.load('/src/entry.ts')
    return { server, client }
  }

  test(
    'added by an edit of the importer is mocked, without a restart',
    async () => {
      const { client } = await addDeniedImportByAnEdit()
      expect(modulesContaining(client, 'MARK_SECRET')).toEqual([])
    },
    timeout,
  )

  // Bug: when a module changes, dev import protection drops every import
  // graph edge that points to it (`hotUpdate` → `ImportGraph.invalidate`,
  // import-protection/trace.ts, removes the edges where the file is the
  // target, not only those where it is the importer). Its importers are not
  // transformed again, so the edges do not come back, and a violation found
  // when the edited module is transformed again is unreachable from Start's
  // router entry: `processPendingViolations`
  // (vite/import-protection-plugin/plugin.ts) discards it.
  // Impact: in dev (mock mode), a denied import added to an existing module
  // by an edit is mocked without any warning; with `log: 'always'`, a
  // violation is not logged again after an edit (the 'always' pin below).
  // A scratch run that keeps the incoming edges passes both pins.
  // Source: found registering Start's entries in the dev harness (mutation
  // run R3, harness gap H1); the trace part is ip-vite V13.
  test.fails(
    'added by an edit of the importer is logged at the use, with a trace from the entry',
    async () => {
      const { server } = await addDeniedImportByAnEdit()
      const reports = server.logs.filter((log) =>
        log.includes('[import-protection] Import denied'),
      )
      expect(
        distinct(reportedViolations(reports).map((v) => v.importer)),
      ).toEqual([deniedFileUse])
      for (const report of reports) {
        expect(traceFiles(report)).toEqual(['src/entry.ts', 'src/a.ts'])
      }
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
      const error = await rejection(server.load('/src/entry.ts'))
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
      const client = await server.load('/src/entry.ts')
      expect(modulesContaining(client, 'MARK_SECRET')).toEqual([])
      expect(reportedViolations(server.logs)).not.toEqual([])
    },
    timeout,
  )
})

describe('log', () => {
  /**
   * The violations logged when the client loads the app, and those logged
   * when it loads it again after an edit of `src/a.ts` that keeps the denied
   * import.
   */
  async function logsAroundAnEdit(log: 'once' | 'always') {
    const server = await startProtectedDevServer(deniedFileApp, { log })
    await server.load('/src/entry.ts')
    const first = reportedViolations(server.logs)
    await server.edit({
      'src/a.ts': `import { secret } from './secret.server'
export const read = () => secret()
export const other = 1
`,
    })
    await server.load('/src/entry.ts')
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

  // Bug: same as "added by an edit of the importer is logged at the use"
  // above: the edit drops the import graph edges to `src/a.ts`, and the
  // violation found when it is transformed again is discarded as unreachable
  // from Start's router entry.
  // Impact: with `log: 'always'`, a violation is not logged again after an
  // edit of its module.
  // Source: found registering Start's entries in the dev harness (mutation
  // run R3, harness gap H1); this test passed while the harness registered
  // no entry.
  test.fails(
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

  // Source: mutation run R3 ip-vite V15.
  test(
    "'always' does not log a violation again when the client loads other modules",
    async () => {
      const server = await startProtectedDevServer(
        {
          ...deniedFileApp,
          'src/b.ts': `export const b = 1\n`,
          'src/c.ts': `export const c = 1\n`,
          'src/entry.ts': `export * from './a'
export { b } from './b'
`,
        },
        { log: 'always' },
      )
      await server.load('/src/entry.ts')
      const first = reportedViolations(server.logs)
      expect(first).not.toEqual([])
      await server.load('/src/c.ts')
      expect(reportedViolations(server.logs)).toEqual(first)
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
      await server.load('/src/entry.ts')
      expect(reportedViolations(server.logs)).toHaveLength(1)
    },
    timeout,
  )
})

describe('a client import of a denied specifier', () => {
  /**
   * `src/a.ts` uses the denied file `src/secret.server.ts` and the denied
   * specifier `@tanstack/react-start/server`.
   */
  const deniedSpecifierApp = {
    'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
    'src/a.ts': `import { secret } from './secret.server'
import { getRequest } from '@tanstack/react-start/server'
export const read = () => String(secret())
export const request = () => getRequest()
`,
    'src/entry.ts': `export * from './a'\n`,
  }

  // Source: mutation run R3 ip-vite V7.
  test(
    'is logged at its use, next to the use of the denied file',
    async () => {
      const server = await startProtectedDevServer(deniedSpecifierApp)
      await server.load('/src/entry.ts')
      expect(loggedViolations(server.logs).sort()).toEqual([
        'client src/a.ts:3:34',
        'client src/a.ts:4:30',
      ])
    },
    timeout,
  )

  // Source: mutation run R3 ip-vite V12.
  test(
    'is a mock that reports its use in the browser console, naming the import, like the mock of the denied file',
    async () => {
      const server = await startProtectedDevServer(deniedSpecifierApp)
      const errors: Array<string> = []
      vi.spyOn(console, 'error').mockImplementation((error: unknown) => {
        errors.push(error instanceof Error ? error.message : String(error))
      })
      const module = await evaluateServed(server, '/src/entry.ts')
      expect(errors).toEqual([])
      expect(String(module.request())).toBe('[import-protection mock]')
      expect(module.read()).toBe('[import-protection mock]')
      const reports = errors
        .filter((error) => error.includes('Mocked import used in dev client'))
        .map((error) => ({
          denied: /Denied import: "([^"]+)"/.exec(error)?.[1],
          access: /Access: (.*)/.exec(error)?.[1],
        }))
      expect(reports).toContainEqual({
        denied: '@tanstack/react-start/server',
        access: expect.stringMatching(/\bgetRequest\(\)/),
      })
      expect(reports).toContainEqual({
        denied: 'src/secret.server.ts',
        access: expect.stringMatching(/\bsecret\(\)/),
      })
    },
    timeout,
  )
})

describe('onViolation', () => {
  // Source: mutation run R3 ip-vite V8.
  test(
    'returning false silences the warning; it receives the importer',
    async () => {
      const importers: Array<string> = []
      const server = await startProtectedDevServer(deniedFileApp, {
        onViolation: (info) => {
          importers.push(info.importer)
          return false
        },
      })
      const client = await server.load('/src/entry.ts')
      expect(modulesContaining(client, 'MARK_SECRET')).toEqual([])
      expect(reportedViolations(server.logs)).toEqual([])
      expect(
        distinct(
          importers.map((importer) => path.relative(server.root, importer)),
        ),
      ).toEqual(['src/a.ts'])
    },
    timeout,
  )

  test.each([
    { name: 'a denied file', files: deniedFileApp },
    {
      name: 'a denied specifier',
      files: {
        'src/a.ts': `import { getRequest } from '@tanstack/react-start/server'
export const read = () => getRequest()
`,
        'src/entry.ts': `export * from './a'\n`,
      },
    },
  ])(
    'with behavior "error", an import of $name it allows loads',
    async ({ files }) => {
      const server = await startProtectedDevServer(files, {
        behavior: 'error',
        onViolation: () => false,
      })
      const client = await server.load('/src/entry.ts')
      expect(Object.keys(client)).toContain('/src/a.ts')
      expect(reportedViolations(server.logs)).toEqual([])
    },
    timeout,
  )
})

describe('a client import of a server-only-marked module', () => {
  /**
   * `src/a.ts` imports `src/b.ts`, which starts with `marker`; the router
   * entry re-exports `src/a.ts`.
   */
  const markedApp = (marker: string) => ({
    'src/b.ts': `${marker}export const secret = () => 'MARK_B_CODE'\n`,
    'src/a.ts': `import { secret } from './b'
export const read = () => secret()
`,
    'src/entry.ts': `export * from './a'\n`,
  })
  const serverOnly = `import '@tanstack/react-start/server-only'\n`

  // Control for the pins below (same harness): once the server knows the
  // module is server-only, its importers get a mock.
  test(
    'is mocked when the client loaded the module before its importer',
    async () => {
      const server = await startProtectedDevServer(markedApp(serverOnly))
      await server.load('/src/b.ts')
      const client = await server.load('/src/entry.ts')
      expect(modulesContaining(client, 'MARK_B_CODE')).toEqual([])
    },
    timeout,
  )

  // Source: mutation run R3 ip-vite V2 (the logging half of the pin below,
  // which passes).
  test(
    "is logged at the importer's use when the client loads the importer first",
    async () => {
      const server = await startProtectedDevServer(markedApp(serverOnly))
      await server.load('/src/entry.ts')
      expect(loggedViolations(server.logs)).toContain('client src/a.ts:2:27')
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
      const client = await server.load('/src/entry.ts')
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
        modulesContaining(await server.load('/src/entry.ts'), 'MARK_B_CODE'),
      ).toEqual(['/src/b.ts'])
      await server.edit(markedApp(serverOnly))
      await server.load('/src/b.ts')
      const client = await server.load('/src/entry.ts')
      expect(reportedViolations(server.logs)).not.toEqual([])
      expect(modulesContaining(client, 'MARK_B_CODE')).toEqual([])
    },
    timeout,
  )
})

// Source: mutation run R3 ip-vite V3 (the SSR counterpart of the client
// control above).
test(
  'an SSR import of a client-only-marked module the server already transformed is mocked and logged',
  async () => {
    const server = await startProtectedDevServer({
      'src/b.ts': `import '@tanstack/react-start/client-only'
export const widget = () => 'MARK_B_CODE'
`,
      'src/a.ts': `import { widget } from './b'
export const read = () => widget()
`,
      'src/entry.ts': `export * from './a'\n`,
    })
    await server.load('/src/b.ts', { environment: 'ssr' })
    const served = await server.load('/src/entry.ts', { environment: 'ssr' })
    expect(modulesContaining(served, 'MARK_B_CODE')).toEqual([])
    expect(loggedViolations(server.logs)).toContain('server src/a.ts:2:27')
  },
  timeout,
)

// Source: mutation run R3 ip-vite V3 (the SSR counterpart of the client
// logging test "is logged at the importer's use when the client loads the
// importer first").
test(
  'an SSR load of a client-only-marked module through its importer logs the marker and the import',
  async () => {
    const server = await startProtectedDevServer({
      'src/b.ts': `import '@tanstack/react-start/client-only'
export const widget = () => 'MARK_B_CODE'
`,
      'src/a.ts': `import { widget } from './b'
export const read = () => widget()
`,
      'src/entry.ts': `export * from './a'\n`,
    })
    await server.load('/src/entry.ts', { environment: 'ssr' })
    expect(loggedViolations(server.logs).sort()).toEqual([
      'server src/a.ts:2:27',
      'server src/b.ts:1:8',
    ])
  },
  timeout,
)

// Source: mutation run R3 ip-vite V9.
test(
  'the server fn provider environment (rsc) mocks and logs an import of a .client file',
  async () => {
    const server = await startProtectedDevServer(
      {
        'src/widget.client.ts': `export const widget = () => 'MARK_CLIENT'\n`,
        'src/fn.ts': `import { widget } from './widget.client'
export const read = () => widget()
`,
        'src/entry.ts': `export * from './fn'\n`,
      },
      {},
      { providerEnvironment: 'rsc' },
    )
    const served = await server.load('/src/entry.ts', { environment: 'rsc' })
    expect(modulesContaining(served, 'MARK_CLIENT')).toEqual([])
    expect(loggedViolations(server.logs)).toEqual(['server src/fn.ts:2:27'])
  },
  timeout,
)

describe('reachability from the router entry', () => {
  // Source: mutation run R3 ip-vite V4(a).
  test(
    'only a leak is logged, not the imports a server fn factory uses inside .server()',
    async () => {
      const server = await startProtectedDevServer(serverFnFactoryApp())
      const client = await server.load('/src/entry.ts')
      expect(modulesContaining(client, 'MARK_SECRET')).toEqual([])
      expect(loggedViolations(server.logs)).toEqual(['client src/leak.ts:2:27'])
    },
    timeout,
  )

  // Source: mutation run R3 ip-vite V4(b); a control of the harness
  // registering Start's router entry: the factory module is a module the
  // Start compiler looked up, whose violations are only logged once they
  // are known to be reachable from an entry (without the entry, this test
  // fails).
  test(
    'a server fn factory module that also calls a denied import at the top level is logged',
    async () => {
      const server = await startProtectedDevServer(
        serverFnFactoryApp(factoryTopLevelCall),
      )
      await server.load('/src/entry.ts')
      expect(loggedViolations(server.logs)).toContain(
        'client src/factory.ts:9:24',
      )
    },
    timeout,
  )
})

describe('diagnostics', () => {
  // Source: mutation run R3 ip-vite V14 (the served code of a JSX module
  // has an extra import line, of the JSX runtime).
  test.each([
    {
      name: 'a use of a denied specifier (client)',
      a: `import { getRequest } from '@tanstack/react-start/server'
export const Page = () => <div>{String(getRequest())}</div>
`,
      environment: 'client',
      importProtection: {},
      expected: 'client src/a.tsx:2:40',
    },
    {
      name: 'a use of a file denied by a custom file rule (client)',
      a: `import { secret } from './private/db'
export const Page = () => <div>{String(secret())}</div>
`,
      environment: 'client',
      importProtection: { client: { files: ['**/private/**'] } },
      expected: 'client src/a.tsx:2:40',
    },
    {
      name: 'a client-only marker (SSR)',
      a: `import '@tanstack/react-start/client-only'
export const Page = () => <div>{String(1)}</div>
`,
      environment: 'ssr',
      importProtection: {},
      expected: 'server src/a.tsx:1:8',
    },
  ])(
    'in a JSX module, $name is located on its source line',
    async ({ a, environment, importProtection, expected }) => {
      const server = await startProtectedDevServer(
        {
          ...reactRuntimeFiles,
          'src/private/db.ts': `export const secret = () => 'MARK_SECRET'\n`,
          'src/a.tsx': a,
          'src/entry.ts': `export * from './a'\n`,
        },
        importProtection,
      )
      await server.load('/src/entry.ts', { environment })
      // (SSR: the entry's import of the marked module is reported as well)
      expect(
        loggedViolations(server.logs).filter((violation) =>
          violation.includes(' src/a.tsx'),
        ),
      ).toEqual([expected])
    },
    timeout,
  )
})
