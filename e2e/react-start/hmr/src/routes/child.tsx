import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/child')({
  component: Child,
  beforeLoad: () => ({
    greeting: 'Hello',
  }),
  loader: () => ({
    crumb: 'Child',
  }),
})

function Child() {
  const context = Route.useRouteContext()
  return (
    <div>
      <p data-testid="child">child</p>
      {context.greeting ? (
        <p data-testid="child-greeting">{context.greeting}</p>
      ) : null}
    </div>
  )
}
