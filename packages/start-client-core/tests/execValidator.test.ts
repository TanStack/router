import { describe, expect, test } from 'vitest'
import { execValidator } from '../src/createServerFn'

type Issue = {
  message: string
  path?: ReadonlyArray<PropertyKey | { key: PropertyKey }>
}

// Standard Schema validators that fail with the issue shapes different
// libraries produce: a plain key path (zod, arktype style) and a path of
// `{ key }` segments (valibot style).
function failingValidator(issues: ReadonlyArray<Issue>) {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: () => ({ issues }),
    },
  }
}

async function captureError(validator: unknown) {
  try {
    await execValidator(validator as any, {})
  } catch (error) {
    return error as Error
  }
  throw new Error('expected execValidator to throw')
}

describe('execValidator with Standard Schema issues', () => {
  test('reports nested paths from plain key paths', async () => {
    const error = await captureError(
      failingValidator([
        { message: 'Required', path: ['user', 'name'] },
        { message: 'Too small', path: ['user', 'tags', 2] },
      ]),
    )

    expect(error.message).toBe(
      '["user"]["name"]: Required\n["user"]["tags"][2]: Too small',
    )
  })

  test('reports nested paths from { key } segments', async () => {
    const error = await captureError(
      failingValidator([
        { message: 'Invalid email', path: [{ key: 'user' }, { key: 'email' }] },
      ]),
    )

    expect(error.message).toBe('["user"]["email"]: Invalid email')
  })

  test('keeps the message when the path holds a symbol key', async () => {
    const sym = Symbol('token')
    const error = await captureError(
      failingValidator([{ message: 'bad symbol key', path: [sym] }]),
    )

    expect(error.message).toBe(`[${sym.toString()}]: bad symbol key`)
  })

  test('does not mask the validation failure on a circular issue', async () => {
    const circular: any = { message: 'circular issue', path: ['a'] }
    circular.self = circular
    const error = await captureError(failingValidator([circular]))

    expect(error.message).toBe('["a"]: circular issue')
  })
})
