import { Link, createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <div class="p-2">
      <h3>Welcome to Head Function Test Suite</h3>
      <p>
        This test suite validates head() function behavior with async loaders.
      </p>
      <div class="mt-4">
        <Link
          to="/article/$id"
          params={{ id: '1' }}
          class="text-blue-600 underline"
        >
          Go to Article 1
        </Link>
      </div>
    </div>
  )
}
