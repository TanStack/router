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
import { startDevServer } from '../dev-server'
import {
  distinct,
  factoryTopLevelCall,
  locationIn,
  reactRuntimeFiles,
  rejection,
  reportedViolations,
  serverFnFactoryApp,
  startProtectedDevServer,
} from './start-apps'
import { violationReports } from './violation-report'
import type { ViolationReport } from './violation-report'
import type { ImportProtectionOptions } from '../../src/schema'
import type { ViolationInfo } from '../../src/import-protection/trace'
import type { Plugin } from 'vite'

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

describe('the trace of a client import of a denied file', () => {
  /** The modules of the trace of `report`, without locations. */
  const traceModules = (report: ViolationReport) =>
    report.trace.map(({ at }) => at.replace(/:\d+:\d+$/, ''))

  // A module under `src/routes` is not an entry: the trace goes on to the
  // router entry.
  // Source: mutation run R4 (spc:4986, 4987: route modules taken as entries).
  test(
    'leads from the router entry through a module of src/routes to the importer',
    async () => {
      const server = await startProtectedDevServer({
        ...deniedFileApp,
        'src/routes/page.ts': `export { read } from '../a'\n`,
        'src/entry.ts': `export * from './routes/page'\n`,
      })
      await server.load('/src/entry.ts')
      const reports = violationReports(server.logs)
      expect(reports).not.toEqual([])
      for (const report of reports) {
        expect(traceModules(report)).toEqual([
          'src/entry.ts',
          'src/routes/page.ts',
          'src/a.ts',
        ])
      }
    },
    timeout,
  )

  // Source: mutation run R4 (spc:4899: the dev server's module graph, which
  // still has the edges an edit drops from import protection's own graph).
  test(
    'with behavior "error", of an import added by an edit, leads from the router entry',
    async () => {
      const server = await startProtectedDevServer(
        { ...deniedFileApp, 'src/a.ts': `export const read = () => 'plain'\n` },
        { behavior: 'error' },
      )
      await server.load('/src/entry.ts')
      await server.edit({ 'src/a.ts': deniedFileApp['src/a.ts'] })
      const error = await rejection(server.load('/src/entry.ts'))
      const [report, ...others] = violationReports(error.message)
      expect(others).toEqual([])
      expect(report!.importer).toBe(deniedFileUse)
      expect(traceModules(report!)).toEqual(['src/entry.ts', 'src/a.ts'])
    },
    timeout,
  )

  // In every Start app, a module imports the router entry: Start's client
  // runtime. The trace still starts at the router entry.
  // Source: r5-gaps N8 (spc:4060, 4062: the module graph trace does not stop
  // at an entry).
  test(
    'starts at the router entry when another module imports the router entry',
    async () => {
      const server = await startProtectedDevServer({
        ...deniedFileApp,
        'src/main.ts': `export * from './entry'\n`,
      })
      await server.load('/src/main.ts')
      const reports = violationReports(server.logs)
      expect(reports).not.toEqual([])
      for (const report of reports) {
        expect(traceModules(report)).toEqual(['src/entry.ts', 'src/a.ts'])
      }
    },
    timeout,
  )

  // The dev twin of the build test in reported-location.test.ts "the trace is
  // the shortest import chain".
  // Source: r5-gaps N8 (spc:4072, 4073: the module graph search revisits
  // modules).
  test(
    'is the shortest import chain',
    async () => {
      const server = await startProtectedDevServer(
        {
          'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
          'src/s.ts': `import { secret } from './secret.server'
export const s = () => secret()
`,
          'src/c.ts': `import { s } from './s'\nexport const c = () => s()\n`,
          'src/a.ts': `import { c } from './c'
import { s } from './s'
export const page = () => c() + s()
`,
          'src/entry.ts': `export * from './a'\n`,
        },
        {},
        // Without Vite's pre-transforms, the client transforms `src/c.ts`
        // before `src/s.ts` (`load()` goes breadth first), so both chains
        // are in the dev server's module graph when the violation is
        // reported, whatever the timing.
        { config: { server: { preTransformRequests: false } } },
      )
      await server.load('/src/entry.ts')
      const reports = violationReports(server.logs)
      expect(reports).not.toEqual([])
      for (const report of reports) {
        expect(traceModules(report)).toEqual([
          'src/entry.ts',
          'src/a.ts',
          'src/s.ts',
        ])
      }
    },
    timeout,
  )
})

// Edits in the order people make them: a module, then the module importing
// it, each loaded by the client in between.
// Source: r5-gaps N1 (spc:1680: dropping the edges of the first edit left
// the importer's edges pointing at nothing, and the second edit's HMR
// handling threw).
test(
  'an edit of a module, then of its importer, updates both without an error',
  async () => {
    const server = await startProtectedDevServer({
      'src/b.ts': `export const b = () => 'b1'\n`,
      'src/a.ts': `import { b } from './b'\nexport const a = () => 'a1' + b()\n`,
      'src/entry.ts': `export * from './a'\n`,
    })
    await server.load('/src/entry.ts')
    const logged = server.logs.length
    const updates = [
      ...(await server.edit({ 'src/b.ts': `export const b = () => 'b2'\n` })),
    ]
    await server.load('/src/entry.ts')
    updates.push(
      ...(await server.edit({
        'src/a.ts': `import { b } from './b'\nexport const a = () => 'a2' + b()\n`,
      })),
    )
    expect(updates.filter(({ type }) => type === 'error')).toEqual([])
    expect(server.logs.slice(logged)).toEqual([])
    expect((await evaluateServed(server, '/src/entry.ts')).a()).toBe('a2b2')
  },
  timeout,
)

// Import protection checks only JavaScript and TypeScript modules; edits of
// the app's other modules update as usual.
// Source: mutation run R4 (spc:4497: the edit of a module import protection
// never compiled).
test(
  'an edit of a CSS module and a JSON module the app imports updates them without an error',
  async () => {
    const server = await startProtectedDevServer({
      'src/style.css': `.page { color: red }\n`,
      'src/data.json': `{ "count": 1 }\n`,
      'src/entry.ts': `import './style.css'
import data from './data.json'
export const count = () => data.count
`,
    })
    await server.load('/src/entry.ts')
    const logged = server.logs.length
    const updates = await server.edit({
      'src/style.css': `.page { color: blue }\n`,
      'src/data.json': `{ "count": 2 }\n`,
    })
    expect(updates.filter(({ type }) => type === 'error')).toEqual([])
    expect(server.logs.slice(logged)).toEqual([])
  },
  timeout,
)

