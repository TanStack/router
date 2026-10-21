/**
 * Import protection in a real Start build (Vite and Rsbuild), continued
 * from build.test.ts and build-mock.test.ts (three files, to keep each
 * within the per-file time budget): an `onViolation` that returns false,
 * and the server-only marker. A mock is told by what it does
 * (`mock-helpers.ts`, `describeValue`: `a safe mock`), and a report by its
 * sections (`violation-report.ts`).
 */
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { problems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { buildStart, startBundlers } from '../../build-harness'
import { describeValuePrelude } from '../../importProtection/mock-helpers'
import {
  distinct,
  expectMarkerViolation,
  expectViolationsAt,
  locationIn,
  rejection,
  reportedViolations,
  violationReports,
} from '../../importProtection/start-apps'
import type { TanStackStartInputConfig } from '../../../src'
import type { ViolationInfo } from '../../importProtection/public-types'

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

/**
 * What a failed build reported, on every channel (a compiler may print the
 * details to the console and fail the build with a short error, SPEC §5.7):
 * the `StartBuildError`'s diagnostics.
 */
const everyChannel = (error: Error) =>
  (error as Error & { diagnostics?: Array<unknown> }).diagnostics ?? error

/**
 * Builds `files` with `bundler`; what the client gets from `entry.read()`,
 * and what the build reported as a problem on any channel (`warnings`).
 */
async function clientRead(
  bundler: (typeof startBundlers)[number],
  files: Record<string, string>,
  start: TanStackStartInputConfig,
) {
  const build = await buildStart({
    bundler,
    files,
    entry: 'src/entry.ts',
    start,
  })
  const { client } = build
  const read = (await client.run(`return String(entry.read())`))
    .result as string
  return {
    /** The real module's code is in the client bundle. */
    hasRealCode: client.where('MARK_SECRET') !== 'nowhere',
    /** `entry.read()` ran the real module. */
    ranReal: read === 'MARK_SECRET',
    warnings: problems(build.diagnostics).map(({ text }) => text),
  }
}

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
      expect(reportedViolations(error)).toHaveLength(1)
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
      const build = await buildStart({
        bundler,
        files: ignoredOnly,
        entry: 'src/entry.ts',
        start: { importProtection: { ignoreImporters: ['**/ignored.ts'] } },
      })
      // Nothing reported, on any channel
      expect(reportedViolations(build)).toEqual([])
      expect(problems(build.diagnostics).map(({ text }) => text)).toEqual([])
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

  // Bug: in a mock-mode build, a server-only-marked module imported by an
  // exempt importer and another importer is a mock for both (Rsbuild), or
  // the real module for the other importer (Vite).
  // - Rsbuild replaces the marked module itself with a mock in its loader,
  //   for every importer, in every import order (the pin above).
  // - Vite mocks an importer's import of a marked module only when the
  //   marked module's own marker import was resolved first (`resolveId` in
  //   vite/import-protection-plugin/plugin.ts reads `fileMarkerKind`);
  //   otherwise that importer gets the real module (the "is mocked, with a
  //   warning" pin of the mock-mode block). Only the exempt importer can load
  //   the marked module before the other importer's import is resolved, so
  //   the outcome is a race of the build: the other importer gets the real
  //   module in every build when it is nearer the entry than the exempt
  //   importer, in most builds when they are side by side, and in a few
  //   when the exempt importer is nearer.
  // The orders where the other importer is nearer come first: they keep the
  // pin red on both bundlers in every run; the racy orders follow, so the
  // pin passes only when no order leaks.
  // Source: V1R ip I09/S20; public entry-order and indirection variants.
  // Impact: exemptions either stop working (Rsbuild) or leak the denied real
  // value to the importer that is not exempt (Vite).
  // Blame is read from onViolation/trace: marker-origin display is allowed.
  test.fails(
    'in mock mode, an ignored importer gets the real module, another importer a safe mock, and only the other importer is reported',
    async () => {
      for (const entry of [
        // The other importer nearer the entry, in both orders
        `export { b } from './other'\nexport { a } from './mid-ignored'\n`,
        `export { a } from './mid-ignored'\nexport { b } from './other'\n`,
        // Side by side, in both orders
        `export { a } from './ignored'\nexport { b } from './other'\n`,
        `export { b } from './other'\nexport { a } from './ignored'\n`,
        // The ignored importer nearer the entry
        `export { a } from './ignored'\nexport { b } from './mid'\n`,
      ]) {
        const seen: Array<ViolationInfo> = []
        const { client } = await buildStart({
          bundler,
          files: {
            ...ignoredAndOther,
            'src/entry.ts': entry,
            'src/mid.ts': `export { b } from './other'\n`,
            'src/mid-ignored.ts': `export { a } from './ignored'\n`,
          },
          entry: 'src/entry.ts',
          start: {
            importProtection: {
              behavior: 'mock',
              mockAccess: 'off',
              ignoreImporters: ['**/ignored.ts'],
              onViolation: (info) => {
                seen.push(info as ViolationInfo)
              },
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
          reported: distinct(seen.map(blamedImporter)),
        }).toEqual({
          ignored: 'MARK_SECRET',
          other: 'a safe mock',
          reported: ['src/other.ts'],
        })
      }
    },
    timeout,
  )

  test(
    'imported by a split route component fails the build',
    async () => {
      const splitRoute = `import { createFileRoute } from '@tanstack/react-router'
import { secret } from '../marked'
export const Route = createFileRoute('/')({
  component: () => String(secret()),
})
`
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            ...marked,
            'src/routes/index.tsx': splitRoute,
            'src/router.ts': `import { routeTree } from './routeTree.gen'
export const getRouter = () => ({ routeTree })
`,
            'src/entry.ts': `export { getRouter } from './router'\n`,
          },
          entry: 'src/entry.ts',
        }),
      )
      const [report, ...others] = violationReports(error)
      expect(others).toEqual([])
      expectMarkerViolation(report!, {
        marker: 'src/marked.ts:1',
        use: locationIn('src/routes/index.tsx', splitRoute, 4, 'secret()'),
        source: splitRoute,
      })
    },
    timeout,
  )

  test(
    'marking the client entry fails the build',
    async () => {
      const client = `import '@tanstack/react-start/server-only'
console.log('client')
`
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            'src/client.ts': client,
            'src/entry.ts': `export const read = () => 'entry'\n`,
          },
          entry: 'src/entry.ts',
        }),
      )
      // At the client entry's marker import, line 1 (any column)
      expect(reportedViolations(error)).toHaveLength(1)
      expectViolationsAt(error, [
        { environment: 'client', use: 'src/client.ts:1', source: client },
      ])
    },
    timeout,
  )

  // The build fails and names the broken file at its line (an actionable
  // error, SPEC G5); other diagnostics may come with it (V1 ip S21).
  test(
    'imported by a module that fails to compile: the build fails, naming the broken file and line',
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
      expectDiagnostic(everyChannel(error), {
        severity: 'error',
        file: 'src/broken.ts',
        position: { line: 2 },
      })
    },
    timeout,
  )
})
