import { expect, test } from 'vitest'
import { analyzeModule, lineStarts, sourceLines, sourcePosition } from '../src'

test.each(['\n', '\r\n', '\r', '\u2028', '\u2029'])(
  'counts %j as one line terminator in positions and lines',
  (newline) => {
    const code = `a${newline}😀b${newline}${newline}c`
    expect(sourceLines(code)).toEqual(['a', '😀b', '', 'c'])
    expect(sourcePosition(code, code.indexOf('b'))).toEqual({
      line: 2,
      column: 2,
    })
    const starts = lineStarts(code)
    expect(starts).toHaveLength(4)
    expect(sourcePosition(code, code.indexOf('c'), starts)).toEqual({
      line: 4,
      column: 0,
    })
    expect(sourcePosition(code, code.length, starts)).toEqual({
      line: 4,
      column: 1,
    })
  },
)

test.each(['\n', '\r\n', '\r', '\u2028', '\u2029'])(
  'reports actionable syntax locations with %j line endings and Unicode source',
  (newline) => {
    const code = `// 😀é${newline}/* 😀é */ export const broken = ;`

    expect(() =>
      analyzeModule({ code, filename: '/routes/index.tsx' }),
    ).toThrow(
      expect.objectContaining({
        name: 'SyntaxError',
        message: "/routes/index.tsx: Unexpected token ';' (2:32)",
        loc: { line: 2, column: 32 },
        pos: code.indexOf(';'),
      }),
    )
  },
)

test('reports the first line and a zero-based column for syntax errors', () => {
  expect(() => analyzeModule({ code: 'const broken = ;' })).toThrow(
    expect.objectContaining({
      name: 'SyntaxError',
      message: "input.tsx: Unexpected token ';' (1:15)",
      loc: { line: 1, column: 15 },
      pos: 15,
    }),
  )
})
