import { describe, expect, it } from 'vitest'
import { execValidator } from '../src/createServerFn'
import type { AnyValidator } from '@tanstack/router-core'

/**
 * A Standard Schema validator whose issues carry a bigint. `JSON.stringify`
 * throws on one, so these cover the server-function side going back to
 * serializing the issues raw: the failure would surface as a complaint about
 * serializing a BigInt rather than the validation message.
 */
function failingValidator(issues: Array<Record<string, unknown>>) {
  return {
    '~standard': {
      validate: () => ({ issues }),
    },
  } as unknown as AnyValidator
}

describe('execValidator with a Standard Schema validator', () => {
  it('reports the issue rather than failing to serialize it', async () => {
    const validator = failingValidator([
      { message: 'Expected number', path: ['field'], received: 1n },
    ])

    const error = await execValidator(validator, {}).then(
      () => undefined,
      (err: unknown) => err as Error,
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toBe('field: Expected number')
    expect(error?.message).not.toMatch(/BigInt|serialize/i)
  })

  it('reports every issue with its path', async () => {
    const validator = failingValidator([
      { message: 'Required', path: ['name'] },
      { message: 'Too long', path: ['tags', 0] },
      { message: 'Invalid input' },
    ])

    const error = await execValidator(validator, {}).then(
      () => undefined,
      (err: unknown) => err as Error,
    )

    expect(error?.message).toBe(
      'name: Required\ntags[0]: Too long\nInvalid input',
    )
  })

  it('passes the parsed value through when validation succeeds', async () => {
    const validator = {
      '~standard': {
        validate: () => ({ value: { ok: true } }),
      },
    } as unknown as AnyValidator

    await expect(execValidator(validator, {})).resolves.toEqual({ ok: true })
  })
})
