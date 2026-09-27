import { describe, expect, test, vi } from 'vitest'
import { validateServerFnId } from '../src/vite/start-compiler-plugin/validate-server-fn-id-module'
import type { ValidateServerFnIdContext } from '../src/vite/start-compiler-plugin/validate-server-fn-id-module'

const encodeFnId = (file: string, exportName: string) =>
  Buffer.from(JSON.stringify({ file, export: exportName }), 'utf8').toString(
    'base64url',
  )

function makeCtx(
  overrides: Partial<ValidateServerFnIdContext> = {},
): ValidateServerFnIdContext {
  return {
    serverFnsById: {},
    root: '/project',
    environment: {
      mode: 'dev',
      transformRequest: vi.fn().mockResolvedValue(undefined),
    },
    error: (message: string) => {
      throw new Error(message)
    },
    ...overrides,
  }
}

describe('validateServerFnId', () => {
  test('returns an empty module for an already-registered id', async () => {
    const fnId = encodeFnId('/src/fn.ts', 'myFn')
    const ctx = makeCtx({ serverFnsById: { [fnId]: {} as never } })

    await expect(validateServerFnId(fnId, ctx)).resolves.toBe('export {}')
    expect(ctx.environment.transformRequest).not.toHaveBeenCalled()
  })

  test('re-checks after a transform registers the id', async () => {
    const fnId = encodeFnId('/src/fn.ts', 'myFn')
    const serverFnsById: Record<string, never> = {}
    const ctx = makeCtx({
      serverFnsById,
      environment: {
        mode: 'dev',
        transformRequest: vi.fn().mockImplementation(() => {
          // The transform compiles the source and registers the id as a side effect.
          serverFnsById[fnId] = {} as never
          return Promise.resolve()
        }),
      },
    })

    await expect(validateServerFnId(fnId, ctx)).resolves.toBe('export {}')
    expect(ctx.environment.transformRequest).toHaveBeenCalledTimes(1)
  })

  test('reports a genuinely absent id as an unknown server function (404)', async () => {
    // Transform succeeds but never registers the id: the id really does not exist.
    const fnId = encodeFnId('/src/fn.ts', 'missingExport')
    const ctx = makeCtx()

    await expect(validateServerFnId(fnId, ctx)).rejects.toThrow(
      'Invalid server function ID',
    )
    expect(ctx.environment.transformRequest).toHaveBeenCalledTimes(1)
  })

  test('reports a missing id as an unknown server function (404)', async () => {
    const ctx = makeCtx()

    await expect(validateServerFnId(undefined, ctx)).rejects.toThrow(
      'Invalid server function ID',
    )
    expect(ctx.environment.transformRequest).not.toHaveBeenCalled()
  })

  test('reports a malformed id as an unknown server function (404)', async () => {
    const ctx = makeCtx()

    await expect(
      validateServerFnId('not-valid-base64-json', ctx),
    ).rejects.toThrow('Invalid server function ID')
  })

  test('propagates a source-transform failure instead of masking it as a 404', async () => {
    // A broken source file makes transformRequest reject. That is a real build
    // error and must surface as-is, NOT be converted into "Invalid server
    // function ID" (which the dev wrapper flags SERVER_FN_NOT_FOUND -> 404).
    const fnId = encodeFnId('/src/fn.ts', 'myFn')
    const transformError = new Error('Transform failed: Unexpected token (2:0)')
    const ctx = makeCtx({
      environment: {
        mode: 'dev',
        transformRequest: vi.fn().mockRejectedValue(transformError),
      },
    })

    const thrown = await validateServerFnId(fnId, ctx).then(
      () => undefined,
      (error: unknown) => error,
    )

    expect(thrown).toBe(transformError)
    expect((thrown as Error).message).not.toContain('Invalid server function ID')
  })

  test('errors when the environment is not in dev mode', async () => {
    const fnId = encodeFnId('/src/fn.ts', 'myFn')
    const ctx = makeCtx({
      environment: {
        mode: 'build',
        transformRequest: vi.fn().mockResolvedValue(undefined),
      },
    })

    await expect(validateServerFnId(fnId, ctx)).rejects.toThrow(
      'unknown environment mode build',
    )
    expect(ctx.environment.transformRequest).not.toHaveBeenCalled()
  })
})
