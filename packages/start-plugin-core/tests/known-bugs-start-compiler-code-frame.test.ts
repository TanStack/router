/**
 * Known bug of the Start compiler's diagnostics (SPEC G5: a compile error
 * points at the user's code, line and column): the code frame of a compile
 * error draws its caret one column left of the offending code.
 *
 * Finding F1 of validation/REPAIR/A2.md (DECISIONS 2026-10-21): the
 * compiler hands an AST location's 0-based column to a code-frame API that
 * counts columns from 1, so the `^` lands on the character before the call
 * (a call at the very start of a line is drawn right: the API reads
 * column 0 as "no column").
 *
 * The pin is fix-agnostic: the frame's layout, context length and whether
 * a frame is drawn at all are free (§5.7); only a caret the error draws
 * under the offending line must point at the offending code.
 */
import { stripVTControlCharacters } from 'node:util'
import { describe, expect, test } from 'vitest'
import { diagnosticPosition } from '@tanstack/compiler-test-utils/diagnostics'
import { compileError, useStartHost } from './regression-helpers'

const host = useStartHost()

/**
 * The 1-based source columns the carets of a code frame in `text` point at
 * under line `line` of `source`: for each frame line quoting that source
 * line (`> <line> | <code>`), the first `^` of the marker line below it,
 * measured from where the quoted code starts.
 */
function caretColumns(text: string, source: string, line: number) {
  const sourceLine = source.split(/\r\n|[\n\r\u2028\u2029]/)[line - 1]!
  const lines = stripVTControlCharacters(text).split(/\r?\n/)
  const columns: Array<number> = []
  for (let index = 0; index < lines.length - 1; index++) {
    const frameLine = /^\s*>?\s*(\d+)\s*\|/.exec(lines[index]!)
    if (!frameLine || Number(frameLine[1]) !== line) {
      continue
    }
    const marker = lines[index + 1]!
    if (!/^\s*>?\s*\|\s*\^/.test(marker)) {
      continue
    }
    const gutter = lines[index]!.indexOf('|')
    const start = lines[index]!.indexOf(sourceLine, gutter + 1)
    if (start < 0) {
      continue
    }
    columns.push(marker.indexOf('^') - start + 1)
  }
  return columns
}

describe('the code frame of a compile error points at the offending code', () => {
  // Bug: the caret is drawn one column left of the call (F1).
  // Impact: the frame highlights the character before the call.
  // Source: validation/REPAIR/A2.md F1.
  test.fails.each([
    {
      name: 'a call after a declaration',
      source: `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler()`,
    },
    {
      name: 'an indented call on a line of its own',
      source: `import { createServerFn } from '@tanstack/react-start'
export const fn =
    createServerFn().handler()`,
    },
  ])('$name', async ({ source }) => {
    const startCase = await (await host()).case({ 'module.tsx': source })
    const failure = await compileError(startCase)
    expect(failure, 'a compile error').toBeInstanceOf(Error)
    const at = diagnosticPosition(source, 'createServerFn()')
    // Every frame the failure shows, on any channel
    const text = [
      (failure!.error as Error).message,
      (failure!.error as { frame?: string }).frame ?? '',
      ...failure!.reported.map((diagnostic) => diagnostic.text),
    ].join('\n')
    const carets = caretColumns(text, source, at.line)
    expect(carets, 'columns the carets point at').toEqual(
      carets.map(() => at.column),
    )
  })
})
