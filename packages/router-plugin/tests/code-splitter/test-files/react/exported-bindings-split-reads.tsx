import { createFileRoute } from '@tanstack/react-router'

export function Card({ title }: { title: string }) {
  return <section>{title}</section>
}

export class Store {
  items = new Map<string, number>()
}

let renders = 0

export function countRender() {
  return ++renders
}

export function RouteTitle() {
  return <h1>{Route.useLoaderData().title}</h1>
}

function Page() {
  const store = new Store()
  return (
    <main>
      <RouteTitle />
      <Card title={`${store.items.size} items, render ${countRender()}`} />
    </main>
  )
}

export const Route = createFileRoute('/')({
  loader: () => ({ title: 'Home' }),
  component: Page,
})
