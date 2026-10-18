/**
 * Import protection in a real Start build (Vite and Rsbuild): what survives
 * into the client bundle is reported, and invalid markers fail the build.
 * Import protection checks the modules of the source directory (`src`).
 * A mock is told by what it does (`mock-helpers.ts`, `describeValue`:
 * `a safe mock`), and a report by its sections (`violation-report.ts`).
 */
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../../build-harness'
import { describeValuePrelude } from '../../importProtection/mock-helpers'
import {
  distinct,
  expectMarkerViolation,
  rejection,
  reportedViolations,
  violationReports,
} from '../../importProtection/start-apps'
import type { TanStackStartInputConfig } from '../../../src/schema'
import type { ViolationInfo } from '../../../src/import-protection/trace'

const timeout = 60_000

/**
 * Start's import protection options of a build that fails on a violation,
 * denying `files` to the client.
 */
function importProtection(files: Array<string> = []) {
  return { importProtection: { behavior: 'error', client: { files } } } as const
}

/** A server-only module (denied to the client by `importedAs`). */
const deniedModules = {
  'a denied file': {
    importedAs: './secret.server',
    files: {
      'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
    },
  },
  'a server-only-marked module': {
    importedAs: './marked',
    files: {
      'src/marked.ts': `import '@tanstack/react-start/server-only'
export const secret = () => 'MARK_SECRET'
`,
    },
  },
}
type DeniedModule = keyof typeof deniedModules
const deniedModuleNames = Object.keys(deniedModules) as Array<DeniedModule>

/** A client-only module (denied to the server by its marker). */
const clientOnlyMarked = {
  'src/marked.ts': `import '@tanstack/react-start/client-only'
export const secret = () => 'MARK_SECRET'
`,
}

/**
 * `files` with each module recording that it ran (`globalThis.secretLoaded`),
 * after its marker import when it has one. For the mock-mode rows: a mock
 * runs no initializer of the denied module. (A side effect keeps a module
 * in a bundle, so the tree-shaking rows use the modules as they are.)
 */
function recording(files: Record<string, string>): Record<string, string> {
  const record = `;(globalThis as any).secretLoaded = 'MARK_SECRET_LOADED'\n`
  return Object.fromEntries(
    Object.entries(files).map(([file, code]) => {
      if (!/\.[cm]?[jt]sx?$/.test(file) || code.includes('secretLoaded')) {
        return [file, code]
      }
      return [
        file,
        code.startsWith('import ')
          ? code.replace('\n', `\n${record}`)
          : record + code,
      ]
    }),
  )
}

/** An app whose client entry `src/entry.ts` uses `denied`. */
function appUsing(denied: DeniedModule) {
  const { importedAs, files } = deniedModules[denied]
  return {
    ...files,
    'src/entry.ts': `import { secret } from '${importedAs}'
export const read = () => secret()
`,
  }
}

/** Builds `files` with `bundler`; what the client gets from `entry.read()`. */
async function clientRead(
  bundler: (typeof startBundlers)[number],
  files: Record<string, string>,
  start: TanStackStartInputConfig,
) {
  const { client } = await buildStart({
    bundler,
    files,
    entry: 'src/entry.ts',
    start,
  })
  const read = (await client.run(`return String(entry.read())`))
    .result as string
  return {
    /** The real module's code is in the client bundle. */
    hasRealCode: client.where('MARK_SECRET') !== 'nowhere',
    /** `entry.read()` ran the real module. */
    ranReal: read === 'MARK_SECRET',
    warnings: client.warnings,
  }
}

/** The one report of a failed build, read by its sections. */
async function failureReport(build: Promise<unknown>) {
  const error = await rejection(build)
  const [report, ...others] = violationReports(error.message)
  expect(others).toEqual([])
  return report!
}

