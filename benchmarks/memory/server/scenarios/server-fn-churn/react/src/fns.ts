import { createMiddleware, createServerFn } from '@tanstack/react-start'

type ServerFnInput = {
  id: string
}

const recordIndexes = Array.from({ length: 5 }, (_, index) => index)

const contextMiddleware = createMiddleware({ type: 'function' }).server(
  ({ next }) =>
    next({
      context: {
        ctx: 'ctx-server-fn-churn',
      },
    }),
)

function validateInput(input: unknown): ServerFnInput {
  const payload = input as Partial<ServerFnInput> | null

  if (typeof payload?.id !== 'string') {
    throw new Error('invalid server-fn churn input')
  }

  return { id: payload.id }
}

function echoPayload(data: ServerFnInput, context: { ctx: string }) {
  return {
    id: data.id,
    ctx: context.ctx,
    payload: recordIndexes.map((index) => ({
      id: `${data.id}-${index}`,
      label: `record-${index}`,
    })),
  }
}

export const churnGet = createServerFn({ method: 'GET' })
  .middleware([contextMiddleware])
  .validator(validateInput)
  .handler(({ data, context }) => echoPayload(data, context))

export const churnPost = createServerFn({ method: 'POST' })
  .middleware([contextMiddleware])
  .validator(validateInput)
  .handler(({ data, context }) => echoPayload(data, context))
