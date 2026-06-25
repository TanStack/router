import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <main data-testid="home">
      <h1>Issue 6221</h1>
      <Link to="/article/$id" params={{ id: '123' }} data-testid="article-link">
        Article 123
      </Link>
    </main>
  )
}