describe.each(startBundlers)('%s build', (bundler) => {
  // A denied pure re-export barrel whose export the client uses survives
  // into the client bundle (as the code it re-exports), so it must be
  // reported.
  // Source: issue #8102 (closed without a reproduction: Rolldown may elide
  // the barrel from `chunk.modules`); gap IP6b (gaps/start-env.md).
  test(
    'a denied re-export barrel the client uses fails the build',
    async () => {
      const report = await failureReport(
        buildStart({
          bundler,
          files: {
            'src/secret.ts': `export const secret = () => 'MARK_SECRET' + Math.random()\n`,
            'src/barrel.ts': `export { secret } from './secret'\n`,
            'src/entry.ts': `import { secret } from './barrel'\nexport const read = () => secret()\n`,
          },
          entry: 'src/entry.ts',
          start: importProtection(['**/barrel.ts']),
        }),
      )
      expect(report.environment).toBe('client')
      expect(report.importer).toMatch(/^src\/entry\.ts/)
    },
    timeout,
  )

  // Source: gap IP5 (gaps/start-env.md).
  test(
    'a file with both a server-only and a client-only marker fails the build, naming the file and both markers',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            'src/both.ts': `import '@tanstack/react-start/server-only'
import '@tanstack/react-start/client-only'
export const value = 1
`,
            'src/entry.ts': `import { value } from './both'\nexport const read = () => value\n`,
          },
          entry: 'src/entry.ts',
          start: importProtection(),
        }),
      )
      expect(error.message).toContain('src/both.ts')
      expect(error.message).toContain('server-only')
      expect(error.message).toContain('client-only')
    },
    timeout,
  )
})

// Start's default import protection (no options): the defaults deny
// `*.server.*` files, `@tanstack/<framework>-start/server` and modules marked
// server-only to the client, and a build fails on a violation.
// Source: oracle-gaps H2 / gap IP1 (the default rules were never built in
// error mode: every build test replaced `client.files`).
describe.each(startBundlers)('%s build, default rules', (bundler) => {
  test.each<{ name: string; files: Record<string, string>; reported: string }>([
    {
      name: 'a client import of a *.server.* file',
      files: appUsing('a denied file'),
      reported: 'src/entry.ts:2:27',
    },
    {
      name: 'a client import of a *.server.* file in a dot directory',
      files: {
        'src/.private/db.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
        'src/entry.ts': `import { secret } from './.private/db.server'
export const read = () => secret()
`,
      },
      reported: 'src/entry.ts:2:27',
    },
    {
      name: 'a client import of @tanstack/react-start/server',
      files: {
        'src/entry.ts': `import { getRequest } from '@tanstack/react-start/server'
export const read = () => getRequest()
`,
      },
      reported: 'src/entry.ts:2:27',
    },
  ])(
    '$name fails the build, naming the importer at the use',
    async ({ files, reported }) => {
      const error = await rejection(
        buildStart({ bundler, files, entry: 'src/entry.ts' }),
      )
      expect(reportedViolations(error.message)).toEqual([
        { environment: 'client', importer: reported },
      ])
    },
    timeout,
  )

  test(
    'a client import of a server-only-marked module fails the build, naming the module and its importer',
    async () => {
      const report = await failureReport(
        buildStart({
          bundler,
          files: appUsing('a server-only-marked module'),
          entry: 'src/entry.ts',
        }),
      )
      expect(report.environment).toBe('client')
      expectMarkerViolation(report, {
        marker: 'src/marked.ts:1',
        use: 'src/entry.ts:2:27',
      })
    },
    timeout,
  )

  test(
    'a server import of a client-only-marked module fails the build, naming the module and its importer',
    async () => {
      const report = await failureReport(
        buildStart({
          bundler,
          files: {
            ...clientOnlyMarked,
            'src/server.ts': `import { secret } from './marked'
export const read = () => secret()
`,
            'src/client.ts': `export const read = () => 'client'\n`,
          },
          entry: { client: 'src/client.ts', ssr: 'src/server.ts' },
        }),
      )
      expect(report.environment).toBe('server')
      expectMarkerViolation(report, {
        marker: 'src/marked.ts:1',
        use: 'src/server.ts:2:27',
      })
    },
    timeout,
  )

  // Several modules import the marked module (directly and through a
  // re-export), so the marker check sees it imported after it has seen its
  // marker.
  test.each([
    { env: 'ssr', marker: 'server-only', build: 'server' },
    { env: 'client', marker: 'client-only', build: 'client' },
  ] as const)(
    'the $build build may import a $marker-marked module from several modules, without any import-protection output',
    async ({ env, marker }) => {
      const built = await buildStart({
        bundler,
        files: {
          'src/marked.ts': `import '@tanstack/react-start/${marker}'
export const secret = () => 'MARK_SECRET'
`,
          'src/d.ts': `import { secret } from './marked'
export const d = () => secret()
`,
          'src/c.ts': `export { d } from './d'\n`,
          'src/user.ts': `import { secret } from './marked'
import { d } from './c'
export const read = () => secret() + '|' + d()
`,
          'src/other.ts': `export const read = () => 'other'\n`,
        },
        entry:
          env === 'ssr'
            ? { client: 'src/other.ts', ssr: 'src/user.ts' }
            : { client: 'src/user.ts', ssr: 'src/other.ts' },
      })
      expect((await built[env].run(`return entry.read()`)).result).toBe(
        'MARK_SECRET|MARK_SECRET',
      )
      expect(
        reportedViolations([
          ...built.client.warnings,
          ...built.ssr.warnings,
          ...built.client.consoleMessages,
        ]),
      ).toEqual([])
    },
    timeout,
  )

  test(
    'enabled: false checks nothing: the client gets the real module',
    async () => {
      expect(
        await clientRead(bundler, appUsing('a denied file'), {
          importProtection: { enabled: false },
        }),
      ).toEqual({ hasRealCode: true, ranReal: true, warnings: [] })
    },
    timeout,
  )
})

