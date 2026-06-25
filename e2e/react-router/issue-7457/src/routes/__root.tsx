import { Outlet, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  beforeLoad: async () => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
  },
  component: RootComponent,
})

function RootComponent() {
  return (
    <main>
      <Outlet />
    </main>
  )
}
