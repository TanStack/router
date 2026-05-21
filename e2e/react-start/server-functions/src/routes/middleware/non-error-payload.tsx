import { createFileRoute } from '@tanstack/react-router'
import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { useState } from 'react'

const structuredErrorMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    try {
      return await next()
    } catch {
      // Throw a plain object — not an Error instance — as a structured payload.
      // The client should receive this object as the resolved value, not undefined.
      throw { code: 'HANDLED', message: 'Middleware returned structured payload' }
    }
  },
)

const $serverFnThatThrows = createServerFn({ method: 'GET' })
  .middleware([structuredErrorMiddleware])
  .handler(() => {
    throw new Error('Trigger middleware catch')
  })

export const Route = createFileRoute('/middleware/non-error-payload')({
  component: RouteComponent,
})

function RouteComponent() {
  const [result, setResult] = useState<unknown>(undefined)
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    setLoading(true)
    const value = await $serverFnThatThrows()
    setResult(value)
    setLoading(false)
  }

  return (
    <div className="p-4">
      <h1 data-testid="non-error-payload-title">
        Non-Error Middleware Payload Test
      </h1>
      <button
        data-testid="trigger-non-error-btn"
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? 'Loading' : 'Call Server Function'}
      </button>
      {result !== undefined && (
        <div data-testid="payload-result">{JSON.stringify(result)}</div>
      )}
    </div>
  )
}
