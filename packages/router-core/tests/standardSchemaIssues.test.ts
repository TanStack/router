import { describe, expect, it } from 'vitest'
import { formatStandardSchemaIssues } from '../src/standardSchemaIssues'

describe('formatStandardSchemaIssues', () => {
  it('reports a root issue as the bare message', () => {
    expect(formatStandardSchemaIssues([{ message: 'Required' }])).toBe(
      'Required',
    )
  })

  it('falls back when there are no issues', () => {
    expect(formatStandardSchemaIssues([])).toBe('Validation failed')
    expect(formatStandardSchemaIssues(undefined)).toBe('Validation failed')
  })

  it('prefixes a nested path', () => {
    expect(
      formatStandardSchemaIssues([
        { message: 'Expected string', path: ['user', 'name'] },
      ]),
    ).toBe('user.name: Expected string')
  })

  it('accepts the object form of a path segment', () => {
    expect(
      formatStandardSchemaIssues([
        { message: 'Expected string', path: [{ key: 'user' }, { key: 'name' }] },
      ]),
    ).toBe('user.name: Expected string')
  })

  it('renders a numeric key as an index', () => {
    expect(
      formatStandardSchemaIssues([{ message: 'Too small', path: ['items', 0] }]),
    ).toBe('items[0]: Too small')
  })

  it('keeps a numeric string distinct from a numeric index', () => {
    const numeric = formatStandardSchemaIssues([{ message: 'x', path: [0] }])
    const stringy = formatStandardSchemaIssues([{ message: 'x', path: ['0'] }])
    expect(numeric).toBe('[0]: x')
    expect(stringy).toBe('["0"]: x')
    expect(numeric).not.toBe(stringy)
  })

  it('does not let a dotted key collide with two keys', () => {
    const twoKeys = formatStandardSchemaIssues([
      { message: 'x', path: ['a', 'b'] },
    ])
    const dottedKey = formatStandardSchemaIssues([
      { message: 'x', path: ['a.b'] },
    ])
    expect(twoKeys).toBe('a.b: x')
    expect(dottedKey).toBe('["a.b"]: x')
    expect(twoKeys).not.toBe(dottedKey)
  })

  it('quotes keys that are not plain identifiers', () => {
    expect(
      formatStandardSchemaIssues([
        { message: 'x', path: ['with space', 'quote"key', ''] },
      ]),
    ).toBe('["with space"]["quote\\"key"][""]: x')
  })

  it('handles prototype-named keys without touching the prototype', () => {
    expect(
      formatStandardSchemaIssues([
        { message: 'x', path: ['__proto__', 'constructor'] },
      ]),
    ).toBe('__proto__.constructor: x')
  })

  it('renders a symbol key', () => {
    const key = Symbol('secret')
    expect(
      formatStandardSchemaIssues([{ message: 'x', path: [key] }]),
    ).toBe('["Symbol(secret)"]: x')
  })

  it('joins several issues one per line', () => {
    expect(
      formatStandardSchemaIssues([
        { message: 'Required', path: ['a'] },
        { message: 'Too long', path: ['b', 1] },
      ]),
    ).toBe('a: Required\nb[1]: Too long')
  })

  it('survives an issue that cannot be serialized', () => {
    const circular: any = { message: 'Bad input', path: ['a'] }
    circular.self = circular
    expect(() => JSON.stringify(circular)).toThrow()
    expect(formatStandardSchemaIssues([circular])).toBe('a: Bad input')
  })

  it('survives a bigint in the issue, which JSON.stringify refuses', () => {
    const issue: any = { message: 'Bad input', received: 1n }
    expect(() => JSON.stringify(issue)).toThrow()
    expect(formatStandardSchemaIssues([issue])).toBe('Bad input')
  })

  it('survives getters that throw', () => {
    const issue: any = {
      get message() {
        throw new Error('nope')
      },
      get path() {
        throw new Error('nope')
      },
    }
    expect(formatStandardSchemaIssues([issue])).toBe('Invalid value')
  })

  it('coerces a non-string message', () => {
    expect(formatStandardSchemaIssues([{ message: 42 } as any])).toBe('42')
  })

  it('skips path segments that carry no usable key', () => {
    expect(
      formatStandardSchemaIssues([
        { message: 'x', path: ['a', null, undefined, {}, 'b'] as any },
      ]),
    ).toBe('a.b: x')
  })
})
