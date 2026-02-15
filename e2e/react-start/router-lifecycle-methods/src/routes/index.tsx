import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  context: () => {
    return { indexContextCtx: 'index-context' }
  },
  beforeLoad: () => {
    return { indexBeforeLoadCtx: 'index-beforeLoad' }
  },
  loader: () => {
    return { indexLoaderData: 'index-loader' }
  },
  component: IndexComponent,
})

function IndexComponent() {
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="index-component">
      <h1 data-testid="index-heading">Home</h1>
      <div data-testid="index-context">{context.indexContextCtx}</div>
      <div data-testid="index-beforeLoad">{context.indexBeforeLoadCtx}</div>
      <div data-testid="index-loader">{loaderData.indexLoaderData}</div>
    </div>
  )
}
