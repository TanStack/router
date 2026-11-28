/**
 * The app of the reported-location tests (reported-location.test.ts,
 * reported-location-removed.test.ts): where a real app reports the
 * violation of an importer `src/a.tsx` of the denied `src/secret.server.ts`,
 * on each channel (the Vite dev server's warnings in mock mode; the errors
 * of an Rsbuild dev server and of Vite and Rsbuild builds in error mode),
 * as `onViolation` receives it.
 */
import { expect } from 'vitest'
import {
  findDiagnostics,
  mentionsFile,
} from '@tanstack/compiler-test-utils/diagnostics'
import { buildStart } from '../../build-start'
import { startRsbuildDevServer } from '../../rsbuild-dev-server'
import {
  appFileOf,
  distinct,
  isAt,
  locationIn,
  locationParts,
  reportedViolations,
  startProtectedDevServer,
  violationRecorder,
} from '../../importProtection/start-apps'
import type { Recorded } from '../../importProtection/start-apps'
import type { StartBuildError } from '../../build-harness'
import type { Diagnostic } from '@tanstack/compiler-test-utils/diagnostics'

export const timeout = 60_000

export type Channel =
  | 'vite dev'
  | 'rsbuild dev'
  | 'vite build'
  | 'rsbuild build'

const secretServerModule = `export const eq = () => 1
export const secret = () => 'secret'
export default function Secret() {
  return 'secret'
}
`

/**
 * What `channel` reports for the app `files` (entry `src/entry.ts`): what
 * `onViolation` received, and the errors of a dev server's channels (none
 * for a build: a build that fails for another reason fails the call).
 */
async function reportsOf(
  channel: Channel,
  files: Record<string, string>,
  { sourcemap = false }: { sourcemap?: boolean },
): Promise<{
  output: Recorded
  diagnostics: Array<Diagnostic>
  /** A build that failed (on its violations). */
  failed: boolean
}> {
  if (channel === 'vite dev') {
    const server = await startProtectedDevServer(files)
    await server.load('/src/entry.ts')
    return { output: server, diagnostics: [], failed: false }
  }
  if (channel === 'rsbuild dev') {
    const recorder = violationRecorder({ behavior: 'error' })
    const server = await startRsbuildDevServer({
      files,
      importProtection: recorder.importProtection,
      // Rsbuild's default source maps in development
      config: { output: { sourceMap: { js: 'cheap-module-source-map' } } },
    })
    return {
      output: { root: server.root, violations: recorder.violations },
      diagnostics: server.diagnostics,
      failed: false,
    }
  }
  const bundler = channel === 'vite build' ? 'vite' : 'rsbuild'
  // (a build without any violation succeeds)
  return buildStart({
    bundler,
    files,
    entry: 'src/entry.ts',
    sourcemap,
  }).then(
    (build) => ({
      output: build,
      diagnostics: build.diagnostics,
      failed: false,
    }),
    (error: StartBuildError) => {
      // (a build that fails for another reason fails the test)
      if (reportedViolations(error).length === 0) {
        throw error
      }
      return { output: error, diagnostics: error.diagnostics, failed: true }
    },
  )
}

/**
 * The importer locations reported for an app whose `src/a.tsx` is `code`
 * (imported by the entry `src/entry.ts`) and imports from the denied
 * `src/secret.server.ts` (none when nothing is reported). JSX compiles
 * with the real React (a dependency of this package).
 */
export async function reportedLocations(
  channel: Channel,
  code: string,
  /** Builds: emit source maps (Rsbuild's `output.sourceMap.js`, Vite's `build.sourcemap`). */
  options: { sourcemap?: boolean } = {},
): Promise<Array<string>> {
  const { output, diagnostics } = await reportsOf(
    channel,
    {
      'src/secret.server.ts': secretServerModule,
      'src/a.tsx': code,
      'src/entry.ts': `export * from './a'\n`,
    },
    options,
  )
  expectNoOtherErrors({ ...output, diagnostics })
  return distinct(reportedViolations(output).map((report) => report.importer))
}

/** The file of a case of `reportedLocationsOfCases`: `src/<name>/a.tsx`. */
export const caseFile = (name: string) => `src/${name}/a.tsx`

