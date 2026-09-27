import { describe, expect, test } from 'vitest'
import { SERVER_FN_NOT_FOUND } from '@tanstack/start-server-core/constants'
import { getDevServerFnValidatorModule } from '../src/vite/start-compiler-plugin/dev-server-fn-validator-module'

const VALIDATE_ID = 'virtual:tanstack-start-validate-server-fn-id'

// In dev the id is checked by the `validateServerFnIdVirtualModule` loader, which
// calls `this.error('Invalid server function ID: …')` for an unknown id. That
// error surfaces from the dev `getServerFnById` unflagged, so the request handler
// answered 500 while production answered 404 for the same stale id. The generated
// dev module must flag that specific error so dev and production both answer 404.
describe('getDevServerFnValidatorModule', () => {
  test('flags an unknown-id validation error so the handler answers 404', () => {
    const source = getDevServerFnValidatorModule(VALIDATE_ID)

    expect(source).toContain('Invalid server function ID')
    expect(source).toContain(`error["${SERVER_FN_NOT_FOUND}"] = true`)
  })

  test('flags the error at runtime only when it is an unknown-id error', async () => {
    const source = getDevServerFnValidatorModule(VALIDATE_ID)
    // Run the emitted body against a stubbed validation import so we observe the
    // real flagging logic, not just its text. The stub stands in for the Vite
    // virtual module the browserless test can't load.
    const runnable = source
      .replace('export async function', 'async function')
      .replace(
        "await import(/* @vite-ignore */ '/@id/__x00__' + validateIdImport)",
        'await __validate(id)',
      )
    const factory = new Function(
      '__validate',
      `${runnable}\nreturn getServerFnById`,
    )

    const unknownIdValidate = () => {
      throw new Error('Invalid server function ID: some-stale-id')
    }
    const getServerFnById = factory(unknownIdValidate)
    const flagged = await getServerFnById('c29tZQ', { origin: 'client' }).then(
      () => undefined,
      (error: unknown) => error,
    )
    expect((flagged as Record<string, unknown>)[SERVER_FN_NOT_FOUND]).toBe(true)

    // A genuine internal failure (not the unknown-id error) stays a 500.
    const internalValidate = () => {
      throw new Error('unknown environment mode ssr')
    }
    const getServerFnById2 = factory(internalValidate)
    const unflagged = await getServerFnById2('c29tZQ', {
      origin: 'client',
    }).then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(
      (unflagged as Record<string, unknown>)[SERVER_FN_NOT_FOUND],
    ).toBeUndefined()
  })
})