// A CSS file that another one `@import`s is in Vite's module graph only as
// a file (a module without an id).
// Source: r5-gaps N2 (spc:4916: such a module reached import protection's
// HMR handling, which threw).
test(
  'an edit of a CSS file another CSS module @imports updates it without an error',
  async () => {
    const server = await startProtectedDevServer({
      'src/base.css': `.page { color: red }\n`,
      'src/style.css': `@import './base.css';\n.title { color: green }\n`,
      'src/entry.ts': `import './style.css'\nexport const page = 1\n`,
    })
    await server.load('/src/entry.ts')
    const logged = server.logs.length
    const updates = await server.edit({
      'src/base.css': `.page { color: blue }\n`,
    })
    expect(updates.filter(({ type }) => type === 'error')).toEqual([])
    expect(updates).not.toEqual([])
    expect(server.logs.slice(logged)).toEqual([])
  },
  timeout,
)

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

  /**
   * The violations logged when the client loads the app, and those logged
   * when it loads it again after the dev server reloaded every module
   * without any module changing: Vite does so when `tsconfig.json` changes
   * (as when it re-optimizes dependencies), and the client reloads the page.
   */
  async function logsAroundAReload(log: 'once' | 'always') {
    const server = await startProtectedDevServer(
      { ...deniedFileApp, 'tsconfig.json': `{}\n` },
      { log },
    )
    await server.load('/src/entry.ts')
    const first = reportedViolations(server.logs)
    const reload = await server.edit({
      'tsconfig.json': `{ "compilerOptions": {} }\n`,
    })
    expect(
      reload.filter(
        (message) =>
          message.environment === 'client' && message.type === 'full-reload',
      ),
    ).not.toEqual([])
    await server.load('/src/entry.ts')
    return {
      first,
      afterReload: reportedViolations(server.logs).slice(first.length),
    }
  }

  // Source: mutation run R3c (`log` regressions spc:4462-4465, 4469, 4856:
  // the edit-based test above is a pin).
  test(
    "'once' does not log a violation again when the dev server reloads every module",
    async () => {
      const { first, afterReload } = await logsAroundAReload('once')
      expect(first).not.toEqual([])
      expect(afterReload).toEqual([])
    },
    timeout,
  )

  // Source: mutation run R3c, as above.
  test(
    "'always' logs a violation again when the dev server reloads every module",
    async () => {
      const { first, afterReload } = await logsAroundAReload('always')
      expect(first).not.toEqual([])
      expect(distinct(afterReload.map((v) => v.importer))).toEqual([
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

  // Bug: with `log: 'always'`, one client import of a denied file is logged
  // three times when the client loads its module once: twice for the import
  // as written, because import protection finds the same violation both
  // when the import resolves (`resolveId`) and when it checks the module's
  // compiled imports (transform-cache import loop), and 'always' does not
  // dedupe them (vite/import-protection-plugin/plugin.ts `hasSeen`), plus
  // once for the resolved path (the 'once' pin above).
  // Impact: with 'always', the dev server output repeats each violation of
  // a denied file three times per load of its module.
  // Source: found by mutation run R3c (the 'always' rows of the reload
  // tests above).
  test.fails(
    "'always' logs one warning for one import each time its module is loaded",
    async () => {
      const server = await startProtectedDevServer(deniedFileApp, {
        log: 'always',
      })
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

  // `mockAccess` (guide/import-protection.md): how the dev client mocks
  // report their use.
  // Source: mutation run R4 (spc:4859, the option ignored).
  test.each([
    { mockAccess: 'warn', expected: { errors: false, warnings: true } },
    { mockAccess: 'off', expected: { errors: false, warnings: false } },
  ] as const)(
    'with mockAccess $mockAccess, the mocks report their use with console.warn: $expected.warnings, console.error: $expected.errors',
    async ({ mockAccess, expected }) => {
      const server = await startProtectedDevServer(deniedSpecifierApp, {
        mockAccess,
      })
      const reported = { errors: false, warnings: false }
      const isReport = (message: unknown) =>
        String(message instanceof Error ? message.message : message).includes(
          'Mocked import used in dev client',
        )
      vi.spyOn(console, 'error').mockImplementation((message: unknown) => {
        reported.errors ||= isReport(message)
      })
      vi.spyOn(console, 'warn').mockImplementation((message: unknown) => {
        reported.warnings ||= isReport(message)
      })
      const module = await evaluateServed(server, '/src/entry.ts')
      expect(String(module.request())).toBe('[import-protection mock]')
      expect(module.read()).toBe('[import-protection mock]')
      expect(reported).toEqual(expected)
    },
    timeout,
  )

  // Source: mutation run R4 (spc:4494: the names the mock exports, read from
  // the importer, after an edit of the importer).
  test(
    'added to an importer by an edit is a mock the edited module can import',
    async () => {
      const server = await startProtectedDevServer({
        'src/a.ts': `import { getRequest } from '@tanstack/react-start/server'
export const read = () => String(getRequest())
`,
        'src/entry.ts': `export * from './a'\n`,
      })
      vi.spyOn(console, 'error').mockImplementation(() => {})
      expect((await evaluateServed(server, '/src/entry.ts')).read()).toBe(
        '[import-protection mock]',
      )
      await server.edit({
        'src/a.ts': `import { getRequest, getResponse } from '@tanstack/react-start/server'
export const read = () => String(getRequest()) + String(getResponse())
`,
      })
      expect((await evaluateServed(server, '/src/entry.ts')).read()).toBe(
        '[import-protection mock][import-protection mock]',
      )
    },
    timeout,
  )
})

// A module another Vite plugin compiles to JavaScript from a file that is
// not JavaScript or TypeScript (MDX, Vue and Svelte components...).
describe('a module of another compiler (`.mdx`)', () => {
  /** A stand-in of an MDX plugin: drops the `# ` heading lines. */
  const mdx: Plugin = {
    name: 'mdx-stand-in',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('.mdx')) {
        return undefined
      }
      return { code: code.replace(/^# .*$/gm, ''), map: null }
    },
  }

  // Source: mutation run R4 (spc:4639: the module has no compiled imports
  // import protection could check its violations against; spc:4579: nor
  // can it tell whether its imports survived compiling, so a module it
  // imports is reachable through it).
  test(
    'importing a denied file, directly or through a module, gets the mock, and the dev server logs a warning at each importer',
    async () => {
      const leak = `import { secret } from './secret.server'
export const leak = () => secret()
`
      const server = await startProtectedDevServer(
        {
          'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
          'src/leak.ts': leak,
          'src/page.mdx': `# Title
import { secret } from './secret.server'
import { leak } from './leak'
export const read = () => secret() + leak()
`,
          'src/entry.ts': `export * from './page.mdx'\n`,
        },
        {},
        { plugins: [mdx] },
      )
      const client = await server.load('/src/entry.ts')
      expect(Object.keys(client)).toContain('/src/page.mdx')
      expect(modulesContaining(client, 'MARK_SECRET')).toEqual([])
      const importers = reportedViolations(server.logs).map(
        ({ importer }) => importer,
      )
      expect(importers).toContainEqual(expect.stringMatching(/^src\/page\.mdx/))
      expect(importers).toContain(
        locationIn('src/leak.ts', leak, 2, 'secret()'),
      )
    },
    timeout,
  )

  // Bug: to give the mock of a denied specifier the named exports its
  // importer imports, import protection reads the importer's code from its
  // own cache of compiled modules, which only has JavaScript and TypeScript
  // files, and otherwise from Vite's `getModuleInfo(importer).code`, which
  // Vite's dev server does not support: it throws "[vite] The "code"
  // property of ModuleInfo is not supported."
  // (vite/import-protection-plugin/plugin.ts
  // `resolveExportsForDeniedSpecifier`).
  // Impact: in dev, an `.mdx` (or other non-JS) module that imports a denied
  // specifier fails to load with that internal error, instead of getting
  // the mock and a warning.
  // Source: found by mutation run R4 (spc:4365-4369).
  test.fails(
    'importing a denied specifier gets the mock, and the dev server logs a warning naming it',
    async () => {
      const server = await startProtectedDevServer(
        {
          'src/page.mdx': `# Title
import { getRequest } from '@tanstack/react-start/server'
export const request = () => getRequest()
`,
          'src/entry.ts': `export * from './page.mdx'\n`,
        },
        {},
        { plugins: [mdx] },
      )
      const module = await evaluateServed(server, '/src/entry.ts')
      expect(String(module.request())).toBe('[import-protection mock]')
      expect(
        reportedViolations(server.logs).map(({ importer }) => importer),
      ).toContainEqual(expect.stringMatching(/^src\/page\.mdx/))
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
          importers.push((info as ViolationInfo).importer)
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

  // Only `false` overrides the denial (guide/import-protection.md): an
  // `onViolation` that only records (returns nothing) changes nothing.
  // Source: mutation run R4 (spc:4741).
  test(
    'that returns nothing keeps the warning; it receives the importer',
    async () => {
      const importers: Array<string> = []
      const server = await startProtectedDevServer(deniedFileApp, {
        onViolation: (info) => {
          importers.push((info as ViolationInfo).importer)
        },
      })
      const client = await server.load('/src/entry.ts')
      expect(modulesContaining(client, 'MARK_SECRET')).toEqual([])
      expect(loggedViolations(server.logs)).toEqual([`client ${deniedFileUse}`])
      expect(
        distinct(
          importers.map((importer) => path.relative(server.root, importer)),
        ),
      ).toEqual(['src/a.ts'])
    },
    timeout,
  )

  // Source: mutation run R4 (spc:4763).
  test.each([
    { name: 'a denied file', files: deniedFileApp, use: deniedFileUse },
    {
      name: 'a denied specifier',
      files: {
        'src/a.ts': `import { getRequest } from '@tanstack/react-start/server'
export const read = () => getRequest()
`,
        'src/entry.ts': `export * from './a'\n`,
      },
      use: 'src/a.ts:2:27',
    },
  ])(
    'with behavior "error", an import of $name it does not return false for fails to load',
    async ({ files, use }) => {
      const server = await startProtectedDevServer(files, {
        behavior: 'error',
        onViolation: () => true,
      })
      const error = await rejection(server.load('/src/entry.ts'))
      expect(reportedViolations(error.message)).toEqual([
        { environment: 'client', importer: use },
      ])
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

  // Source: mutation run R4 (spc:5089: only the first marked module's
  // importers were checked).
  test(
    'the importers of each of several server-only-marked modules are logged when the client loads the importers first',
    async () => {
      const server = await startProtectedDevServer({
        ...markedApp(serverOnly),
        'src/d.ts': `${serverOnly}export const other = () => 'MARK_D_CODE'\n`,
        'src/c.ts': `import { other } from './d'
export const peek = () => other()
`,
        'src/entry.ts': `export * from './a'\nexport * from './c'\n`,
      })
      await server.load('/src/entry.ts')
      expect(loggedViolations(server.logs)).toEqual(
        expect.arrayContaining([
          'client src/a.ts:2:27',
          'client src/c.ts:2:27',
        ]),
      )
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

  /**
   * `serverFnFactoryApp` without the leak, whose server fn factory module
   * uses a helper `src/helper.ts` (which uses the denied file and the denied
   * specifier) only inside `createMiddleware().server()`: the client never
   * imports the helper.
   */
  const handlerOnlyHelperApp = () => {
    const app: Record<string, string> = {
      ...serverFnFactoryApp(),
      'src/helper.ts': `import { getSecret } from './secret.server'
import { getRequest } from '@tanstack/react-start/server'
export const readSecret = () => [getSecret(), getRequest()]
`,
      'src/factory.ts': `import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { readSecret } from './helper'
const mw = createMiddleware({ type: 'function' }).server(({ next }) => {
  return next({ context: { secret: readSecret() } })
})
export const createSecretFn = createServerFn().middleware([mw])
`,
      'src/entry.ts': `export { fn } from './usage'\n`,
    }
    delete app['src/leak.ts']
    return app
  }

  // Control for the pin below: without Vite's pre-transform requests, the
  // helper is never transformed for the client, and nothing is logged.
  // Source: harness realism (r5-gaps M1): the harness used to turn
  // pre-transform requests off for every test.
  test(
    'with preTransformRequests off, a helper a server fn factory module uses only inside .server() is not logged',
    async () => {
      const server = await startProtectedDevServer(
        handlerOnlyHelperApp(),
        {},
        { config: { server: { preTransformRequests: false } } },
      )
      const client = await server.load('/src/entry.ts')
      // (what the transforms Vite runs in the background log)
      await server.idle()
      expect(Object.keys(client)).not.toContain('/src/helper.ts')
      expect(modulesContaining(client, 'MARK_SECRET')).toEqual([])
      expect(loggedViolations(server.logs)).toEqual([])
    },
    timeout,
  )

  // Bug: with Vite's default pre-transform requests, the Start compiler's
  // lookup of the server fn factory module (`?server-fn-module-lookup`, in
  // the client environment) goes through Vite's import analysis, which
  // pre-transforms `src/helper.ts` for the client. Import protection stores
  // the lookup's transform under the factory's file
  // (`cacheTransformResult`), so the factory → helper edge stays pending
  // until the factory's own client transform lands, and the 'unknown'
  // reachability fallback of `processPendingViolations`
  // (vite/import-protection-plugin/plugin.ts) logs the helper's denied file
  // import conservatively.
  // Impact: in dev (Vite's defaults), a module a server fn factory uses only
  // inside `.server()` is logged as a client violation, with a trace through
  // an import the client never has; the client is correct (it never loads
  // the helper). A false warning in the most common server fn layout.
  // Source: mutation run R4 final re-audit (M1), hidden while the harness
  // turned pre-transform requests off.
  test.fails(
    'a helper a server fn factory module uses only inside .server() is not logged',
    async () => {
      const server = await startProtectedDevServer(handlerOnlyHelperApp())
      const client = await server.load('/src/entry.ts')
      // (what the transforms Vite runs in the background log)
      await server.idle()
      expect(Object.keys(client)).not.toContain('/src/helper.ts')
      expect(modulesContaining(client, 'MARK_SECRET')).toEqual([])
      expect(loggedViolations(server.logs)).toEqual([])
    },
    timeout,
  )

  // The start entry (`src/start.ts`) is an entry like the router entry: the
  // client loads it, and so what it imports.
  // Source: mutation run R4 (spc:4524).
  test(
    'a denied import reached only from the start entry is mocked and logged',
    async () => {
      const server = await startProtectedDevServer({
        'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
        'src/leak.ts': `import { secret } from './secret.server'
export const leak = () => secret()
`,
        'src/start.ts': `import { leak } from './leak'
export const startInstance = { leak }
`,
        'src/entry.ts': `export const getRouter = () => undefined\n`,
      })
      const client = await server.load('/src/start.ts')
      expect(Object.keys(client)).toContain('/src/leak.ts')
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

  // Source: r5-gaps N7 (spc:4641: the factory module's violations found when
  // the Start compiler looked it up, which include the imports used inside
  // `.server()`, were logged without waiting for its compiled imports).
  test(
    'a server fn factory module calling a denied file at the top level is logged at that use only, not at the imports it uses inside .server()',
    async () => {
      const tail = `export const secret = getSecret()\n`
      const server = await startProtectedDevServer(serverFnFactoryApp(tail))
      await server.load('/src/entry.ts')
      await server.idle()
      expect(loggedViolations(server.logs).sort()).toEqual([
        `client src/factory.ts:9:${tail.indexOf('getSecret') + 1}`,
        'client src/leak.ts:2:27',
      ])
    },
    timeout,
  )

  /**
   * `serverFnFactoryApp` without the leak, whose server fn factory module
   * re-exports `request` of `src/other.ts`, which calls the denied
   * `getRequest()` at the top level. The client loads the app. Returns the
   * reports logged and the use in `src/other.ts`.
   */
  async function reExportedByAFactory() {
    const other = `import { getRequest } from '@tanstack/react-start/server'
${factoryTopLevelCall}`
    const app: Record<string, string> = {
      ...serverFnFactoryApp(`export { request } from './other'\n`),
      'src/other.ts': other,
      'src/entry.ts': `export { fn } from './usage'\n`,
    }
    delete app['src/leak.ts']
    const server = await startProtectedDevServer(app)
    const client = await server.load('/src/entry.ts')
    await server.idle()
    expect(Object.keys(client)).toContain('/src/other.ts')
    return {
      reports: violationReports(server.logs),
      use: locationIn('src/other.ts', other, 2, 'getRequest()'),
    }
  }

  // Source: r5-gaps N3 (spc:5428: the client's edge from a module the Start
  // compiler looked up to the modules it imports).
  test(
    'a denied import of a module a server fn factory module re-exports is logged, with a trace to the use',
    async () => {
      const { reports, use } = await reExportedByAFactory()
      expect(reports).toHaveLength(1)
      expect(reports[0]!.trace.map(({ at }) => at)).toEqual([
        expect.stringMatching(/^src\/entry\.ts\b/),
        expect.stringMatching(/^src\/usage\.ts\b/),
        expect.stringMatching(/^src\/factory\.ts\b/),
        use,
      ])
    },
    timeout,
  )

  // Bug: the location of the use is read from a source map of the module
  // whose `sources` are relative to it (`other.ts`), and import protection
  // takes the source as it is (import-protection/sourceLocation.ts
  // `mapGeneratedToOriginal`, `orig.source`), so `Importer:` names the
  // file without its directory. The trace, located from the module's id,
  // is right.
  // Impact: in dev, the warning for a module a server fn factory module
  // re-exports names `other.ts:2:24` instead of `src/other.ts:2:24` (low:
  // diagnostics only; an editor link does not open the file).
  // Source: found writing the r5-gaps N3 test above.
  test.fails(
    'a denied import of a module a server fn factory module re-exports is reported at the use, with its path',
    async () => {
      const { reports, use } = await reExportedByAFactory()
      expect(reports.map(({ importer }) => importer)).toEqual([use])
    },
    timeout,
  )

  // Source: mutation run R3 ip-vite V7 (spc:5415). The factory module's
  // violations wait for its compiled imports (the Start compiler looked it
  // up), and its denied file import comes before its denied specifier.
  test(
    'a server fn factory module calling a denied file and a denied specifier at the top level is logged at both uses',
    async () => {
      const factory = `import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { getSecret } from './secret.server'
import { getRequest } from '@tanstack/react-start/server'
const mw = createMiddleware({ type: 'function' }).server(({ next }) => {
  return next({ context: { secret: getSecret(), req: getRequest() } })
})
export const createSecretFn = createServerFn().middleware([mw])
export const secret = getSecret()
export const request = getRequest()
`
      const server = await startProtectedDevServer({
        ...serverFnFactoryApp(),
        'src/factory.ts': factory,
        'src/entry.ts': `export { fn } from './usage'\n`,
      })
      const client = await server.load('/src/entry.ts')
      expect(modulesContaining(client, 'MARK_SECRET')).toEqual([])
      expect(loggedViolations(server.logs).sort()).toEqual([
        `client ${locationIn('src/factory.ts', factory, 8, 'getSecret')}`,
        `client ${locationIn('src/factory.ts', factory, 9, 'getRequest')}`,
      ])
    },
    timeout,
  )

  /**
   * `src/p.ts` uses the denied file `src/secret.server.ts` and the denied
   * specifier `@tanstack/react-start/server`; its only importer `src/q.ts`,
   * which the router entry re-exports, also imports `src/slow.ts`.
   */
  const overlapApp = {
    'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
    'src/p.ts': `import { secret } from './secret.server'
import { getRequest } from '@tanstack/react-start/server'
export const read = () => secret()
export const request = () => getRequest()
`,
    'src/slow.ts': `export const slow = 1\n`,
    'src/q.ts': `import { read, request } from './p'
import { slow } from './slow'
export const q = () => [read(), request(), slow]
`,
    'src/entry.ts': `export * from './q'\n`,
  }

  /**
   * Serves `src/p.ts` while its only importer `src/q.ts` is still being
   * transformed, as overlapping requests do (Vite's `server.warmup`,
   * parallel requests, a slow resolver): a resolver plugin holds the
   * resolution of `src/q.ts`'s import of `./slow` until `src/p.ts` and its
   * imports are served. Then the client loads the app. Returns the modules
   * served for `src/p.ts`.
   */
  async function serveWhileItsImporterTransforms() {
    let release!: () => void
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    let holding!: () => void
    const held = new Promise<void>((resolve) => {
      holding = resolve
    })
    const slowResolver: Plugin = {
      name: 'slow-resolver',
      enforce: 'pre',
      async resolveId(source, importer) {
        if (source === './slow' && importer?.endsWith('/src/q.ts')) {
          holding()
          await released
        }
        return null
      },
    }
    const server = await startProtectedDevServer(
      overlapApp,
      {},
      { plugins: [slowResolver] },
    )
    await server.transform('/src/entry.ts')
    const importer = server.transform('/src/q.ts')
    await held
    const served = await server.load('/src/p.ts')
    release()
    await importer
    await server.load('/src/entry.ts')
    return { server, served }
  }

  // Source: mutation run R3c (the dev 'unknown'-reachability fallback,
  // spc:4704-4727: some edges to the module lack transform data).
  test(
    'a module served while its only importer is still being transformed has its denied imports mocked and logged at their uses',
    async () => {
      const { server, served } = await serveWhileItsImporterTransforms()
      expect(modulesContaining(served, 'MARK_SECRET')).toEqual([])
      const p = overlapApp['src/p.ts']
      expect(loggedViolations(server.logs).sort()).toEqual([
        `client ${locationIn('src/p.ts', p, 3, 'secret()')}`,
        `client ${locationIn('src/p.ts', p, 4, 'getRequest()')}`,
      ])
      // Source: r5-gaps N8 (spc:4216, 4218, 4219: the trace from Vite's
      // module graph, which does not have the importer yet, replaced it).
      for (const report of violationReports(server.logs)) {
        expect(
          report.trace.map(({ at }) => at.replace(/:\d+:\d+$/, '')),
        ).toEqual(['src/entry.ts', 'src/q.ts', 'src/p.ts'])
      }
    },
    timeout,
  )

  // Bug: a module the dev server transforms before any importer of it is
  // known (Vite's `server.warmup`, which transforms the listed files as the
  // server starts, or any request that comes first) has its violations
  // discarded as unreachable from Start's entries
  // (vite/import-protection-plugin/plugin.ts `processPendingViolations`,
  // `'unreachable'`; only bundled dev keeps them pending), and Vite caches
  // its transform, so they are never checked again, even once the app loads
  // the module from its entry.
  // Impact: in dev (mock mode), denied imports of warmed-up modules are
  // mocked without any warning (the build still reports them).
  // Source: found by mutation run R3c (looking for edges without transform
  // data); the control is "a client import of a denied file is mocked, and
  // the dev server logs a warning naming the importer at the use".
  test.fails(
    'a denied import of a module warmed up before its importers is logged once the client loads the app',
    async () => {
      const server = await startProtectedDevServer(
        deniedFileApp,
        {},
        { config: { server: { warmup: { clientFiles: ['./src/a.ts'] } } } },
      )
      // (waits for the warmup's transform of the module)
      await server.transform('/src/a.ts')
      const client = await server.load('/src/entry.ts')
      expect(modulesContaining(client, 'MARK_SECRET')).toEqual([])
      expect(loggedViolations(server.logs)).toEqual([`client ${deniedFileUse}`])
    },
    timeout,
  )

  /**
   * `src/late.ts` uses the denied file `src/secret.server.ts`; `src/a.ts`,
   * which the router entry re-exports, imports it dynamically. The client
   * loads the app, the server renders it (`ssr`), then the client loads
   * `src/late.ts`. The violations logged.
   */
  async function logsOfALateModule(perEnvironmentStartEndDuringDev: boolean) {
    const server = await startProtectedDevServer(
      {
        'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
        'src/late.ts': `import { secret } from './secret.server'
export const read = () => secret()
`,
        'src/a.ts': `export const late = () => import('./late')\n`,
        'src/entry.ts': `export * from './a'\n`,
      },
      {},
      { config: { server: { perEnvironmentStartEndDuringDev } } },
    )
    await server.load('/src/entry.ts')
    await server.load('/src/entry.ts', { environment: 'ssr' })
    await server.load('/src/late.ts')
    return loggedViolations(server.logs)
  }

  // Control for the pin below (same harness).
  test(
    'a denied import of a module the client loads after the server rendered is logged',
    async () => {
      expect(await logsOfALateModule(false)).toEqual([
        'client src/late.ts:2:27',
      ])
    },
    timeout,
  )

  // Bug: with Vite's `server.perEnvironmentStartEndDuringDev`, each
  // environment runs `buildStart` when it first handles a module, and import
  // protection's `buildStart` clears the state of every environment
  // (vite/import-protection-plugin/plugin.ts `clearEnvState` for each), so
  // the server's first request drops the client's import graph: a module the
  // client loads afterwards is unreachable from Start's entries and its
  // violations are discarded.
  // Impact: with that Vite option, dev import protection mocks the denied
  // imports of modules loaded after the first server request without any
  // warning (low: opt-in option).
  // Source: found by mutation run R4 (clearEnvState mutants).
  test.fails(
    'with perEnvironmentStartEndDuringDev, a denied import of a module the client loads after the server rendered is logged',
    async () => {
      expect(await logsOfALateModule(true)).toEqual(['client src/late.ts:2:27'])
    },
    timeout,
  )
})

describe("an app's client entry, with Start's whole plugin", () => {
  /**
   * An app whose `src/leak.ts` uses the denied file `src/secret.server.ts`,
   * imported by the app's client entry `src/client.tsx` or by its router
   * entry `src/router.ts`.
   */
  const leakApp = (importer: 'src/client.tsx' | 'src/router.ts') => ({
    'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
    'src/leak.ts': `import { secret } from './secret.server'
export const leak = () => secret()
`,
    'src/client.tsx':
      importer === 'src/client.tsx'
        ? `import { leak } from './leak'\nexport const read = () => leak()\n`
        : `export {}\n`,
    'src/router.ts':
      importer === 'src/router.ts'
        ? `import { leak } from './leak'\nexport const getRouter = () => leak\n`
        : `export const getRouter = () => undefined\n`,
  })

  /** The use of `secret` in `src/leak.ts`. */
  const leakUse = locationIn(
    'src/leak.ts',
    leakApp('src/client.tsx')['src/leak.ts'],
    2,
    'secret()',
  )

  /**
   * Starts a dev server with Start's whole plugin (without HMR, so that its
   * dev client entry imports the app's client entry statically).
   */
  const startApp = (files: Record<string, string>) =>
    startDevServer({ start: {}, files, config: { server: { hmr: false } } })

  // Control for the pin below (same harness).
  test(
    'a denied import of a module the router entry imports is mocked and logged',
    async () => {
      const server = await startApp(leakApp('src/router.ts'))
      const client = await server.load('/src/router.ts')
      expect(Object.keys(client)).toContain('/src/leak.ts')
      expect(modulesContaining(client, 'MARK_SECRET')).toEqual([])
      expect(loggedViolations(server.logs)).toEqual([`client ${leakUse}`])
    },
    timeout,
  )

  // Bug: dev import protection only logs violations it can reach from the
  // entries it registers, Start's router entry and start entry
  // (vite/import-protection-plugin/plugin.ts `registerEntries`). The app's
  // client entry is not one, and the browser loads it from Start's dev
  // client entry, a virtual module whose imports import protection does not
  // record, so the modules only the client entry imports are unreachable
  // and their violations are discarded.
  // Impact: in dev (mock mode), a denied import reached from the app's
  // client entry (`src/client.tsx`) is mocked without any warning (the build
  // reports it).
  // Source: found by mutation run R3c (looking for edges without transform
  // data).
  test.fails(
    'a denied import of a module the client entry imports is mocked and logged',
    async () => {
      const server = await startApp(leakApp('src/client.tsx'))
      // (Start's dev client entry, which the page loads)
      const client = await server.load(
        'virtual:tanstack-start-dev-client-entry',
      )
      expect(Object.keys(client)).toContain('/src/leak.ts')
      expect(modulesContaining(client, 'MARK_SECRET')).toEqual([])
      expect(loggedViolations(server.logs)).toEqual([`client ${leakUse}`])
    },
    timeout,
  )
})

describe("an app's server entry, with Start's whole plugin", () => {
  const handler = `import { widget } from './widget.client'
export const handler = () => widget()
`
  /**
   * An app whose `src/handler.ts` uses the client-only file
   * `src/widget.client.ts`, imported by the app's server entry
   * `src/server.ts` or by its router entry `src/router.ts`.
   */
  const handlerApp = (importer: 'src/server.ts' | 'src/router.ts') => ({
    'src/widget.client.ts': `export const widget = () => 'MARK_CLIENT'\n`,
    'src/handler.ts': handler,
    ...(importer === 'src/server.ts' && {
      'src/server.ts': `import { handler } from './handler'
export default { fetch: () => new Response(String(handler())) }
`,
    }),
    'src/router.ts':
      importer === 'src/router.ts'
        ? `import { handler } from './handler'\nexport const getRouter = () => handler\n`
        : `export const getRouter = () => undefined\n`,
  })
  const handlerUse = `server ${locationIn('src/handler.ts', handler, 2, 'widget()')}`

  const startApp = (files: Record<string, string>) =>
    startDevServer({ start: {}, files, config: { server: { hmr: false } } })

  // Control for the pin below (same harness).
  test(
    'a client-only import of a module the router entry imports is mocked on the server and logged',
    async () => {
      const server = await startApp(handlerApp('src/router.ts'))
      const router = await server.import('/src/router.ts')
      expect(String(router.getRouter()())).not.toContain('MARK_CLIENT')
      expect(loggedViolations(server.logs)).toEqual([handlerUse])
    },
    timeout,
  )

  // Bug: dev import protection only logs violations it can reach from the
  // entries it registers, Start's router entry and start entry
  // (vite/import-protection-plugin/plugin.ts `registerEntries`). The app's
  // server entry is not one, and the entry branch of `resolveId` (no
  // importer) never runs in dev, where Vite passes `<root>/index.html` as
  // the importer, so the modules only the server entry imports are
  // unreachable and their violations are discarded. The server twin of the
  // client entry pin above.
  // Impact: in dev (mock mode), a client-only import reached from the app's
  // custom server entry (`src/server.ts`) is mocked on the server without
  // any warning (the request returns the mock's value).
  // Source: mutation run R4 final re-audit (M3).
  test.fails(
    'a client-only import of a module the server entry imports is mocked on the server and logged',
    async () => {
      const server = await startApp(handlerApp('src/server.ts'))
      // (what Start's dev server runs for a request)
      const entry = await server.import('virtual:tanstack-start-server-entry')
      const response: Response = await entry.default.fetch(
        new Request('http://localhost/'),
      )
      expect(await response.text()).not.toContain('MARK_CLIENT')
      expect(loggedViolations(server.logs)).toEqual([handlerUse])
    },
    timeout,
  )
})

// Vite's full-bundle dev (`experimental.bundledDev`), which Start supports:
// Rolldown bundles the client, so a module can be transformed before its
// importers.
// Source: mutation run R4 (the bundledDev branches of the plugin had no
// unit test; e2e import-protection runs them with E2E_VITE_BUNDLED_DEV).
describe('full-bundle dev', () => {
  test.each([
    { name: 'its router entry', files: deniedFileApp },
    {
      name: 'a module of src/routes',
      files: {
        ...deniedFileApp,
        'src/routes/page.ts': `export { read } from '../a'\n`,
        'src/entry.ts': `export * from './routes/page'\n`,
      },
    },
  ])(
    'a denied file imported from $name is mocked in the client bundle and logged at the use',
    async ({ files }) => {
      const server = await startProtectedDevServer(
        files,
        {},
        { bundledDev: { entry: 'src/entry.ts' } },
      )
      const bundle = await server.clientBundle()
      expect(modulesContaining(bundle, 'MARK_SECRET')).toEqual([])
      expect(loggedViolations(server.logs)).toEqual([`client ${deniedFileUse}`])
    },
    timeout,
  )

  // Source: mutation run R4 (full-bundle dev had no import-protection test).
  test(
    'denied imports are mocked in the client bundle, and the dev server logs a warning at each use',
    async () => {
      const x = `import { getRequest } from '@tanstack/react-start/server'
export const request = () => getRequest()
`
      const server = await startProtectedDevServer(
        {
          ...deniedFileApp,
          'src/x.ts': x,
          'src/entry.ts': `export * from './a'\nexport * from './x'\n`,
        },
        {},
        { bundledDev: { entry: 'src/entry.ts' } },
      )
      const bundle = await server.clientBundle()
      expect(modulesContaining(bundle, 'MARK_SECRET')).toEqual([])
      expect(loggedViolations(server.logs).sort()).toEqual([
        `client ${deniedFileUse}`,
        `client ${locationIn('src/x.ts', x, 2, 'getRequest()')}`,
      ])
    },
    timeout,
  )

  /** The modules of the trace of each report logged in `logs`. */
  const traces = (logs: Array<string>) =>
    violationReports(logs).map((report) =>
      report.trace.map(({ at }) => at.replace(/:\d+:\d+$/, '')),
    )

  // Source: r5-gaps N8 (spc:4997, 4998: every importer taken as an entry).
  test(
    'the trace of a denied file imported through a chain of modules leads from the router entry',
    async () => {
      const server = await startProtectedDevServer(
        {
          'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
          'src/lib/a.ts': `import { secret } from '../secret.server'
export const read = () => secret()
`,
          'src/b.ts': `export { read } from './lib/a'\n`,
          'src/entry.ts': `export * from './b'\n`,
        },
        {},
        { bundledDev: { entry: 'src/entry.ts' } },
      )
      await server.clientBundle()
      const logged = traces(server.logs)
      expect(logged).not.toEqual([])
      for (const trace of logged) {
        expect(trace).toEqual(['src/entry.ts', 'src/b.ts', 'src/lib/a.ts'])
      }
    },
    timeout,
  )

  // Bug: in full-bundle dev, import protection takes each client module of
  // `src/routes` as an entry, so that a violation under a route the bundle
  // reaches before the router entry's imports are known is not discarded
  // (vite/import-protection-plugin/plugin.ts `resolveId`, bundled dev
  // `env.graph.addEntry(normalizedImporter)`); the trace then stops at the
  // first entry it meets.
  // Impact: in full-bundle dev, the trace of a violation under a route
  // starts at the route module: it does not show how the app reaches the
  // route (unbundled dev and builds start at the router entry). Low:
  // diagnostics only.
  // Source: mutation run R4 final re-audit (M4).
  test.fails(
    'the trace of a denied file imported from a module of src/routes leads from the router entry',
    async () => {
      const server = await startProtectedDevServer(
        {
          ...deniedFileApp,
          'src/routes/page.ts': `export { read } from '../a'\n`,
          'src/entry.ts': `export * from './routes/page'\n`,
        },
        {},
        { bundledDev: { entry: 'src/entry.ts' } },
      )
      await server.clientBundle()
      const logged = traces(server.logs)
      expect(logged).not.toEqual([])
      for (const trace of logged) {
        expect(trace).toEqual([
          'src/entry.ts',
          'src/routes/page.ts',
          'src/a.ts',
        ])
      }
    },
    timeout,
  )

  // Full-bundle dev bundles only the client: the server still loads modules
  // one by one, and its traces do not change.
  // Source: r5-gaps N8 (spc:4991, 4992: route modules taken as server
  // entries).
  test(
    'the SSR trace of a .client file imported from a module of src/routes leads from the router entry',
    async () => {
      const server = await startProtectedDevServer(
        {
          'src/widget.client.ts': `export const widget = () => 'MARK_CLIENT'\n`,
          'src/a.ts': `import { widget } from './widget.client'
export const read = () => widget()
`,
          'src/routes/page.ts': `export { read } from '../a'\n`,
          'src/entry.ts': `export * from './routes/page'\n`,
        },
        {},
        { bundledDev: { entry: 'src/entry.ts' } },
      )
      await server.load('/src/entry.ts', { environment: 'ssr' })
      const logged = traces(server.logs)
      expect(logged).not.toEqual([])
      for (const trace of logged) {
        expect(trace).toEqual([
          'src/entry.ts',
          'src/routes/page.ts',
          'src/a.ts',
        ])
      }
    },
    timeout,
  )

  /**
   * An app whose server fn factory module is a denied file
   * (`src/factory.server.ts`); `src/usage.ts`, which the router entry
   * re-exports, defines a server fn with it.
   */
  const deniedFactoryApp = {
    'src/factory.server.ts': `import { createMiddleware, createServerFn } from '@tanstack/react-start'
const mw = createMiddleware({ type: 'function' }).server(({ next }) => next())
export const createSecretFn = createServerFn().middleware([mw])
export const marker = 'MARK_SECRET'
`,
    'src/usage.ts': `import { createSecretFn } from './factory.server'
export const fn = createSecretFn().handler(async () => 'data')
`,
    'src/entry.ts': `export { fn } from './usage'\n`,
  }
  const deniedFactoryUse = 'src/usage.ts:2:19'

  // Source: r5-gaps N7 (spc:2154: the mock the Start compiler's lookup of the
  // denied factory module gets).
  test(
    'a server fn built with a factory of a denied file gets the mock in the client bundle and is logged at the use',
    async () => {
      const server = await startProtectedDevServer(
        deniedFactoryApp,
        {},
        { bundledDev: { entry: 'src/entry.ts' } },
      )
      const bundle = await server.clientBundle()
      expect(modulesContaining(bundle, 'MARK_SECRET')).toEqual([])
      expect(loggedViolations(server.logs)).toContain(
        `client ${deniedFactoryUse}`,
      )
    },
    timeout,
  )

  // Bug: the Start compiler looks up the factory in the denied file's mock
  // (`import mock from 'tanstack-start-import-protection:mock'`) with its
  // lookup query, and the Vite adapter loads the silent mock only by its
  // exact id (vite/import-protection-plugin/virtualModules.ts
  // `loadResolvedVirtualModule`): Rolldown cannot load
  // `\0tanstack-start-import-protection:mock?server-fn-module-lookup`. With
  // the default `mockAccess`, the mock-runtime module hides it (the control
  // above).
  // Impact: in full-bundle dev with `mockAccess: 'off'`, an app with a server
  // fn built from a factory in a denied file fails to bundle the client
  // (UNLOADABLE_DEPENDENCY). Low: opt-in option, unusual layout.
  // Source: mutation run R4 final re-audit (M2).
  test.fails(
    'with mockAccess off, a server fn built with a factory of a denied file gets the mock in the client bundle and is logged at the use',
    async () => {
      const server = await startProtectedDevServer(
        deniedFactoryApp,
        { mockAccess: 'off' },
        { bundledDev: { entry: 'src/entry.ts' } },
      )
      const bundle = await server.clientBundle()
      expect(modulesContaining(bundle, 'MARK_SECRET')).toEqual([])
      expect(loggedViolations(server.logs)).toContain(
        `client ${deniedFactoryUse}`,
      )
    },
    timeout,
  )

  // Start's virtual client entry, the bundle's input, imports the app's
  // `src/client.tsx`, which may import modules before the router entry's
  // imports reach them.
  // Source: r5-gaps N6 (spc:4664-4698: the violations of a module the bundle
  // reaches before the router entry does are kept until it does).
  test(
    'a denied import of a module the bundle input imports before the router entry reaches it is logged at the use',
    async () => {
      let release!: () => void
      const released = new Promise<void>((resolve) => {
        release = resolve
      })
      // Holds the router entry until the page module is transformed
      const slowEntry: Plugin = {
        name: 'slow-entry',
        enforce: 'pre',
        async transform(_code, id) {
          if (id.endsWith('/src/entry.ts')) {
            await released
          } else if (id.endsWith('/src/page.ts')) {
            setTimeout(release, 50)
          }
          return null
        },
      }
      const server = await startProtectedDevServer(
        {
          ...deniedFileApp,
          'src/page.ts': `export { read } from './a'\n`,
          'src/entry.ts': `export { read } from './page'\n`,
          'src/client.ts': `import { read } from './page'
import * as router from './entry'
export const app = [read, router]
`,
        },
        {},
        { bundledDev: { entry: 'src/client.ts' }, plugins: [slowEntry] },
      )
      const bundle = await server.clientBundle()
      expect(modulesContaining(bundle, 'MARK_SECRET')).toEqual([])
      expect(loggedViolations(server.logs)).toEqual([`client ${deniedFileUse}`])
    },
    timeout,
  )
})

// The router plugin splits a route's component into a module of its own,
// which the route module imports dynamically (the browser loads it when the
// route renders).
describe("a split route component, with Start's whole plugin", () => {
  // Source: mutation run R4 (spc:4529 and the cache of compiled split
  // modules: the denied import, and the import of the module using the
  // denied file, are only in the split module).
  test(
    'using a denied file, directly or through a module, gets the mock, and the dev server logs a warning at each use',
    async () => {
      const route = `import { createFileRoute } from '@tanstack/react-router'
import { secret } from '../secret.server'
import { widget } from '../widget'
export const Route = createFileRoute('/')({
  component: () => String(secret()) + widget(),
})
`
      const widget = `import { secret } from './secret.server'
export const widget = () => String(secret())
`
      const server = await startDevServer({
        start: {},
        files: {
          'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
          'src/widget.ts': widget,
          'src/routes/index.tsx': route,
          'src/router.ts': `import { routeTree } from './routeTree.gen'
export const getRouter = () => ({ routeTree })
`,
        },
        config: { server: { hmr: false } },
      })
      const app = await server.load('/src/router.ts')
      // (the route module's dynamic imports: its split modules)
      const split = [
        ...app['/src/routes/index.tsx']!.matchAll(/\bimport\("([^"]+)"\)/g),
      ].map((match) => match[1]!)
      expect(split).not.toEqual([])
      for (const url of split) {
        const served = await server.load(url)
        expect(modulesContaining(served, 'MARK_SECRET')).toEqual([])
      }
      expect(loggedViolations(server.logs).sort()).toEqual([
        `client ${locationIn('src/routes/index.tsx', route, 5, 'secret()')}`,
        `client ${locationIn('src/widget.ts', widget, 2, 'secret()')}`,
      ])
    },
    timeout,
  )
})

// The route module the router plugin compiles (with route HMR in dev): the
// code frame of a violation shows the route file as the user wrote it.
// Source: r5-gaps N12 (rp:532-534: the route module's source map without
// the source text, so import protection showed the compiled module).
test(
  "the code frame of a denied import used in a route module shows the route file's source, with Start's whole plugin",
  async () => {
    const route = `import { createFileRoute } from '@tanstack/react-router'
import { secret } from '../secret.server'

// a comment that compiling drops
export const Route = createFileRoute('/')({
  loader: () => secret(),
  component: () => 'page',
})
`
    const server = await startDevServer({
      start: {},
      files: {
        'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
        'src/routes/index.tsx': route,
        'src/router.ts': `import { routeTree } from './routeTree.gen'
export const getRouter = () => ({ routeTree })
`,
      },
      config: { server: { hmr: false } },
    })
    await server.load('/src/router.ts')
    await server.idle()
    const reports = violationReports(server.logs)
    expect(reports).not.toEqual([])
    const use = locationIn('src/routes/index.tsx', route, 6, 'secret()')
    for (const report of reports) {
      expect(report.importer).toBe(use)
      expect(report.code).toEqual({
        line: 6,
        pointsAt: expect.stringMatching(/^secret\(\)/),
        shows: expect.arrayContaining([
          '// a comment that compiling drops',
          '  loader: () => secret(),',
        ]),
        location: use,
      })
    }
  },
  timeout,
)

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
    // Source: r5-gaps N7 (spc:4144: a module without exports, imported for
    // its side effects, was located in its compiled code).
    {
      name: 'a use of a denied file in a module without exports (client)',
      a: `import { secret } from './private/db'
console.log(<div>{String(secret())}</div>)
`,
      environment: 'client',
      importProtection: { client: { files: ['**/private/**'] } },
      expected: 'client src/a.tsx:2:26',
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

  // Bug: import protection keeps a module's source map for its diagnostics
  // up front only when the module's compiled code names a denied module
  // (`shouldCaptureDiagnosticSourceMap`, vite/import-protection-plugin/
  // plugin.ts). Through an alias (here the app's package.json `imports`),
  // the denied file is only known once the import resolves, and `resolveId`
  // reports it (transform-cache import loop → `reportOrDeferViolation`)
  // before the loop captures the map (`'devViolation'`), so the location is
  // read from the compiled code.
  // Impact: in dev, the warning for a denied file imported through an alias
  // in a JSX module points at a line that is not in the source (here 4:77
  // of a two-line module).
  // Source: mutation run R4 (spc:5436, that late source map capture).
  test.fails(
    'in a JSX module, a use of a denied file imported through a subpath import alias is located on its source line',
    async () => {
      const server = await startProtectedDevServer({
        ...reactRuntimeFiles,
        'package.json': JSON.stringify({
          name: 'app',
          type: 'module',
          imports: { '#secret': './src/secret.server.ts' },
        }),
        'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
        'src/a.tsx': `import { secret } from '#secret'
export const Page = () => <div>{String(secret())}</div>
`,
        'src/entry.ts': `export * from './a'\n`,
      })
      const client = await server.load('/src/entry.ts')
      expect(modulesContaining(client, 'MARK_SECRET')).toEqual([])
      // (the reports with a location: the one naming the resolved path
      // has none, see the 'once' pin of `log`)
      expect(
        loggedViolations(server.logs).filter((v) => /:\d+:\d+$/.test(v)),
      ).toEqual(['client src/a.tsx:2:40'])
    },
    timeout,
  )

  // Source: mutation run R4 (spc:4174: a pattern rule cannot be found in
  // the module's code as text, unlike the specifiers of the rows above).
  test(
    'in a JSX module, a use of a specifier denied by a custom pattern rule (client) is located on its source line',
    async () => {
      const server = await startProtectedDevServer(
        {
          ...reactRuntimeFiles,
          'node_modules/@acme/private/package.json': JSON.stringify({
            name: '@acme/private',
            type: 'module',
            exports: { '.': './index.js' },
          }),
          'node_modules/@acme/private/index.js': `export const secret = () => 'MARK_SECRET'\n`,
          'src/a.tsx': `import { secret } from '@acme/private'
export const Page = () => <div>{String(secret())}</div>
`,
          'src/entry.ts': `export * from './a'\n`,
        },
        { client: { specifiers: ['@acme/*'] } },
      )
      await server.load('/src/entry.ts')
      expect(loggedViolations(server.logs)).toEqual(['client src/a.tsx:2:40'])
    },
    timeout,
  )

  /**
   * The client imports `src/secret.server.ts` through a chain of modules
   * (`src/b.ts` uses it).
   */
  const chainApp = {
    'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
    'src/b.ts': `import { secret } from './secret.server'
export const read = () => secret()
`,
    'src/a.ts': `import { read } from './b'\nexport const page = () => read()\n`,
    'src/entry.ts': `export * from './a'\n`,
  }

  /** The trace steps of each warning logged when the client loads the app. */
  async function tracesOf(importProtection: ImportProtectionOptions) {
    const server = await startProtectedDevServer(chainApp, importProtection)
    await server.load('/src/entry.ts')
    const reports = violationReports(server.logs)
    expect(reports).not.toEqual([])
    return reports.map(({ trace }) =>
      trace.map(({ at, imports }) => ({
        file: at.replace(/:\d+:\d+$/, ''),
        imports,
      })),
    )
  }

  // Source: mutation run R4 (the trace from Vite's module graph, which dev
  // import protection prefers when it is longer than its own: here, its own
  // stops at `maxTraceDepth`).
  test(
    'with maxTraceDepth, the trace ends at the importer, each step naming the import of the next',
    async () => {
      for (const trace of await tracesOf({ maxTraceDepth: 1 })) {
        expect(trace.at(-1)?.file).toBe('src/b.ts')
        for (const [index, step] of trace.slice(0, -1).entries()) {
          expect(step.imports).toBe(
            `./${path.basename(trace[index + 1]!.file, '.ts')}`,
          )
        }
      }
    },
    timeout,
  )

  // Bug: dev import protection replaces its trace (cut at `maxTraceDepth`)
  // with the trace it finds in Vite's module graph whenever that one is
  // longer (vite/import-protection-plugin/plugin.ts
  // `rebuildAndAnnotateTrace`); the module graph trace runs from the entry
  // and is only cut at `maxTraceDepth + 2` steps, from the entry side (so in
  // a chain deeper than that, it does not reach the importer). A build cuts
  // the trace, keeping the importer (build-options.test.ts "cuts a deeper
  // trace, keeping the importer").
  // Impact: in dev, `maxTraceDepth` does not cut traces (low: diagnostics
  // only).
  // Source: found by mutation run R4 (module graph trace mutants).
  test.fails(
    'with maxTraceDepth, a deeper trace is cut, keeping the importer',
    async () => {
      for (const trace of await tracesOf({ maxTraceDepth: 1 })) {
        expect(trace.length).toBeLessThanOrEqual(2)
        expect(trace.at(-1)?.file).toBe('src/b.ts')
        expect(trace.map(({ file }) => file)).not.toContain('src/entry.ts')
      }
    },
    timeout,
  )
})
