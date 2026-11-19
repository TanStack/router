import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <main>
      <h1>Home</h1>
      <Link to="/posts/$postId" params={{ postId: '1' }}>
        First post
      </Link>
    </main>
  )
}
