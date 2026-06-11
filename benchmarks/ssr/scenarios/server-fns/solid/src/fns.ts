import { createMiddleware, createServerFn } from '@tanstack/solid-start'

const mwA = createMiddleware({ type: 'function' }).server(({ next }) =>
  next({ context: { a: 1 } }),
)
const mwB = createMiddleware({ type: 'function' }).server(({ next }) =>
  next({ context: { b: 2 } }),
)

type Payload = { q: string; n: number; nested: { list: Array<string> } }

const validate = (input: unknown): Payload => {
  const p = input as Payload

  if (
    typeof p?.q !== 'string' ||
    typeof p?.n !== 'number' ||
    !Array.isArray(p?.nested?.list)
  ) {
    throw new Error('invalid payload')
  }

  return p
}

function echo(data: Payload, context: { a: number; b: number }) {
  return {
    echoed: data,
    sum: data.n + context.a + context.b,
    list: data.nested.list.map((s) => `out-${s}`),
  }
}

export const echoGet = createServerFn({ method: 'GET' })
  .middleware([mwA, mwB])
  .validator(validate)
  .handler(({ data, context }) => echo(data, context))

export const echoPost = createServerFn({ method: 'POST' })
  .middleware([mwA, mwB])
  .validator(validate)
  .handler(({ data, context }) => echo(data, context))
