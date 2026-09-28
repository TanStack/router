import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { createMiddleware, createServerFn } from '@tanstack/react-start'

function verifyCopy(
  source: object,
  actual: unknown,
  expected: Record<string, string>,
) {
  if (
    actual === source ||
    JSON.stringify(actual) !== JSON.stringify(expected)
  ) {
    throw new Error('sendContext must merge into a fresh object')
  }
}

const absent = createMiddleware({ type: 'function' })
  .client(async ({ sendContext, next }) => {
    if (sendContext !== undefined) {
      throw new Error('Absent client sendContext must be undefined')
    }
    const result = await next()
    if (result.sendContext !== undefined) {
      throw new Error('Absent client result sendContext must be undefined')
    }
    return result
  })
  .server(async ({ next }) => {
    const result = await next()
    if (result.sendContext !== undefined) {
      throw new Error('Absent server result sendContext must be undefined')
    }
    return result
  })

const explicitEmpty = createMiddleware({ type: 'function' })
  .client(async ({ next }) => {
    const source = Object.freeze({})
    const result = await next({ sendContext: source })
    verifyCopy(source, result.sendContext, {})
    return result
  })
  .server(async ({ next }) => {
    const source = Object.freeze({})
    const result = await next({ sendContext: source })
    verifyCopy(source, result.sendContext, {})
    return result
  })

const first = createMiddleware({ type: 'function' })
  .client(async ({ next }) => {
    const source = Object.freeze({ first: 'one' })
    const result = await next({ sendContext: source })
    verifyCopy(source, result.sendContext, { first: 'one', second: 'two' })
    return result
  })
  .server(async ({ next }) => {
    const source = Object.freeze({ first: 'one' })
    const result = await next({ sendContext: source })
    verifyCopy(source, result.sendContext, { first: 'one', second: 'two' })
    return result
  })

const second = createMiddleware({ type: 'function' })
  .middleware([first])
  .client(async ({ next }) => {
    const source = Object.freeze({ second: 'two' })
    const result = await next({ sendContext: source })
    verifyCopy(source, result.sendContext, { first: 'one', second: 'two' })
    return result
  })
  .server(async ({ context, next }) => {
    if (context.first !== 'one' || context.second !== 'two') {
      throw new Error('Client sendContext must reach the server')
    }
    const source = Object.freeze({ second: 'two' })
    const result = await next({ sendContext: source })
    verifyCopy(source, result.sendContext, { first: 'one', second: 'two' })
    return result
  })

const absentFn = createServerFn()
  .middleware([absent])
  .handler(() => 'absent')

const emptyFn = createServerFn()
  .middleware([explicitEmpty])
  .handler(() => 'empty')

const nonemptyFn = createServerFn()
  .middleware([second])
  .handler(() => 'nonempty')

const accessors = createMiddleware({ type: 'function' })
  .client(async ({ next }) => {
    const source = Object.freeze({ value: 'client' })
    const reads: Array<string> = []
    const result = await next({
      get sendContext() {
        reads.push('sendContext')
        return source
      },
      get headers() {
        reads.push('headers')
        return { 'x-context-accessor': 'preserved' }
      },
    })
    if (reads.join(',') !== 'sendContext,headers,sendContext,headers') {
      throw new Error(`Client middleware accessor order changed: ${reads}`)
    }
    verifyCopy(source, result.sendContext, { value: 'client' })
    if (new Headers(result.headers).get('x-context-accessor') !== 'preserved') {
      throw new Error('Client middleware header was not preserved')
    }
    return result
  })
  .server(async ({ next }) => {
    const source = Object.freeze({ value: 'server' })
    let reads = 0
    const result = await next({
      get sendContext() {
        reads++
        return source
      },
    })
    if (reads !== 2) {
      throw new Error(`Server middleware accessor read ${reads} times`)
    }
    verifyCopy(source, result.sendContext, { value: 'server' })
    return result
  })

const observeServerReply = createMiddleware({ type: 'function' })
  .middleware([accessors])
  .client(async ({ next }) => {
    const result = await next()
    if (result.context.value !== 'server') {
      throw new Error('Server sendContext must reach the client result context')
    }
    return result
  })

const accessorFn = createServerFn()
  .middleware([observeServerReply])
  .handler(() => 'accessors')

async function verifyAll() {
  return (
    await Promise.all([absentFn(), emptyFn(), nonemptyFn(), accessorFn()])
  ).join(',')
}

export const Route = createFileRoute('/send-context-contract')({
  loader: verifyAll,
  component: SendContextContract,
})

function SendContextContract() {
  const loaderResult = Route.useLoaderData()
  const [result, setResult] = useState('pending')
  return (
    <main>
      <div data-testid="send-context-loader">{loaderResult}</div>
      <button
        type="button"
        data-testid="invoke-send-context-contract"
        onClick={async () => {
          try {
            setResult(await verifyAll())
          } catch (error) {
            setResult(error instanceof Error ? error.message : String(error))
          }
        }}
      >
        Verify sendContext
      </button>
      <div data-testid="send-context-client">{result}</div>
    </main>
  )
}
