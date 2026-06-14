import { Outlet, createRoute } from '@tanstack/solid-router'
import { createArticlesHead, createHeadLoaderData } from '../../../shared.ts'
import { Route as headRoute } from './head'

export const Route = createRoute({
  getParentRoute: () => headRoute,
  path: 'articles',
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => createHeadLoaderData('articles', 'list', deps),
  head: ({ loaderData }) => createArticlesHead(loaderData!),
  component: ArticlesPage,
})

function ArticlesPage() {
  const loaderData = Route.useLoaderData()

  return (
    <article
      data-route-marker="articles"
      data-head-checksum={loaderData().checksum}
    >
      <Outlet />
    </article>
  )
}
