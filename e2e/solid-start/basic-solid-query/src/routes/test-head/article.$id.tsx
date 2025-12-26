import { useQuery } from '@tanstack/solid-query'
import { createFileRoute, Link } from '@tanstack/solid-router'
import { Show } from 'solid-js'
import { authQy, isAuthed } from '~/utils/fake-auth'

// Simulate fetching article - returns null if not authenticated
const fetchArticle = async (id: string) => {
  // Simulate API call delay
  await new Promise((resolve) => setTimeout(resolve, 200))

  const isLoggedIn = isAuthed()

  if (!isLoggedIn) {
    return null
  }

  return {
    title: `Article ${id} Title`,
    content: `This is the content of article ${id}. Lorem ipsum dolor sit amet, consectetur adipiscing elit.`,
  }
}

export const Route = createFileRoute('/test-head/article/$id')({
  ssr: false,
  loader: async ({ params }) => {
    const data = await fetchArticle(params.id)
    return data
  },

  head: ({ loaderData }) => {
    const title = loaderData?.title || 'Article Not Found'
    console.log('[!] head function: title =', title)
    return {
      meta: [{ title }],
    }
  },

  component: ArticlePage,
})

function ArticlePage() {
  const data = Route.useLoaderData()
  const authQuery = useQuery(() => authQy)

  return (
    <Show
      when={authQuery.data === true}
      fallback={
        <div class="p-4" data-testid="article-not-found">
          <h1 class="text-2xl font-bold text-red-600">Article not found</h1>
          <p class="mt-2">You need to be authenticated to view this article.</p>
          <div class="mt-4">
            <Link
              to="/fake-login"
              class="inline-block px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              data-testid="go-to-login-link"
            >
              Go to Login →
            </Link>
          </div>
        </div>
      }
    >
      <div class="p-4" data-testid="article-content">
        <h1 class="text-2xl font-bold" data-testid="article-title">
          {data()?.title}
        </h1>
        <p class="mt-4">{data()?.content}</p>

        <div class="mt-4 space-x-2">
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem('auth')
              window.location.reload()
            }}
            class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            data-testid="logout-button"
          >
            Simulate Logout
          </button>
        </div>
      </div>
    </Show>
  )
}
