import Counter from '~/components/Counter'
export const Route = createFileRoute({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <main>
      <h1 className="text-3xl text-blue-500 mb-5">Hello world!</h1>
      <Counter />
    </main>
  )
}
