import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/not-found/proxy-loader')({
  loader: () => {
    return new Proxy(
      { message: 'proxied loader data rendered successfully' },
      {
        get(target, prop, receiver) {
          if (prop === 'isNotFound') return 'truthy-but-not-true'
          return Reflect.get(target, prop, receiver)
        },
      },
    )
  },
  component: RouteComponent,
})

function RouteComponent() {
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="proxy-loader-route-component">{loaderData.message}</div>
  )
}
