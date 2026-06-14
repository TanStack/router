import * as Vue from 'vue'
import { Teleport } from 'vue'
import {
  HeadContent,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/vue-router'
import {
  createArticleHead,
  createArticlesHead,
  createHeadLoaderData,
  createHeadSectionHead,
  createProductHead,
  createSettingsHead,
  initialLocation,
  normalizeHeadSearch,
} from '../../shared.ts'

const Root = Vue.defineComponent({
  setup() {
    return () => (
      <>
        <Teleport to="head">
          <HeadContent />
        </Teleport>
        <Outlet />
      </>
    )
  },
})

const rootRoute = createRootRoute({
  validateSearch: normalizeHeadSearch,
  component: Root,
})

const HeadLayout = Vue.defineComponent({
  setup() {
    const loaderData = headRoute.useLoaderData()

    return () => (
      <section
        data-route-marker="head"
        data-head-checksum={loaderData.value.checksum}
      >
        <Outlet />
      </section>
    )
  },
})

const headRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/head',
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => createHeadLoaderData('section', 'root', deps),
  head: ({ loaderData }) => createHeadSectionHead(loaderData!),
  component: HeadLayout,
})

const ArticlesPage = Vue.defineComponent({
  setup() {
    const loaderData = articlesRoute.useLoaderData()

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

const articlesRoute = createRoute({
  getParentRoute: () => headRoute,
  path: 'articles',
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => createHeadLoaderData('articles', 'list', deps),
  head: ({ loaderData }) => createArticlesHead(loaderData!),
  component: ArticlesPage,
})

const ArticlePage = Vue.defineComponent({
  setup() {
    const params = articleRoute.useParams()
    const loaderData = articleRoute.useLoaderData()

    return () => (
      <div
        data-route-marker="article"
        data-article-id={params.value.articleId}
        data-head-checksum={loaderData.value.checksum}
      />
    )
  },
})

const articleRoute = createRoute({
  getParentRoute: () => articlesRoute,
  path: '$articleId',
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) =>
    createHeadLoaderData('article', params.articleId, deps),
  head: ({ params, loaderData }) =>
    createArticleHead(params.articleId, loaderData!),
  component: ArticlePage,
})

const ProductPage = Vue.defineComponent({
  setup() {
    const params = productRoute.useParams()
    const loaderData = productRoute.useLoaderData()

    return () => (
      <div
        data-route-marker="product"
        data-product-id={params.value.productId}
        data-head-checksum={loaderData.value.checksum}
      />
    )
  },
})

const productRoute = createRoute({
  getParentRoute: () => headRoute,
  path: 'products/$productId',
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) =>
    createHeadLoaderData('product', params.productId, deps),
  head: ({ params, loaderData }) =>
    createProductHead(params.productId, loaderData!),
  component: ProductPage,
})

const SettingsPage = Vue.defineComponent({
  setup() {
    const params = settingsRoute.useParams()
    const loaderData = settingsRoute.useLoaderData()

    return () => (
      <div
        data-route-marker="settings"
        data-tab={params.value.tab ?? 'none'}
        data-head-checksum={loaderData.value.checksum}
      />
    )
  },
})

const settingsRoute = createRoute({
  getParentRoute: () => headRoute,
  path: 'settings/{-$tab}',
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) =>
    createHeadLoaderData('settings', params.tab ?? 'general', deps),
  head: ({ params, loaderData }) => createSettingsHead(params.tab, loaderData!),
  component: SettingsPage,
})

const routeTree = rootRoute.addChildren([
  headRoute.addChildren([
    articlesRoute.addChildren([articleRoute]),
    productRoute,
    settingsRoute,
  ]),
])

export function mountTestApp(container: HTMLDivElement) {
  const router = createRouter({
    history: createMemoryHistory({
      initialEntries: [initialLocation],
    }),
    routeTree,
  })
  const component = <RouterProvider router={router} />
  const app = Vue.createApp({
    render: () => component,
  })
  let didUnmount = false

  app.mount(container)

  return {
    router,
    unmount() {
      if (didUnmount) {
        return
      }

      didUnmount = true
      app.unmount()
    },
  }
}
