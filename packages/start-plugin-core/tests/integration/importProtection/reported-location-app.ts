/**
 * The app of the reported-location tests (reported-location.test.ts,
 * reported-location-removed.test.ts): where a real app reports the
 * violation of an importer `src/a.tsx` of the denied `src/secret.server.ts`,
 * on each channel (the Vite dev server's warnings in mock mode; the errors
 * of an Rsbuild dev server and of Vite and Rsbuild builds in error mode),
 * read on every channel by the report reader (`violation-report.ts`).
 */
import path from 'node:path'
import { expect } from 'vitest'
import {
  expectRelevantLocation as expectSharedRelevantLocation,
  findDiagnostics,
  parseLocation,
} from '@tanstack/compiler-test-utils/diagnostics'
import { buildStart } from '../../build-harness'
import { startRsbuildDevServer } from '../../rsbuild-dev-server'
import {
  distinct,
  locationIn,
  reportedViolations,
  startProtectedDevServer,
  violationReports,
} from '../../importProtection/start-apps'
import type { ReportOutput } from '../../importProtection/violation-report'

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
  let output: ReportOutput
  if (channel === 'vite dev') {
    const server = await startProtectedDevServer(files)
    await server.load('/src/entry.ts')
    output = server
  } else if (channel === 'rsbuild dev') {
    const server = await startRsbuildDevServer({
      files,
      importProtection: { behavior: 'error' },
      // Rsbuild's default source maps in development
      config: { output: { sourceMap: { js: 'cheap-module-source-map' } } },
    })
    expectNoOtherErrors(server)
    output = server
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
      (error: unknown) => {
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
 * Fails when `output` (every channel: a dev server's `diagnostics`) has an
 * error that is no violation report and is not the failure of a reported
 * importer: a compile that fails for another reason fails the test, whatever
 * the reports' wording (a failing compile may carry the report itself, or
 * only name the importer the report printed elsewhere explains; SPEC §5.7,
 * J6.12).
 */
export function expectNoOtherErrors(output: {
  root: string
  diagnostics: Array<{ severity: string; text: string }>
}) {
  const reported = violationReports(output).map(
    ({ importer }) => parseLocation(importer).file,
  )
  const others = findDiagnostics(output.diagnostics, {
    severity: 'error',
  }).filter(
    ({ text }) =>
      violationReports({ root: output.root, diagnostics: [{ text }] })
        .length === 0 &&
      !reported.some(
        (file) =>
          text.includes(path.join(output.root, file)) || text.includes(file),
      ),
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
 * Fails unless one violation is reported, at a relevant place for the
 * violation of the module `file`, whose source is `code` (the shared
 * oracle `expectRelevantLocation`; SPEC J6.5; V1R ip I01): one of the
 * genuine surviving `uses` (`file:line:column`, or `file:line` for any
 * column), or any line of the original import of the denied module. Never
 * a type position, a use inside a removed boundary, an unrelated member
 * named like the import, compiled coordinates, nor no coordinates.
 */
export function expectRelevantLocation(
  reported: Array<string>,
  code: string,
  uses: Array<string>,
  file = 'src/a.tsx',
) {
  expect(reported).toHaveLength(1)
  expectSharedRelevantLocation(reported[0]!, {
    file,
    source: code,
    uses: uses.map((use) => {
      const { line, column } = parseLocation(use)
      return { line: line!, column }
    }),
    imports: ['./secret.server', './widget.client'],
  })
}

/** `src/a.tsx:line:column` of the first `needle` on `line` of `code`. */
export const at = (code: string, line: number, needle: string) =>
  locationIn('src/a.tsx', code, line, needle)
