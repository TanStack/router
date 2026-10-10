import { expect, test } from 'vitest'
import { analyzeModule } from '../src'

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
