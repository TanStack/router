

export const Route = createFileRoute({
  component: Home,
})

function Home() {
  return (
    <div className="p-2">
      <h3 className="text-2xl mb-2">Website Landing Page</h3>
    </div>
  )
}
