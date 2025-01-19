import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <div className="p-2">
      <h3>Welcome Home!!!</h3>
      {[...new Array(1000)].map((_, i) => (
        <div key={i}>{i}</div>
      ))}
    </div>
  )
}
