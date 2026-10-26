import { describe, expect, it } from 'vitest'
import {
  identifierBase,
  isValidIdentifier,
  specifierLiteral,
  stringLiteral,
} from '../src/compiler'

/** The value a JavaScript string literal denotes. */
function evaluate(literal: string): string {
  return new Function(`return ${literal}`)() as string
}

describe('stringLiteral', () => {
  it('prints a plain value with the requested quote, unescaped', () => {
    expect(stringLiteral('./routes/a.tsx')).toBe("'./routes/a.tsx'")
    expect(stringLiteral('tsr-split', '"')).toBe('"tsr-split"')
  })

  it('escapes backslashes and every line terminator so glue stays on one line', () => {
    const value = 'C:\\app\\x\ny\rz\u2028w\u2029v'
    const literal = stringLiteral(value)
    expect(literal).toBe("'C:\\\\app\\\\x\\ny\\rz\\u2028w\\u2029v'")
    expect(literal).not.toMatch(/[\n\r\u2028\u2029]/)
    expect(evaluate(literal)).toBe(value)
  })

  it('escapes only the quote it prints with, round-tripping either way', () => {
    const value = `it's "quoted"`
    const single = stringLiteral(value, "'")
    const double = stringLiteral(value, '"')
    expect(single).toBe(`'it\\'s "quoted"'`)
    expect(double).toBe(`"it's \\"quoted\\""`)
    expect(evaluate(single)).toBe(value)
    expect(evaluate(double)).toBe(value)
  })
})

describe('specifierLiteral', () => {
  it('keeps the quote of the original literal, defaulting to single quotes', () => {
    expect(specifierLiteral('./a?tsr-split=x', '"./a"')).toBe(
      '"./a?tsr-split=x"',
    )
    expect(specifierLiteral('./a?tsr-split=x', "'./a'")).toBe(
      "'./a?tsr-split=x'",
    )
    expect(specifierLiteral('./a')).toBe("'./a'")
  })
})

describe('identifiers', () => {
  it('accepts binding identifiers and rejects reserved words, the empty name and bad starts', () => {
    for (const ok of ['x', '$', '_y1', 'über', 'ಠ_ಠ', 'awaitable']) {
      expect(isValidIdentifier(ok), ok).toBe(true)
    }
    for (const bad of ['', '1x', 'a-b', 'class', 'let', 'eval', 'arguments']) {
      expect(isValidIdentifier(bad), bad).toBe(false)
    }
  })

  it('derives an identifier base from a path or key', () => {
    expect(identifierBase('routes/a.$id.tsx')).toBe('routes_a_$id_tsx')
    expect(isValidIdentifier(identifierBase('routes/a.$id.tsx'))).toBe(true)
    expect(identifierBase('1-posts')).toBe('_1_posts')
    expect(identifierBase('')).toBe('_')
  })
})
