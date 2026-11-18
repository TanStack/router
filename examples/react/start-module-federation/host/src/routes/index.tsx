import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <section>
      <h1>TanStack Start + Module Federation</h1>
      <p>
        This host owns the routes, the document and the server. The{' '}
        <Link to="/products">products</Link> pages are rendered by the catalog
        remote, a separate TanStack Start app on port 3001 that is loaded at
        runtime with Module Federation and rendered on the server.
      </p>
    </section>
  )
}
