import * as Vue from 'vue'
import { Outlet, createRoute } from '@tanstack/vue-router'
import { createArticlesHead, createHeadLoaderData } from '../../../shared.ts'
import { Route as headRoute } from './head'

const ArticlesPage = Vue.defineComponent({
  setup() {
    const loaderData = Route.useLoaderData()

    return () => (
      <article
        data-route-marker="articles"
        data-head-checksum={loaderData.value.checksum}
      >
        <Outlet />
      </article>
    )
  },
})

export const Route = createRoute({
  getParentRoute: () => headRoute,
  path: 'articles',
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => createHeadLoaderData('articles', 'list', deps),
  head: ({ loaderData }) => createArticlesHead(loaderData!),
  component: ArticlesPage,
})