// A build reports the denied imports that survive tree-shaking: "If an import
// is eliminated from the final bundle, no violation is reported"
// (guide/import-protection.md, "False Positives: Dev vs Build"; its example is a marked file
// re-exported through a mixed barrel that the client never uses).
// Source: mutation run R4 (generateBundle's survival check, spc:5266, 5268,
// 5275).
describe.each(startBundlers)('%s build, tree-shaken imports', (bundler) => {
  // Bug (Rsbuild): same as the pins "a denied module the client bundle drops
  // does not fail the build" (known-bugs.test.ts): the Rsbuild report step
  // walks every module of the module graph, used or not, so the marked
  // module the client bundle drops still fails the build.
  // Impact: on Rsbuild, a mixed barrel re-exporting a server-only-marked
  // module fails the build even when the client only uses its other exports.
  const barrelTest = bundler === 'rsbuild' ? test.fails : test
  barrelTest(
    'a server-only-marked module re-exported by a barrel the client uses other exports of builds without any report',
    async () => {
      const { client } = await buildStart({
        bundler,
        files: {
          ...deniedModules['a server-only-marked module'].files,
          'src/barrel.ts': `export { secret } from './marked'
export const label = () => 'client'
`,
          'src/entry.ts': `import { label } from './barrel'
export const read = () => label()
`,
        },
        entry: 'src/entry.ts',
      })
      expect({
        reported: reportedViolations(client.warnings),
        hasRealCode: client.where('MARK_SECRET') !== 'nowhere',
        read: (await client.run(`return entry.read()`)).result,
      }).toEqual({ reported: [], hasRealCode: false, read: 'client' })
    },
    timeout,
  )
})

