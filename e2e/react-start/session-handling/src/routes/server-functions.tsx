import { ClientOnly, createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import * as React from 'react'
import { destroySession, readSession, updateSessionData } from '~/session'

const updateSessionFn = createServerFn({ method: 'POST' }).handler(async () => {
  const data = { serverFn: 'updated' }
  await updateSessionData(data)
  return { data }
})
const readSessionFn = createServerFn().handler(async () => {
  const serverFn = (await readSession()).serverFn
  return { data: typeof serverFn === 'string' ? { serverFn } : {} }
})
const clearSessionFn = createServerFn({ method: 'POST' }).handler(async () => {
  await destroySession()
  return { cleared: true }
})
const redirectSessionFn = createServerFn({ method: 'POST' }).handler(
  async () => {
    await updateSessionData({ serverFn: 'redirected' })
    throw redirect({ to: '/ssr' })
  },
)
const errorSessionFn = createServerFn({ method: 'POST' }).handler(async () => {
  await updateSessionData({ serverFn: 'error-persisted' })
  throw new Error('Expected external session error')
})
const ironSessionFn = createServerFn({ method: 'POST' }).handler(async () => {
  const session = await readSession('iron-session')
  session.user = 'iron-server-function'
  await session.save()
  return { user: session.user }
})

export const Route = createFileRoute('/server-functions')({
  component: ServerFunctions,
})

function ServerFunctions() {
  return (
    <main>
      <h1>External Session Server Functions</h1>
      <ClientOnly>
        <span data-testid="server-functions-hydrated" hidden />
      </ClientOnly>
      <ServerFunctionButton name="update" fn={updateSessionFn} />
      <ServerFunctionButton name="read" fn={readSessionFn} />
      <ServerFunctionButton name="clear" fn={clearSessionFn} />
      <ServerFunctionButton name="redirect" fn={redirectSessionFn} />
      <ServerFunctionButton name="error" fn={errorSessionFn} />
      <ServerFunctionButton name="iron" fn={ironSessionFn} />
    </main>
  )
}

function ServerFunctionButton({
  name,
  fn,
}: {
  name: string
  fn: (...args: Array<any>) => Promise<any>
}) {
  const serverFn = useServerFn(fn)
  const [result, setResult] = React.useState('idle')
  return (
    <div>
      <button
        type="button"
        data-testid={`server-function-${name}`}
        onClick={async () => {
          setResult('pending')
          try {
            setResult(JSON.stringify(await serverFn()))
          } catch (error) {
            setResult(error instanceof Error ? error.message : 'error')
          }
        }}
      >
        {name}
      </button>
      <output data-testid={`server-function-${name}-result`}>{result}</output>
    </div>
  )
}