/**
 * `reportedLocations` of several cases in one app per channel: each case
 * `name` is `src/<name>/a.tsx` (`caseFile`) next to a denied
 * `src/<name>/secret.server.ts` of its own, and the entry re-exports each
 * as a namespace. The importer locations reported, by case (a case that
 * fails to compile for another reason has none); the other errors of a dev
 * server's channels (`otherErrors`, `expectNoOtherErrors`); every file a
 * report names (`files`); every importer location the app reported, whole
 * (`importers`: what an absence is checked on); and whether a build failed
 * (`failed`).
 */
export async function reportedLocationsOfCases(
  channel: Channel,
  codes: Record<string, string>,
): Promise<{
  of: (name: string) => Array<string>
  otherErrors: Array<string>
  files: Array<string>
  importers: Array<string>
  failed: boolean
}> {
  const names = Object.keys(codes)
  const { output, diagnostics, failed } = await reportsOf(
    channel,
    {
      ...Object.fromEntries(
        names.flatMap((name) => [
          [caseFile(name), codes[name]!],
          [`src/${name}/secret.server.ts`, secretServerModule],
        ]),
      ),
      'src/entry.ts': names
        .map((name) => `export * as ${name} from './${name}/a'\n`)
        .join(''),
    },
    {},
  )
  const importers = distinct(
    reportedViolations(output).map((report) => report.importer),
  )
  const fileOf = (importer: string) =>
    locationParts(importer.replace(/^[a-z]+:\/+/, '')).file
  return {
    of: (name) =>
      importers.filter((importer) => fileOf(importer) === caseFile(name)),
    otherErrors: otherErrorsOf({ ...output, diagnostics }, names.map(caseFile)),
    files: distinct(importers.map(fileOf)).sort(),
    importers,
    failed,
  }
}

/**
 * Fails when `output` (a dev server's `diagnostics`, every channel) has an
 * error that names none of the importers' files `onViolation` received
 * (`appFileOf`): a compile that fails for another reason fails the test,
 * whatever the reports' wording (SPEC §5.7, J6.12).
 */
export function expectNoOtherErrors(
  output: Recorded & {
    diagnostics: Array<{ severity: string; text: string }>
  },
) {
  expect(otherErrorsOf(output)).toEqual([])
}

/**
 * The texts of the errors `expectNoOtherErrors` fails on: an error that
 * names none of the reported importers' files, or that names one of
 * `importerFiles` (root-relative: the cases' importers) no violation was
 * reported for (a compile error printed with another case's report).
 */
export function otherErrorsOf(
  output: Recorded & {
    diagnostics: Array<{ severity: string; text: string }>
  },
  importerFiles: Array<string> = [],
): Array<string> {
  const reported = distinct(
    reportedViolations(output).map(({ importer }) => appFileOf(importer)),
  )
  const unreported = importerFiles.filter((file) => !reported.includes(file))
  const names = (text: string, file: string) =>
    mentionsFile(text, file, { root: output.root })
  return findDiagnostics(output.diagnostics, { severity: 'error' })
    .filter(
      ({ text }) =>
        !reported.some((file) => names(text, file)) ||
        unreported.some((file) => names(text, file)),
    )
    .map(({ text }) => text)
}

/** Every channel. */
export const channels: Array<Channel> = [
  'vite dev',
  'rsbuild dev',
  'vite build',
  'rsbuild build',
]

/**
 * Fails unless one violation is reported, at one of `places`
 * (`file:line:column`, or `file:line` for any column; SPEC J6.5): the
 * genuine surviving uses, or the line of the original import of
 * the denied module, written out by the test. Never a type position, a use
 * inside a removed boundary, an unrelated member named like the import,
 * compiled coordinates, nor no coordinates.
 */
export function expectRelevantLocation(
  reported: Array<string>,
  places: Array<string>,
) {
  expect(reported).toHaveLength(1)
  // (the file without a URL scheme: `appFileOf`)
  const at = reported[0]!.replace(/^[a-z]+:\/+/, '')
  expect(
    places.some((place) => isAt(at, place)),
    `${reported[0]} is one of ${places.join(', ')}`,
  ).toBe(true)
}

/** `src/a.tsx:line:column` of the first `needle` on `line` of `code`. */
export const at = (code: string, line: number, needle: string) =>
  locationIn('src/a.tsx', code, line, needle)
