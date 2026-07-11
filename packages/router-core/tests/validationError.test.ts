import { describe, expect, test } from 'vitest'
import { formatValidationError } from '../src/validationError'
import type { AnyStandardSchemaValidateIssue } from '../src/validators'

describe('formatValidationError', () => {
  test('falls back when there are no issues', () => {
    expect(formatValidationError([])).toBe('Validation failed')
    expect(formatValidationError(undefined)).toBe('Validation failed')
  })

  test('renders a root issue without a path', () => {
    const issues: Array<AnyStandardSchemaValidateIssue> = [
      { message: 'Required' },
    ]
    expect(formatValidationError(issues)).toBe('(root): Required')
  })

  test('renders a nested string path', () => {
    const issues: Array<AnyStandardSchemaValidateIssue> = [
      { message: 'Expected string', path: ['user', 'name'] },
    ]
    expect(formatValidationError(issues)).toBe(
      '["user"]["name"]: Expected string',
    )
  })

  test('renders numeric (array index) path segments', () => {
    const issues: Array<AnyStandardSchemaValidateIssue> = [
      { message: 'Expected number', path: ['scores', 0] },
    ]
    expect(formatValidationError(issues)).toBe('["scores"][0]: Expected number')
  })

  test('reads path segments given as { key } objects', () => {
    const issues: Array<AnyStandardSchemaValidateIssue> = [
      { message: 'Invalid', path: [{ key: 'a' }, { key: 1 }] },
    ]
    expect(formatValidationError(issues)).toBe('["a"][1]: Invalid')
  })

  test('does not confuse a literal dotted key with a nested path', () => {
    const flat: Array<AnyStandardSchemaValidateIssue> = [
      { message: 'x', path: ['a.b'] },
    ]
    const nested: Array<AnyStandardSchemaValidateIssue> = [
      { message: 'x', path: ['a', 'b'] },
    ]
    expect(formatValidationError(flat)).not.toBe(formatValidationError(nested))
    expect(formatValidationError(flat)).toBe('["a.b"]: x')
  })

  test('renders a prototype-named key as text without indexing into objects', () => {
    const issues: Array<AnyStandardSchemaValidateIssue> = [
      { message: 'nope', path: ['__proto__', 'polluted'] },
    ]
    expect(formatValidationError(issues)).toBe(
      '["__proto__"]["polluted"]: nope',
    )
  })

  test('renders symbol path segments instead of throwing', () => {
    const sym = Symbol('id')
    const issues: Array<AnyStandardSchemaValidateIssue> = [
      { message: 'bad symbol key', path: [sym] },
    ]
    expect(formatValidationError(issues)).toBe(
      `[${sym.toString()}]: bad symbol key`,
    )
  })

  test('joins multiple issues on separate lines', () => {
    const issues: Array<AnyStandardSchemaValidateIssue> = [
      { message: 'Required', path: ['a'] },
      { message: 'Too short', path: ['b', 2] },
    ]
    expect(formatValidationError(issues)).toBe(
      '["a"]: Required\n["b"][2]: Too short',
    )
  })

  test('does not throw on a circular issue object', () => {
    const circular: any = { message: 'circular' }
    circular.self = circular
    expect(() => formatValidationError([circular])).not.toThrow()
    expect(formatValidationError([circular])).toBe('(root): circular')
  })
})
