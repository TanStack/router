import { createFileRoute } from '@tanstack/react-router'
import { createMiddleware, createServerFn } from '@tanstack/react-start'

export const authMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next, context }) => {
    throw new Error('Unauthorized')
  },
)

const personServerFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .inputValidator((d: string) => d)
  .handler(({ data: name }) => {
    return { name, randomNumber: Math.floor(Math.random() * 100) }
  })

export const Route = createFileRoute('/middleware/unhandled-exception')({
  loader: async () => {
    return {
      person: await personServerFn({ data: 'John Doe' }),
    }
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { person } = Route.useLoaderData()
  return (
    <div data-testid="regular-person">
      {person.name} - {person.randomNumber}
    </div>
  )
}
