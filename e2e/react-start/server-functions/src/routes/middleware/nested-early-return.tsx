import { createFileRoute } from '@tanstack/react-router'
import { createMiddleware, createServerFn } from '@tanstack/react-start'
import React from 'react'

/**
 * Tests deeply nested middleware chains where inner middleware does early return.
 *
 * Structure:
 * - outerMiddleware
 *   - uses middleMiddleware
 *     - uses innerMiddleware (which may return early)
 *
 * Scenarios:
 * 1. innerMiddleware returns early -> outerMiddleware never gets to call next()
 * 2. innerMiddleware calls next() -> chain continues normally
 */

type EarlyReturnInput = {
  earlyReturnLevel: 'none' | 'deep' | 'middle' | 'outer'
  value: string
}

// Deepest level - conditionally returns early based on input
const deepMiddleware = createMiddleware({ type: 'function' })
  .inputValidator((input: EarlyReturnInput) => input)
  .server(
    // @ts-expect-error - types don't support early return
    async ({ data, next }) => {
      if (data.earlyReturnLevel === 'deep') {
        return {
          returnedFrom: 'deepMiddleware',
          message: 'Early return from deepest middleware',
          level: 3,
        }
      }
      return next({
        context: {
          deepMiddlewarePassed: true,
        },
      })
    },
  )

// Middle level - wraps deep middleware, may also return early
const middleMiddleware = createMiddleware({ type: 'function' })
  .middleware([deepMiddleware])
  .server(
    // @ts-expect-error - types don't support early return or receiving non-next result from inner middleware
    async ({ data, next, context }) => {
      if (data.earlyReturnLevel === 'middle') {
        return {
          returnedFrom: 'middleMiddleware',
          message: 'Early return from middle middleware',
          level: 2,
          deepContext: context,
        }
      }
      return next({
        context: {
          middleMiddlewarePassed: true,
        },
      })
    },
  )

// Outer level - wraps middle middleware, may also return early
const outerMiddleware = createMiddleware({ type: 'function' })
  .middleware([middleMiddleware])
  .server(
    // @ts-expect-error - types don't support early return or receiving non-next result from inner middleware
    async ({ data, next, context }) => {
      if (data.earlyReturnLevel === 'outer') {
        return {
          returnedFrom: 'outerMiddleware',
          message: 'Early return from outer middleware',
          level: 1,
          middleContext: context,
        }
      }
      return next({
        context: {
          outerMiddlewarePassed: true,
        },
      })
    },
  )

const serverFn = createServerFn()
  .middleware([outerMiddleware])
  .handler(({ data, context }) => {
    return {
      returnedFrom: 'handler',
      message: 'Handler was called - all middleware passed through',
      level: 0,
      finalContext: context,
      receivedData: data,
    }
  })

export const Route = createFileRoute('/middleware/nested-early-return')({
  loader: async () => {
    // Test all branches
    const deepReturn = await serverFn({
      data: { earlyReturnLevel: 'deep', value: 'test-deep' },
    })
    const middleReturn = await serverFn({
      data: { earlyReturnLevel: 'middle', value: 'test-middle' },
    })
    const outerReturn = await serverFn({
      data: { earlyReturnLevel: 'outer', value: 'test-outer' },
    })
    const handlerReturn = await serverFn({
      data: { earlyReturnLevel: 'none', value: 'test-handler' },
    })
    return { deepReturn, middleReturn, outerReturn, handlerReturn }
  },
  component: RouteComponent,
})

function RouteComponent() {
  const loaderData = Route.useLoaderData()
  const [results, setResults] = React.useState<{
    deep: any
    middle: any
    outer: any
    handler: any
  }>({ deep: null, middle: null, outer: null, handler: null })

  const levels = [
    {
      key: 'deep' as const,
      level: 'deep',
      label: 'Deep Middleware',
      color: '#8b5cf6',
    },
    {
      key: 'middle' as const,
      level: 'middle',
      label: 'Middle Middleware',
      color: '#3b82f6',
    },
    {
      key: 'outer' as const,
      level: 'outer',
      label: 'Outer Middleware',
      color: '#22c55e',
    },
    {
      key: 'handler' as const,
      level: 'none',
      label: 'Handler',
      color: '#6b7280',
    },
  ]

  return (
    <div className="p-4">
      <h2 className="font-bold text-lg mb-4">Nested Middleware Early Return</h2>
      <p className="mb-4">
        Tests deeply nested middleware chains where different levels can return
        early. Chain: outerMiddleware → middleMiddleware → deepMiddleware →
        handler
      </p>

      <div className="grid grid-cols-2 gap-4">
        {levels.map(({ key, level, label, color }) => (
          <div key={key} className="border p-4 rounded">
            <h3 className="font-semibold mb-2">{label} Returns</h3>

            <div className="mb-2">
              <h4 className="text-sm">Expected returnedFrom:</h4>
              <pre
                data-testid={`expected-${key}`}
                className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 p-2 rounded text-xs"
              >
                {level === 'none' ? 'handler' : `${level}Middleware`}
              </pre>
            </div>

            <div className="mb-2">
              <h4 className="text-sm">Loader Result:</h4>
              <pre
                data-testid={`loader-${key}`}
                className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 p-2 rounded text-xs overflow-auto max-h-32"
              >
                {JSON.stringify(loaderData[`${key}Return`], null, 2)}
              </pre>
            </div>

            <button
              data-testid={`invoke-${key}-btn`}
              className="text-white px-4 py-2 rounded mb-2 w-full"
              style={{ backgroundColor: color }}
              onClick={async () => {
                const result = await serverFn({
                  data: {
                    earlyReturnLevel:
                      level as EarlyReturnInput['earlyReturnLevel'],
                    value: `client-${key}`,
                  },
                })
                setResults((prev) => ({ ...prev, [key]: result }))
              }}
            >
              Invoke ({label})
            </button>

            <div>
              <h4 className="text-sm">Client Result:</h4>
              <pre
                data-testid={`client-${key}`}
                className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 p-2 rounded text-xs overflow-auto max-h-32"
              >
                {results[key]
                  ? JSON.stringify(results[key], null, 2)
                  : 'Not called yet'}
              </pre>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 p-4 bg-yellow-100 dark:bg-yellow-900 text-yellow-900 dark:text-yellow-100 rounded">
        <h4 className="font-semibold">Chain Structure:</h4>
        <pre className="text-sm">
          {`outerMiddleware (level 1)
   └─ middleMiddleware (level 2)
        └─ deepMiddleware (level 3)
             └─ handler (level 0)`}
        </pre>
        <p className="text-sm mt-2">
          Each level can short-circuit and return early, preventing deeper
          levels from executing.
        </p>
      </div>
    </div>
  )
}
