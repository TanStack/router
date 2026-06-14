import { createRoute } from '@tanstack/react-router'
import { createArticleHead, createHeadLoaderData } from '../../../shared.ts'
import { Route as articlesRoute } from './head.articles'

export const Route = createRoute({
  getParentRoute: () => articlesRoute,
  path: '$articleId',
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) =>
    createHeadLoaderData('article', params.articleId, deps),
  head: ({ params, loaderData }) =>
    createArticleHead(params.articleId, loaderData!),
  component: ArticlePage,
})

function ArticlePage() {
  const params = Route.useParams()
  const loaderData = Route.useLoaderData()

  return (
    <div
      data-route-marker="article"
      data-article-id={params.articleId}
      data-head-checksum={loaderData.checksum}
    />
  )
}
