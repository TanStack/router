export const Route = createLazyFileRoute({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(test)/initiallyEmpty"!</div>
}
