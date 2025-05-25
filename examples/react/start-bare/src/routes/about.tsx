import Counter from "~/components/Counter"

export const Route = createFileRoute({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <main>
      <h1>About</h1>
      <Counter />
    </main>
  )
}