// `behavior: 'mock'` builds: a denied import is replaced with a mock (and
// a warning); the real module's code stays out of the bundle and its
// initializer never runs; `mockAccess` says whether using the mock is
// reported in the console (SPEC J6.3: it applies wherever a mock is served,
// a production build included; `off` for silence).
describe.each(startBundlers)('%s build, mock mode', (bundler) => {
  interface MockedImport {
    /** The specifier `src/entry.ts` imports `secret` with. */
    importedAs: string
    files: Record<string, string>
    /** Other imports of `src/entry.ts`. */
    imports?: string
    /** The environment that imports it (default `client`). */
    env?: 'client' | 'ssr'
  }

  /**
   * What the environment that imports `secret` gets for it in a mock-mode
   * build with `mockAccess`: whether a warning was reported, whether the
   * real code is in the bundle and its initializer ran, what the import is
   * (`a safe mock`), and what using it (a call) logged, by console method.
   */
  async function mockedRead(
    denied: MockedImport,
    mockAccess: 'error' | 'warn' | 'off' | undefined = 'off',
  ) {
    const env = denied.env ?? 'client'
    const built = await buildStart({
      bundler,
      files: {
        ...recording(denied.files),
        'src/entry.ts': `${denied.imports ?? ''}import { secret } from '${denied.importedAs}'
export const read = () => secret
`,
        'src/other.ts': `export const read = () => 'other'\n`,
      },
      entry:
        env === 'client'
          ? 'src/entry.ts'
          : { client: 'src/other.ts', ssr: 'src/entry.ts' },
      start: { importProtection: { behavior: 'mock', mockAccess } },
    })
    const { result } = await built[env].run(`${describeValuePrelude}
const logged = []
for (const level of ['warn', 'error']) {
  console[level] = (...args) => {
    logged.push(level + ': ' + (args[0] instanceof Error ? args[0].message : String(args[0])))
  }
}
const secret = entry.read()
const read = describeValue(secret, 'MARK_SECRET')
secret()
return { read, ran: globalThis.secretLoaded ?? null, logged }`)
    const { read, ran, logged } = result as {
      read: string
      ran: unknown
      logged: Array<string>
    }
    return {
      warned: reportedViolations(built[env].warnings).length > 0,
      hasRealCode: built[env].where('MARK_SECRET') !== 'nowhere',
      ran,
      read,
      /** The console methods a use of the mock logged with, each once. */
      loggedWith: distinct(logged.map((entry) => entry.split(':')[0]!)),
    }
  }

  /** A safe mock, silent with `mockAccess: 'off'`; the build warns. */
  const mocked = {
    warned: true,
    hasRealCode: false,
    ran: null,
    read: 'a safe mock',
    loggedWith: [],
  }

  const deniedFile = (extension: string): MockedImport => ({
    importedAs: `./secret.server.${extension}`,
    files: {
      [`src/secret.server.${extension}`]: `globalThis.secretLoaded = 'MARK_SECRET_LOADED'
export const secret = () => 'MARK_SECRET'
`,
    },
  })

  const deniedFiles: Record<string, MockedImport> = {
    'a denied file': deniedModules['a denied file'],
    'a denied .server.mts file': deniedFile('mts'),
    'a denied .server.mjs file': deniedFile('mjs'),
    'a denied file of a module that imports CSS': {
      ...deniedModules['a denied file'],
      files: {
        ...deniedModules['a denied file'].files,
        'src/style.css': `.page { color: red }\n`,
      },
      imports: `import './style.css'\n`,
    },
  }

  test.each(Object.keys(deniedFiles))(
    '%s is mocked, with a warning',
    async (name) => {
      expect(await mockedRead(deniedFiles[name]!)).toEqual(mocked)
    },
    timeout,
  )

  // Bug: a mock-mode build serves self-contained mocks that never report
  // their use (`generateSelfContainedMockModule`, import-protection/
  // virtualModules.ts; the Vite transform's `isBuild` branch and the Rsbuild
  // loader), whatever `mockAccess` says; only dev mocks carry the runtime
  // diagnostic (`mockRuntimeModuleIdFromViolation`). `mockAccess` is
  // documented for `behavior: 'mock'` without a dev restriction
  // (schema.ts), and SPEC J6.3 applies it wherever a mock is served.
  // Impact: in a production build with `behavior: { build: 'mock' }`, code
  // that runs on a mocked import does so without any console diagnostic;
  // the warning at build time is the only trace of it.
  // Source: V1 ip S02 (the rows above demanded silence with the default).
  test.fails.each([
    { mockAccess: undefined, method: 'error' },
    { mockAccess: 'error', method: 'error' },
    { mockAccess: 'warn', method: 'warn' },
  ] as const)(
    'with mockAccess $mockAccess, using the mock of a denied file is reported with console.$method',
    async ({ mockAccess, method }) => {
      expect(
        await mockedRead(deniedModules['a denied file'], mockAccess),
      ).toEqual({ ...mocked, loggedWith: [method] })
    },
    timeout,
  )

  const markedModules: Record<string, MockedImport> = {
    'a server-only-marked module': deniedModules['a server-only-marked module'],
    'a client-only-marked module imported by the server': {
      importedAs: './marked',
      files: clientOnlyMarked,
      env: 'ssr',
    },
  }

  // Bug (Vite): in a build, a violation of a marker (server-only in the
  // client, client-only in the server) only replaces the marker import
  // itself with a mock (`handleViolation` in
  // vite/import-protection-plugin/plugin.ts returns a mock edge for the
  // marker specifier); the marked module keeps its code, and its importers
  // import it. The Rsbuild adapter replaces the module with a mock
  // (self-denial in its import-protection loader). Vite dev mocks the
  // importers' import (see dev.test.ts).
  // Impact: a mock-mode Vite build ships the marked module's real code in
  // the bundle of the environment it is denied to, and runs it (only a
  // warning is logged).
  // Source: found writing the H2 rows (oracle-gaps REPORT.md); client-only
  // row: round 3 mutation testing (ip-misc P2).
  const markerMockTest = bundler === 'vite' ? test.fails : test
  markerMockTest.each(Object.keys(markedModules))(
    '%s is mocked, with a warning',
    async (name) => {
      expect(await mockedRead(markedModules[name]!)).toEqual(mocked)
    },
    timeout,
  )

  // A module that re-exports from a denied specifier is rewritten like a
  // module that imports from it; re-exports of other modules keep their
  // values.
  test(
    're-exports from a denied specifier are mocked; other re-exports keep their values',
    async () => {
      const { client } = await buildStart({
        bundler,
        files: {
          'node_modules/denied-pkg/package.json': JSON.stringify({
            name: 'denied-pkg',
            type: 'module',
            main: 'index.js',
            sideEffects: false,
          }),
          'node_modules/denied-pkg/index.js': `export const secret = () => 'MARK_SECRET'\n`,
          'node_modules/safe-pkg/package.json': JSON.stringify({
            name: 'safe-pkg',
            type: 'module',
            main: 'index.js',
          }),
          'node_modules/safe-pkg/index.js': `export const ok = () => 'MARK_SAFE'
export const fine = () => 'MARK_FINE'
`,
          'src/barrel.ts': `export { secret } from 'denied-pkg'\n`,
          'src/mixed.ts': `import { secret as aliased } from 'denied-pkg'
export { ok } from 'safe-pkg'
export * from './fine'
export const s = () => aliased
`,
          'src/fine.ts': `export { fine } from 'safe-pkg'\n`,
          'src/entry.ts': `import { secret } from './barrel'
import { ok, fine, s } from './mixed'
export const read = () => [secret, ok(), fine(), s()]
`,
        },
        entry: 'src/entry.ts',
        start: {
          importProtection: {
            behavior: 'mock',
            mockAccess: 'off',
            client: { specifiers: ['denied-pkg'] },
          },
        },
      })
      expect({
        hasRealCode: client.where('MARK_SECRET') !== 'nowhere',
        read: (
          await client.run(`${describeValuePrelude}
return entry.read().map((value) => describeValue(value, 'MARK_SECRET'))`)
        ).result,
      }).toEqual({
        hasRealCode: false,
        read: ['a safe mock', 'MARK_SAFE', 'MARK_FINE', 'a safe mock'],
      })
    },
    timeout,
  )

  // The route module and its split component are two modules of the bundle
  // that import the denied file for the same import of the source.
  // Source: mutation run R4 (spc:5296, 5299).
  test(
    'a denied import of a route used by its loader and its split component is warned once',
    async () => {
      const { client } = await buildStart({
        bundler,
        files: {
          ...deniedModules['a denied file'].files,
          'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { secret } from '../secret.server'
export const Route = createFileRoute('/')({
  loader: () => String(secret()),
  component: () => String(secret()),
})
`,
          'src/router.ts': `import { routeTree } from './routeTree.gen'
export const getRouter = () => ({ routeTree })
`,
          'src/entry.ts': `export { getRouter } from './router'\n`,
        },
        entry: 'src/entry.ts',
        start: { importProtection: { behavior: 'mock' } },
      })
      expect(client.where('MARK_SECRET')).toBe('nowhere')
      expect(reportedViolations(client.warnings)).toEqual([
        {
          environment: 'client',
          importer: expect.stringMatching(/^src\/routes\/index\.tsx/),
        },
      ])
    },
    timeout,
  )
})

// Bug: `onViolation` runs after the build has replaced the denied module
// (or import) with a mock: Vite substitutes the mock when it resolves the
// import and calls `onViolation` in `generateBundle`
// (vite/import-protection-plugin/plugin.ts `reportOrDeferViolation`);
// Rsbuild mocks in its loader and calls it when reporting in `processAssets`
// (rsbuild/import-protection.ts `reportViolation`). Returning `false` only
// silences the report. (A Vite build of a server-only marker violation keeps
// the real module either way, see the mock-mode pin above.)
// Impact: an import a project allows with `onViolation` (documented:
// "Return false ... to allow this specific import (override the denial)",
// guide/import-protection.md) is a mock in the client: its calls return mocks
// in production, without any warning.
// Source: oracle-gaps H2 / gap IP11 (`onViolation` false only had a recorder).
describe.each(startBundlers)(
  '%s build, onViolation returning false',
  (bundler) => {
    const allowed = { hasRealCode: true, ranReal: true, warnings: [] }
    const allowAll = { importProtection: { onViolation: () => false } }

    // Vite builds the module of a marker violation into the bundle either
    // way (see the mock-mode pin above).
    const pinned: Array<DeniedModule> =
      bundler === 'vite' ? ['a denied file'] : deniedModuleNames
    const passing = deniedModuleNames.filter(
      (denied) => !pinned.includes(denied),
    )

    test.fails.each(pinned)(
      'allows the import of %s: the build succeeds and the client gets the real module',
      async (denied) => {
        expect(await clientRead(bundler, appUsing(denied), allowAll)).toEqual(
          allowed,
        )
      },
      timeout,
    )

    if (passing.length > 0) {
      test.each(passing)(
        'allows the import of %s: the build succeeds and the client gets the real module',
        async (denied) => {
          expect(await clientRead(bundler, appUsing(denied), allowAll)).toEqual(
            allowed,
          )
        },
        timeout,
      )
    }

    // Control for the pins above (same harness): the build succeeds.
    test.each(pinned)(
      'allows the import of %s: the build succeeds',
      async (denied) => {
        const { warnings } = await clientRead(
          bundler,
          appUsing(denied),
          allowAll,
        )
        expect(warnings).toEqual([])
      },
      timeout,
    )
  },
)

// Which client imports of a server-only-marked module are checked: a
// marker violation is reported for each importer that is in scope and
// compiles, whatever kind of module imports it; an importer `ignoreImporters`
// exempts is neither reported nor mocked (SPEC J6.7).
// Source: replaces the Rsbuild "registerImportProtection marker scope" tests
// that ran on a hand-built fake of the Rspack compilation
// (rsbuild/import-protection.test.ts); rubric-start item 25.
describe.each(startBundlers)('%s build, server-only marker', (bundler) => {
  const marked = deniedModules['a server-only-marked module'].files

  /**
   * The importer a violation blames, relative to the app root: `Importer:`
   * when it is not the marked module itself, else the trace step that
   * imports the marked module (a marker violation may be reported at
   * either, audit F ASK-1).
   */
  const blamedImporter = (info: ViolationInfo) => {
    const fromRoot = (file: string | undefined) =>
      file
        ?.split(path.sep)
        .join('/')
        .replace(/^.*?\/(?=src\/)/, '')
    const importer = fromRoot(info.importer)
    return importer === 'src/marked.ts'
      ? fromRoot(info.trace.at(-2)?.file)
      : importer
  }

  /**
   * `src/ignored.ts` (exempt) and `src/other.ts` both use the marked
   * module; the entry re-exports both.
   */
  const ignoredAndOther = {
    ...marked,
    'src/ignored.ts': `import { secret } from './marked'\nexport const a = () => secret()\n`,
    'src/other.ts': `import { secret } from './marked'\nexport const b = () => secret()\n`,
    'src/entry.ts': `export { a } from './ignored'\nexport { b } from './other'\n`,
  }

  test(
    'imported by an ignored importer and another importer fails the build',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: ignoredAndOther,
          entry: 'src/entry.ts',
          start: { importProtection: { ignoreImporters: ['**/ignored.ts'] } },
        }),
      )
      expect(reportedViolations(error.message)).toHaveLength(1)
    },
    timeout,
  )

  // Bug (Rsbuild): the Rsbuild adapter reports a marker violation at the
  // marked module (audit F ASK-1 allows it) with the shortest import chain
  // from the entry to the marked module (`buildTrace`,
  // import-protection/trace.ts, a BFS to the nearest entry), whichever
  // importer it runs through: here the exempt `src/ignored.ts`, two steps
  // from the entry, while the importer the violation is for, `src/other.ts`,
  // is three steps away. An exempt edge is no violation (SPEC J6.7), so a
  // report whose chain ends with one names the wrong importer. Vite reports
  // the violation at the importer's use, and blames the right one.
  // Impact: on Rsbuild, the report of a server-only-marked module imported
  // by an exempt importer and another one blames the exempt importer; the
  // user looks at code the project ignores on purpose, and the real
  // importer is not named.
  // Source: V1 ip S20.
  ;(bundler === 'rsbuild' ? test.fails : test)(
    'imported by an ignored importer and, further from the entry, another importer: the violation blames the other importer',
    async () => {
      const seen: Array<ViolationInfo> = []
      await rejection(
        buildStart({
          bundler,
          files: {
            ...ignoredAndOther,
            'src/mid.ts': `export { b } from './other'\n`,
            'src/entry.ts': `export { a } from './ignored'\nexport { b } from './mid'\n`,
          },
          entry: 'src/entry.ts',
          start: {
            importProtection: {
              ignoreImporters: ['**/ignored.ts'],
              onViolation: (info) => {
                seen.push(info as ViolationInfo)
              },
            },
          },
        }),
      )
      expect(seen).not.toEqual([])
      expect(distinct(seen.map(blamedImporter))).toEqual(['src/other.ts'])
    },
    timeout,
  )

  // Bug (Vite): the Vite adapter reports a marker violation for the marked
  // module itself (`importer` is the module importing the marker) and does
  // not look at which modules import it, so `ignoreImporters` cannot exempt
  // them (vite/import-protection-plugin/plugin.ts, marker handling in
  // `resolveId`). The Rsbuild adapter checks the marked module's importers.
  // Impact: on Vite, `ignoreImporters` (documented: "Ignore violations from
  // these importers") does not apply to server-only-marked modules; a build
  // fails for an import the project ignores.
  // Source: found replacing the Rsbuild marker-scope test "skips marker
  // violations imported only by an ignored importer".
  const ignoredTest = bundler === 'vite' ? test.fails : test

  /** Only the exempt `src/ignored.ts` imports the marked module. */
  const ignoredOnly = {
    ...marked,
    'src/ignored.ts': `import { secret } from './marked'\nexport const read = () => secret()\n`,
    'src/entry.ts': `export { read } from './ignored'\n`,
  }

  ignoredTest(
    'imported only by an ignored importer does not fail the build',
    async () => {
      const { client } = await buildStart({
        bundler,
        files: ignoredOnly,
        entry: 'src/entry.ts',
        start: { importProtection: { ignoreImporters: ['**/ignored.ts'] } },
      })
      expect(reportedViolations(client.warnings)).toEqual([])
    },
    timeout,
  )

  // Bug: an importer `ignoreImporters` exempts still gets the mock of a
  // server-only-marked module in a mock-mode build: Rsbuild replaces the
  // marked module itself with a mock in its loader, for every importer
  // (the exemption pins of exemptions.test.ts, user ruling 2026-10-17); on
  // Vite the marker violation is not exempt at all (the pin above), and in
  // error mode the build fails.
  // Impact: code a project exempts on purpose silently gets a mock instead
  // of the module it imports.
  test.fails(
    'imported only by an ignored importer: the ignored importer gets the real module',
    async () => {
      expect(
        await clientRead(bundler, ignoredOnly, {
          importProtection: {
            behavior: 'mock',
            ignoreImporters: ['**/ignored.ts'],
          },
        }),
      ).toEqual({ hasRealCode: true, ranReal: true, warnings: [] })
    },
    timeout,
  )

  // Bug: the same bugs, on one app, in a mock-mode build. Rsbuild: the
  // marked module is mocked for every importer, the exempt one included,
  // and the one report is at the marked module (`src/marked.ts`), not at
  // the other importer. Vite: the exempt importer gets the real module and
  // the other a mock, but the marker import of the marked module itself is
  // reported too (`ignoreImporters` does not apply to it, the pin above),
  // so the reports name `src/marked.ts` besides `src/other.ts`.
  // Impact: as above; on Rsbuild, code a project exempts gets a mock; on
  // both, the report does not single out the importer at fault.
  test.fails(
    'in mock mode, an ignored importer gets the real module, another importer a safe mock, and only the other importer is reported',
    async () => {
      const { client } = await buildStart({
        bundler,
        files: ignoredAndOther,
        entry: 'src/entry.ts',
        start: {
          importProtection: {
            behavior: 'mock',
            mockAccess: 'off',
            ignoreImporters: ['**/ignored.ts'],
          },
        },
      })
      const { result } = await client.run(`${describeValuePrelude}
return {
  ignored: describeValue(entry.a(), 'MARK_SECRET'),
  other: describeValue(entry.b(), 'MARK_SECRET'),
}`)
      expect({
        ...(result as object),
        reported: reportedViolations(client.warnings).map(({ importer }) =>
          importer.replace(/:\d+:\d+$/, ''),
        ),
      }).toEqual({
        ignored: 'MARK_SECRET',
        other: 'a safe mock',
        reported: ['src/other.ts'],
      })
    },
    timeout,
  )

  test(
    'imported by a split route component fails the build',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            ...marked,
            'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { secret } from '../marked'
export const Route = createFileRoute('/')({
  component: () => String(secret()),
})
`,
            'src/router.ts': `import { routeTree } from './routeTree.gen'
export const getRouter = () => ({ routeTree })
`,
            'src/entry.ts': `export { getRouter } from './router'\n`,
          },
          entry: 'src/entry.ts',
        }),
      )
      expect(reportedViolations(error.message)).toHaveLength(1)
      expect(error.message).toContain('src/routes/index.tsx')
    },
    timeout,
  )

  test(
    'marking the client entry fails the build',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            'src/client.ts': `import '@tanstack/react-start/server-only'
console.log('client')
`,
            'src/entry.ts': `export const read = () => 'entry'\n`,
          },
          entry: 'src/entry.ts',
        }),
      )
      expect(reportedViolations(error.message)).toEqual([
        {
          environment: 'client',
          importer: expect.stringMatching(/^src\/client\.ts/),
        },
      ])
    },
    timeout,
  )

  test(
    'imported by a module that fails to compile: the build reports the compile error only',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            ...marked,
            'src/broken.ts': `import { secret } from './marked'
export const read = ( => secret()
`,
            'src/entry.ts': `export { read } from './broken'\n`,
          },
          entry: 'src/entry.ts',
        }),
      )
      expect(error.message).toContain('src/broken.ts')
      expect(reportedViolations(error.message)).toEqual([])
    },
    timeout,
  )
})
