import {
  HeadContent,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { createPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'
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

function Root() {
  return (
    <>
      {createPortal(<HeadContent />, document.head)}
      <Outlet />
    </>
  )
}

const rootRoute = createRootRoute({
  validateSearch: normalizeHeadSearch,
  component: Root,
})

function HeadLayout() {
  const loaderData = headRoute.useLoaderData()

  return (
    <section data-route-marker="head" data-head-checksum={loaderData.checksum}>
      <Outlet />
    </section>
  )
}

const headRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/head',
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => createHeadLoaderData('section', 'root', deps),
  head: ({ loaderData }) => createHeadSectionHead(loaderData!),
  component: HeadLayout,
})

function ArticlesPage() {
  const loaderData = articlesRoute.useLoaderData()

  return (
    <article
      data-route-marker="articles"
      data-head-checksum={loaderData.checksum}
    >
      <Outlet />
    </article>
  )
}

const articlesRoute = createRoute({
  getParentRoute: () => headRoute,
  path: 'articles',
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => createHeadLoaderData('articles', 'list', deps),
  head: ({ loaderData }) => createArticlesHead(loaderData!),
  component: ArticlesPage,
})

function ArticlePage() {
  const params = articleRoute.useParams()
  const loaderData = articleRoute.useLoaderData()

  return (
    <div
      data-route-marker="article"
      data-article-id={params.articleId}
      data-head-checksum={loaderData.checksum}
    />
  )
}

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

function ProductPage() {
  const params = productRoute.useParams()
  const loaderData = productRoute.useLoaderData()

  return (
    <div
      data-route-marker="product"
      data-product-id={params.productId}
      data-head-checksum={loaderData.checksum}
    />
  )
}

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

function SettingsPage() {
  const params = settingsRoute.useParams()
  const loaderData = settingsRoute.useLoaderData()

  return (
    <div
      data-route-marker="settings"
      data-tab={params.tab ?? 'none'}
      data-head-checksum={loaderData.checksum}
    />
  )
}

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
  const reactRoot = createRoot(container)
  let didUnmount = false

  reactRoot.render(<RouterProvider router={router} />)

  return {
    router,
    unmount() {
      if (didUnmount) {
        return
      }

      didUnmount = true
      reactRoot.unmount()
    },
  }
}
