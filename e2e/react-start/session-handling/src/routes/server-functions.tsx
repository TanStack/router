import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { useSession } from '@tanstack/react-start/server'
import * as React from 'react'
import { sessionConfig } from '~/session'

const updateSessionFn = createServerFn().handler(async () => {
  const session = await useSession<Record<string, any>>(sessionConfig())
  await session.update({ serverFn: 'updated' })
  return {
    id: session.id,
    data: session.data,
  }
})

const readSessionFn = createServerFn().handler(async () => {
  const session = await useSession<Record<string, any>>(sessionConfig())
  return {
    id: session.id,
    data: session.data,
  }
})

export const Route = createFileRoute('/server-functions')({
  component: ServerFunctions,
})

function ServerFunctions() {
  return (
    <main>
      <h1>Server Functions</h1>
      <ClientOnly>
        <span data-testid="server-functions-hydrated" hidden />
      </ClientOnly>
      <ServerFunctionButton name="update" fn={updateSessionFn} />
      <ServerFunctionButton name="read" fn={readSessionFn} />
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
