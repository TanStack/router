/**
 * Judges a failed build's diagnostic by its content (SPEC G5, §5.7): it
 * names the API at one of the user's sources, on a line of the call. Pure:
 * only the shared diagnostics reader, no module of the implementation (the
 * fast tier's `expectSourceError` of `../regression-helpers` loads the
 * compiler; this one reads what a real build reported).
 *
 * Every channel is read: pass the `StartBuildError` of `buildStart` (its
 * `diagnostics` hold the bundler's errors and what the build printed, so a
 * compiler that prints the details and fails with a short error is read
 * whole), or any value `diagnosticsOf` reads.
 */
import { expect } from 'vitest'
import {
  diagnosticPosition,
  diagnosticProse,
  diagnosticsOf,
  mismatches,
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
 * Fails unless one diagnostic of `error` reports, at one of `sites` (its
 * file, and the line of `at` in its `source`), the `names` (each name, or
 * one of each list), outside the source it quotes.
 */
export function expectSourceError(
  error: unknown,
  expected: {
    names: Array<string | Array<string>>
    sites: Array<{ file: string; source: string; at: string }>
  },
) {
  const sources = expected.sites.map((site) => site.source).join('\n')
  const diagnostics = diagnosticsOfFailure(error)
  const reported = expected.sites.some((site) =>
    diagnostics.some(
      (diagnostic) =>
        mismatches(diagnostic, {
          file: site.file,
          position: { line: diagnosticPosition(site.source, site.at).line },
          source: site.source,
        }).length === 0 &&
        mismatches(
          { ...diagnostic, text: diagnosticProse(diagnostic.text, sources) },
          { names: expected.names },
        ).length === 0,
    ),
  )
  expect(
    reported,
    `a diagnostic naming ${expected.names.join(', ')} at ${expected.sites.map((site) => `${site.file} (${site.at})`).join(' or ')}:\n${diagnostics.map((diagnostic) => diagnostic.text).join('\n---\n')}`,
  ).toBe(true)
}
