/**
 * Local J6.5 oracle pending W4-shared consolidation: accept the selected
 * surviving use or an explicitly identified original import span. Columns
 * are required unless an upstream rewrite makes the position unavailable
 * (§5.14); never grant that exception to every source-derived report.
 */
import { expect } from 'vitest'
import { mentionsFile } from '@tanstack/compiler-test-utils/diagnostics'
import type { ViolationReport } from './violation-report'

export function originalLocation(
  use: string,
  importLines: number | Array<number>,
  unavailable = false,
) {
  const parse = (value: string) =>
    /^(?:(client|server) )?(.*?)(?::(\d+):(\d+))?$/.exec(value)
  const [, environment, file, line, column] = parse(use) ?? []
  if (!file || !line || !column) {
    throw new Error(`Expected an original use location: ${use}`)
  }
  const imports = Array.isArray(importLines) ? importLines : [importLines]
  return {
    asymmetricMatch(value: unknown) {
      if (typeof value !== 'string') {
        return false
      }
      const actual = parse(value)
      return (
        !!actual &&
        actual[1] === environment &&
        mentionsFile(actual[2]!, file) &&
        // Preserve enough path to open the authored file from the app root.
        actual[2]!.replaceAll('\\', '/').includes(file.replaceAll('\\', '/')) &&
        ((unavailable && actual[3] === undefined) ||
          (Number(actual[4]) > 0 &&
            ((actual[3] === line && actual[4] === column) ||
              imports.includes(Number(actual[3])))))
      )
    },
    toString: () => `original import (${imports.join(', ')}) or use ${use}`,
  }
}

/** The selected frame line and caret refer to that same original source. */
export function expectOriginalFrame(
  report: ViolationReport,
  source: string,
  use: string,
  importLines: number | Array<number>,
) {
  expect(report.importer).toEqual(originalLocation(use, importLines))
  expect(report.code).toBeDefined()
  expect(report.code!.location).toEqual(originalLocation(use, importLines))
  const [, line, column] = /:(\d+):(\d+)$/.exec(report.code!.location)!
  expect(report.code!.location.match(/:\d+:\d+$/)?.[0]).toBe(
    report.importer.match(/:\d+:\d+$/)?.[0],
  )
  const original = source.split(/\r\n|[\r\n]/)[Number(line) - 1]!
  expect(Number(column)).toBeLessThanOrEqual(original.length + 1)
  expect(report.code).toEqual({
    line: Number(line),
    pointsAt: original.slice(Number(column) - 1),
    shows: expect.arrayContaining([original]),
    location: report.code!.location,
  })
}
