import { createFileRoute } from '@tanstack/solid-router'
import { useQuery } from 'convex-solidjs'
import { api } from 'convex/_generated/api'
import { For } from 'solid-js'
import { addNumber } from '~/lib/server'

export const Route = createFileRoute('/')({
  component: RouteComponent,
})

function RouteComponent() {
  // example of a Convex query
  const { data } = useQuery(api.myFunctions.listNumbers, { count: 10 })
  return (
    <main>
      <h1>Hello world!</h1>
      <For each={data()?.numbers}>{(number) => <div>{number}</div>}</For>
      <button onClick={() => addNumber()}>Add Number To Convex</button>
    </main>
  )
}
