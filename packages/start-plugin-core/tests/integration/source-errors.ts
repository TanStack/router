/**
 * Judges a failed build's diagnostic (SPEC G5, §5.7; ruling 2026-10-22: file
 * and position only): it names one of the user's sources and a line of the
 * call. Pure: only the shared diagnostics reader, no module of the
 * implementation.
 *
 * Every channel is read: pass the `StartBuildError` of `buildStart` (its
 * `diagnostics` hold the bundler's errors and what the build printed, so a
 * compiler that prints the details and fails with a short error is read
 * whole), or any value `diagnosticsOf` reads.
 */
import { expect } from 'vitest'
import {
  diagnosticPosition,
  diagnosticsOf,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import type { Diagnostic } from '@tanstack/compiler-test-utils/diagnostics'

/** The diagnostics of `error`: every channel when it carries them. */
function diagnosticsOfFailure(error: unknown): Array<Diagnostic> {
  const carried = (error as { diagnostics?: unknown } | null)?.diagnostics
  if (Array.isArray(carried)) {
    return (carried as Array<Diagnostic>).filter(
      ({ severity }) => severity !== 'info',
    )
  }
  return diagnosticsOf(error)
}

/**
 * Fails unless one diagnostic of `error` reports one of `sites`: its file,
 * and the line of `at` in its `source`.
 */
export function expectSourceError(
  error: unknown,
  expected: { sites: Array<{ file: string; source: string; at: string }> },
) {
  const diagnostics = diagnosticsOfFailure(error)
  const reported = expected.sites.some(
    (site) =>
      findDiagnostics(diagnostics, {
        file: site.file,
        position: { line: diagnosticPosition(site.source, site.at).line },
      }).length > 0,
  )
  expect(
    reported,
    `a diagnostic at ${expected.sites.map((site) => `${site.file} (${site.at})`).join(' or ')}:\n${diagnostics.map((diagnostic) => diagnostic.text).join('\n---\n')}`,
  ).toBe(true)
}
