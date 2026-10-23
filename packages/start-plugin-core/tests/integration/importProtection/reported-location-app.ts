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
import { buildStart } from '../../build-harness'
import { startRsbuildDevServer } from '../../rsbuild-dev-server'
import {
  appFileOf,
  distinct,
  isAt,
  locationIn,
  reportedViolations,
  startProtectedDevServer,
  violationRecorder,
} from '../../importProtection/start-apps'
import type { Recorded } from '../../importProtection/start-apps'
import type { StartBuildError } from '../../build-harness'

export const timeout = 60_000

export type Channel =
  | 'vite dev'
  | 'rsbuild dev'
  | 'vite build'
  | 'rsbuild build'

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
  { sourcemap = false }: { sourcemap?: boolean } = {},
): Promise<Array<string>> {
  const files = {
    'src/secret.server.ts': `export const eq = () => 1
export const secret = () => 'secret'
export default function Secret() {
  return 'secret'
}
`,
    'src/a.tsx': code,
    'src/entry.ts': `export * from './a'\n`,
  }
  let output: Recorded
  if (channel === 'vite dev') {
    const server = await startProtectedDevServer(files)
    await server.load('/src/entry.ts')
    output = server
  } else if (channel === 'rsbuild dev') {
    const recorder = violationRecorder({ behavior: 'error' })
    const server = await startRsbuildDevServer({
      files,
      importProtection: recorder.importProtection,
      // Rsbuild's default source maps in development
      config: { output: { sourceMap: { js: 'cheap-module-source-map' } } },
    })
    output = { root: server.root, violations: recorder.violations }
    expectNoOtherErrors({ ...output, diagnostics: server.diagnostics })
  } else {
    const bundler = channel === 'vite build' ? 'vite' : 'rsbuild'
    // (a build without any violation succeeds)
    output = await buildStart({
      bundler,
      files,
      entry: 'src/entry.ts',
      sourcemap,
    }).then(
      (build) => build,
      (error: StartBuildError) => {
        // (a build that fails for another reason fails the test)
        if (reportedViolations(error).length === 0) {
          throw error
        }
        return error
      },
    )
  }
  return distinct(reportedViolations(output).map((report) => report.importer))
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
  const reported = distinct(
    reportedViolations(output).map(({ importer }) => appFileOf(importer)),
  )
  const others = findDiagnostics(output.diagnostics, {
    severity: 'error',
  }).filter(
    ({ text }) =>
      !reported.some((file) => mentionsFile(text, file, { root: output.root })),
  )
  expect(others.map(({ text }) => text)).toEqual([])
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
 * (`file:line:column`, or `file:line` for any column; SPEC J6.5; V1R ip
 * I01): the genuine surviving uses, or the line of the original import of
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
