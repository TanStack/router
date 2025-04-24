import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  ssr: false,
  beforeLoad: () => {
    console.log('beforeLoad')
  },
  loader: async () => {
    console.log('loader')
    await new Promise((resolve) => setTimeout(resolve, 500))
    return {
      message: 'Hello from the server!',
    }
  },
  pendingComponent: () => <div className="p-2">Loading...</div>,
  component: Home,
})

function Home() {
  const { message } = Route.useLoaderData()
  return (
    <div className="p-2">
      <h3>Welcome Home!!!</h3>
      <p>{message}</p>
    </div>
  )
}
