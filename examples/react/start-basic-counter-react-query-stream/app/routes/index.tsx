import { fetchEventSource } from '@microsoft/fetch-event-source'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import type { PingEvent } from './api/ping'

const deployURL = 'http://localhost:3000'

const useUpdatePing = () => {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${deployURL}/api/ping`, {
        method: 'PUT',
      })

      if (!res.ok) {
        throw new Error('Failed to update counter')
      }

      const data = await res.json()

      return data as PingEvent
    },
    mutationKey: ['increment', 'counter'],
  })
}

const useCounterStream = () => {
  const apiUtil = useQueryClient()
  const queryKey = ['stream', 'counter']

  const fetchCounter = useCallback(async () => {
    await fetchEventSource(`${deployURL}/api/ping`, {
      method: 'GET',
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
      onopen: async (res) => {
        if (res.ok && res.status === 200) {
          console.info('open')
        } else {
          console.error('error', await res.json())
        }
      },
      onmessage: (res) => {
        const data = JSON.parse(res.data) as { value: number }
        console.info('received message', data)
        apiUtil.setQueryData(queryKey, (prev) => {
          return {
            value: data.value,
          } satisfies PingEvent
        })
      },
    })

    return {
      value: 0,
    } satisfies PingEvent
  }, [])

  return useQuery({
    queryKey,
    queryFn: fetchCounter,
  })
}

function DashboardPage() {
  const [counter, setCounter] = useState(0)
  const streamCounter = useCounterStream()
  const updateCounter = useUpdatePing()

  const onServerStreamSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    await updateCounter.mutateAsync()
  }

  const onClientSideSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setCounter((prev) => prev + 1)
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="font-bold text-4xl">API Stream</h1>
      <div className="">
        <p>
          Hello, we have two buttons here. 1st is tracked client side. The other
          is tracked server side with an event stream.
        </p>
        <Link to="/" className="underline">
          Home
        </Link>
      </div>
      <div className="flex flex-col gap-2">
        <form onSubmit={onClientSideSubmit}>
          <button type="submit" className="py-12 font-mono text-5xl">
            Clicks: {counter}
          </button>
        </form>
        <form onSubmit={onServerStreamSubmit}>
          {streamCounter.isLoading ? (
            <button type="button" className="py-12 font-mono text-5xl" disabled>
              Loading...
            </button>
          ) : (
            <button type="submit" className="py-12 font-mono text-5xl">
              Stream Clicks: {JSON.stringify(streamCounter.data?.value) || '0'}
            </button>
          )}
        </form>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: DashboardPage,
})
