import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import { createArticleHead, createHeadLoaderData } from '../../../shared.ts'
import { Route as articlesRoute } from './head.articles'

const ArticlePage = Vue.defineComponent({
  setup() {
    const params = Route.useParams()
    const loaderData = Route.useLoaderData()

    return () => (
      <div
        data-route-marker="article"
        data-article-id={params.value.articleId}
        data-head-checksum={loaderData.value.checksum}
      />
    )
  },
})

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
