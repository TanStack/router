import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/hello')({
  component: Hello,
})

function Hello() {
  const data = Route.useLoaderData()

  return <div className="p-2">{data}</div>
}
