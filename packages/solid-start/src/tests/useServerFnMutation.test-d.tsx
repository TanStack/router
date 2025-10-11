import { createServerFn, useServerFn } from '../index'

const serverFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { name: string }) => input)
  .handler(async ({ data }) => ({
    message: `Hello ${data.name}!`,
  }))

const optionalServerFn = createServerFn().handler(async () => ({
  ok: true as const,
}))

export function UseServerFnRegressionComponent() {
  const handler = useServerFn(serverFn)

  handler({ data: { name: 'TanStack' } }).then((result) => {
    result.message
  })

  void handler
  return null
}

export function useOptionalServerFnRegressionHook() {
  const handler = useServerFn(optionalServerFn)

  handler().then((result) => {
    result.ok
  })

  void handler()
  void handler(undefined)
}
