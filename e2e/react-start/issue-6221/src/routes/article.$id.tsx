import { Link, createFileRoute } from '@tanstack/react-router'

type ArticleData = {
  title: string
  body: string
}

const loadArticle = async (id: string): Promise<ArticleData | null> => {
  await new Promise((resolve) => setTimeout(resolve, 100))

  if (window.localStorage.getItem('issue-6221-auth') !== 'true') {
    return null
  }

  return {
    title: `Article ${id} Title`,
    body: `Article ${id} body`,
  }
}

export const Route = createFileRoute('/article/$id')({
  ssr: false,
  loader: ({ params }) => loadArticle(params.id),
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.title ?? 'Article Not Found' }],
  }),
  component: Article,
})

function Article() {
  const article = Route.useLoaderData()

  if (!article) {
    return (
      <main data-testid="article-not-found">
        <h1>Article not found</h1>
        <Link to="/login" data-testid="login-link">
          Go to login
        </Link>
      </main>
    )
  }

  return (
    <main data-testid="article-content">
      <h1 data-testid="article-title">{article.title}</h1>
      <p>{article.body}</p>
    </main>
  )
}
