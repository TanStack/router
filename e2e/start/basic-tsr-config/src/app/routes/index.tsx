import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/start'

let count = 0

const getCount = createServerFn({ method: 'GET' }).handler(() => {
  return count
})

const updateCount = createServerFn({ method: 'POST' })
  .validator((addBy: number) => addBy)
  .handler(({ data: addBy }) => {
    count += addBy
  })

export const Route = createFileRoute('/')({
  component: Home,
  loader: async () => await getCount(),
})

function Home() {
  const router = useRouter()
  const state = Route.useLoaderData()

  return (
    <button
      onClick={() => {
        updateCount({ data: 1 }).then(() => {
          router.invalidate()
        })
      }}
    >
      Add 1 to {state}?
    </button>
  )
}
