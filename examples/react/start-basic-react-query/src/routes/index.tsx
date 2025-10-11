import * as React from 'react'
import { useMutation } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'

const greetUser = createServerFn({ method: 'POST' })
  .inputValidator((input: { name: string }) => input)
  .handler(async ({ data }) => {
    return Promise.resolve({ message: `Hello ${data.name}!` })
  })

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const greetingMutation = useMutation({
    mutationFn: useServerFn(greetUser),
    onSuccess: (data) => data,
  })

  return (
    <div className="p-2 flex flex-col gap-2">
      <h3>useServerFn + useMutation demo</h3>
      <button
        className="rounded bg-blue-500 px-3 py-1 text-white"
        onClick={() => greetingMutation.mutate({ data: { name: 'TanStack' } })}
      >
        Say hi
      </button>
      {greetingMutation.data ? (
        <p data-testid="greeted">{greetingMutation.data.message}</p>
      ) : null}
    </div>
  )
}
