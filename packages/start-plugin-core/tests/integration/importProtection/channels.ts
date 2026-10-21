/**
 * Reading what a failure reported, on every channel (SPEC §5.7): a compiler
 * may fail a dev load or a build with the whole report, or print the report
 * to the console (or the bundler's diagnostics) and fail with a short error.
 * The reader (`violation-report.ts`) reads the results like any output.
 */
import { diagnosticsOf } from '@tanstack/compiler-test-utils/diagnostics'
import { rejection } from '../../importProtection/start-apps'
import type { Severity } from '@tanstack/compiler-test-utils/diagnostics'

interface Reported {
  text: string
  severity: Severity
}

/** A dev server's merged channel (Vite or Rsbuild harness). */
interface Reporting {
  root: string
  diagnostics: Array<Reported>
}

/**
 * Awaits `run` (a dev server's load, import or request), which must fail,
 * and gives its error and everything reported meanwhile: the error, and
 * what the server reported on any channel since `run` started, each
 * distinct text once (a report printed and also thrown counts once).
 */
export async function failureOf(
  server: Reporting,
  run: () => Promise<unknown>,
): Promise<{
  error: Error
  reported: { root: string; diagnostics: Array<Reported> }
}> {
  const mark = server.diagnostics.length
  const error = await rejection(run())
  const seen = new Set<string>()
  const diagnostics = [
    ...diagnosticsOf(error, 'error'),
    ...server.diagnostics.slice(mark),
  ].flatMap(({ text, severity }) => {
    if (seen.has(text)) {
      return []
    }
    seen.add(text)
    return [{ text, severity }]
  })
  return { error, reported: { root: server.root, diagnostics } }
}

/**
 * The text of the errors `output` reported (a failed build, `failureOf`'s
 * `reported`, an error), on every channel: what explains a failure, for
 * checks of prose it may carry anywhere (e.g. composition guidance). Not
 * the warnings that came with it (a bundler's own advice is no
 * explanation of the failure).
 */
export function failureText(output: unknown): string {
  const record = output as { diagnostics?: Array<Reported> }
  const diagnostics =
    typeof output === 'object' &&
    output !== null &&
    Array.isArray(record.diagnostics)
      ? record.diagnostics
      : diagnosticsOf(output, 'error')
  return diagnostics
    .filter(({ severity }) => severity === 'error')
    .map(({ text }) => text)
    .join('\n')
}
