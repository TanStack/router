import { describe, expect, it } from 'vitest'
import { readServerFnBuildInfo } from '../../src/rsbuild/start-compiler-host'
import { SERVER_FN_BUILD_INFO_FIELD } from '../../src/rsbuild/start-compiler-metadata'

const serverFn = {
  functionName: 'getGreeting',
  functionId: 'greeting-id',
  extractedFilename: '/src/greeting.ts?tsr-split',
  filename: '/src/greeting.ts',
}

describe('readServerFnBuildInfo', () => {
  it('ignores modules without Start metadata', () => {
    expect(readServerFnBuildInfo({ buildInfo: {} })).toBeNull()
    expect(readServerFnBuildInfo({ buildInfo: { unrelated: true } })).toBeNull()
  })

  it.each([
    undefined,
    null,
    false,
    '',
    {},
    { version: 2, serverFnsById: {} },
    { version: 1, serverFnsById: { 'greeting-id': {} } },
    {
      version: 1,
      serverFnsById: {
        'greeting-id': { ...serverFn, isClientReferenced: 'true' },
      },
    },
    {
      version: 1,
      serverFnsById: {
        'greeting-id': serverFn,
        'invalid-id': { ...serverFn, filename: null },
      },
    },
  ])('ignores invalid cached metadata: %j', (metadata) => {
    expect(
      readServerFnBuildInfo({
        buildInfo: { [SERVER_FN_BUILD_INFO_FIELD]: metadata },
      }),
    ).toBeNull()
  })

  it('accepts the empty payload used to clear stale server functions', () => {
    expect(
      readServerFnBuildInfo({
        buildInfo: {
          [SERVER_FN_BUILD_INFO_FIELD]: { version: 1, serverFnsById: {} },
        },
      }),
    ).toEqual({})
  })

  it.each([undefined, false, true])(
    'restores isolated metadata with isClientReferenced=%s',
    (isClientReferenced) => {
      const metadata = {
        version: 1,
        serverFnsById: {
          'greeting-id': {
            ...serverFn,
            isClientReferenced,
            extra: 'discarded',
          },
        },
        extra: 'discarded',
      }
      const original = structuredClone(metadata)
      const result = readServerFnBuildInfo({
        buildInfo: { [SERVER_FN_BUILD_INFO_FIELD]: metadata },
      })

      expect(result).toEqual({
        'greeting-id': { ...serverFn, isClientReferenced },
      })
      expect(result).not.toBe(metadata.serverFnsById)
      expect(result?.['greeting-id']).not.toBe(
        metadata.serverFnsById['greeting-id'],
      )
      expect(metadata).toEqual(original)
    },
  )

  it('restores multiple entries as separate objects without unknown fields', () => {
    const input = { ...serverFn, extra: 'discarded' }
    const metadata = {
      version: 1,
      serverFnsById: { first: input, second: input },
    }
    const original = structuredClone(metadata)
    const result = readServerFnBuildInfo({
      buildInfo: { [SERVER_FN_BUILD_INFO_FIELD]: metadata },
    })

    expect(result).toEqual({ first: serverFn, second: serverFn })
    expect(result).not.toBe(metadata.serverFnsById)
    expect(result?.first).not.toBe(input)
    expect(result?.second).not.toBe(input)
    expect(result?.first).not.toBe(result?.second)
    expect(metadata).toEqual(original)
  })
})
