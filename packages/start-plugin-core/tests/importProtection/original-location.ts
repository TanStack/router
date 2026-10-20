/**
 * The J6.5 location check in the `client|server file:line:column` form the
 * import-protection tests compare reports in, decided by the shared
 * location oracle (`isRelevantLocation`/`expectFrameAt` of
 * `@tanstack/compiler-test-utils/diagnostics`): the genuine surviving use,
 * or any line of the original import (`importLines`); no coordinates only
 * where the location is unavailable (`unavailable`, §5.14: an import a tool
 * rewrote), never as a blanket escape. The shared oracle also decides the
 * file's name (absolute or project-relative, SPEC §5.7) and that columns
 * are 1-based.
 */
import { expect } from 'vitest'
import {
  expectFrameAt,
  isRelevantLocation,
  parseLocation,
} from '@tanstack/compiler-test-utils/diagnostics'
import type { ViolationReport } from './violation-report'

/** `[environment, location]` of `client file:line:column`. */
function splitEnvironment(value: string) {
  const match = /^(?:(client|server) )?(.*)$/.exec(value)!
  return [match[1], match[2]!] as const
}

export function originalLocation(
  use: string,
  importLines: number | Array<number>,
  unavailable = false,
) {
  const [environment, location] = splitEnvironment(use)
  const at = parseLocation(location)
  if (at.line === undefined || at.column === undefined) {
    throw new Error(`Expected an original use location: ${use}`)
  }
  const imports = Array.isArray(importLines) ? importLines : [importLines]
  return {
    asymmetricMatch(value: unknown) {
      if (typeof value !== 'string') {
        return false
      }
      const [actualEnvironment, actual] = splitEnvironment(value)
      return (
        actualEnvironment === environment &&
        isRelevantLocation(actual, {
          file: at.file,
          // (the import lines are given: no specifier to look up)
          source: '',
          uses: [
            { line: at.line!, column: at.column },
            ...imports.map((line) => ({ line })),
          ],
          unlocated: unavailable,
        })
      )
    },
    toString: () => `original import (${imports.join(', ')}) or use ${use}`,
  }
}

/**
 * The report is at a relevant original location (`originalLocation`), and
 * its code frame shows the original source there (`expectFrameAt`: the
 * highlighted line and the caret; lines of context are free, §5.7) and
 * names the same line and column.
 */
export function expectOriginalFrame(
  report: ViolationReport,
  source: string,
  use: string,
  importLines: number | Array<number>,
) {
  expect(report.importer).toEqual(originalLocation(use, importLines))
  expect(report.code).toBeDefined()
  expect(report.code!.location).toEqual(originalLocation(use, importLines))
  const { line, column } = parseLocation(report.importer)
  expect(parseLocation(report.code!.location)).toMatchObject({ line, column })
  expectFrameAt(report.code, source, { line: line!, column })
}
