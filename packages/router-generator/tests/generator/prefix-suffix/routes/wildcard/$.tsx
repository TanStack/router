export const Route = createFileRoute({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/wildcard/$"!</div>
}
