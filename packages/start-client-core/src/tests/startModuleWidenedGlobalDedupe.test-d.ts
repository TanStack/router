import { test } from 'vitest'
import { createMiddleware } from '../createMiddleware'
import { createServerFn } from '../createServerFn'
import { createStart } from '../createStart'
import type { CreateMiddlewareFn } from '../createMiddleware'
import type { CreateServerFn } from '../createServerFn'
import type { StartModuleRegister } from '../createStartModule'

declare module '../createStartModule' {
  interface StartModuleRequirements {
    '@review/widened-global-reader': { requestContext: { value: string } }
  }
}
const createReaderMiddleware =
  createMiddleware as unknown as CreateMiddlewareFn<
    StartModuleRegister<'@review/widened-global-reader'>
  >
const overwrite = createMiddleware({ type: 'function' }).server(({ next }) =>
  next({ context: { value: 1 } }),
)
const restore = createMiddleware({ type: 'function' }).server(({ next }) =>
  next({ context: { value: 'restored' } }),
)
const reader = createReaderMiddleware({ type: 'function' }).server(
  ({ context, next }) => {
    context.value.toUpperCase()
    return next()
  },
)

test('unknown global membership cannot prove a local restoration executes', () => {
  const globals = [restore]
  const start = createStart(() => ({ functionMiddleware: globals }))
  type Register = { config: Awaited<ReturnType<typeof start.getOptions>> }
  const createHostServerFn =
    createServerFn as unknown as CreateServerFn<Register>
  createHostServerFn()
    .middleware([overwrite, restore, reader])
    .handler(
      // @ts-expect-error restore may already execute globally and skip after local overwrite
      () => 'result',
    )
})
