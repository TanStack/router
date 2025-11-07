/**
 * Example: Using headless router with component renderer (JSX)
 *
 * NOTE: This example is outdated - HeadlessRouter was refactored into utilities.
 * The renderer is now located in examples/renderer/ for example use only.
 */

import { createRouter, createRoute } from '../../src'
import { VanillaRenderer, type RenderContext } from './renderer/renderer'
import { jsx } from './renderer/jsx-runtime'

// Define routes with JSX components
const rootRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'root',
  component: () => {
    return () => {
      return jsx(
        'div',
        {},
        jsx(
          'nav',
          {},
          jsx('a', { href: '/' }, 'Home'),
          jsx('a', { href: '/about' }, 'About'),
          jsx('a', { href: '/posts' }, 'Posts'),
        ),
        jsx('main', { id: 'outlet' }),
      )
    }
  },
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => {
    return () => {
      return jsx(
        'div',
        {},
        jsx('h1', {}, 'Home Page'),
        jsx('p', {}, 'Welcome to the home page!'),
      )
    }
  },
})

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: () => {
    return () => {
      return jsx(
        'div',
        {},
        jsx('h1', {}, 'About'),
        jsx('p', {}, 'This is the about page.'),
      )
    }
  },
})

const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/posts',
  component: () => {
    return () => {
      const posts = [
        { id: 1, title: 'Post 1' },
        { id: 2, title: 'Post 2' },
      ]
      return jsx(
        'div',
        {},
        jsx('h1', {}, 'Posts'),
        jsx(
          'ul',
          {},
          ...posts.map((post) =>
            jsx('li', {}, jsx('a', { href: `/posts/${post.id}` }, post.title)),
          ),
        ),
      )
    }
  },
})

const postRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '/posts/$postId',
  component: () => {
    return () => {
      // Use route getter to access params
      const params = postRoute.getParams()
      return jsx(
        'div',
        {},
        jsx('h1', {}, `Post ${params.postId}`),
        jsx('p', {}, `This is post ${params.postId}`),
      )
    }
  },
})

// Create router
const routeTree = rootRoute.addChildren([
  indexRoute,
  aboutRoute,
  postsRoute.addChildren([postRoute]),
])

const router = createRouter({
  routeTree,
})

// Render function - using component renderer
const renderer = new VanillaRenderer()

function renderWithComponentRenderer(
  state: RouterRenderState,
  rootElement: HTMLElement,
) {
  if (state.isNotFound) {
    rootElement.innerHTML = '<div>404 - Not Found</div>'
    return
  }

  if (state.globalError) {
    rootElement.innerHTML = `<div>Error: ${state.globalError.message}</div>`
    return
  }

  // Convert router state to render contexts
  const contexts: RenderContext[] = state.matches.map((match) => ({
    component: match.component,
    pendingComponent: match.pendingComponent,
    errorComponent: match.errorComponent,
    error: match.error,
    isPending: match.isPending,
    data: {
      loaderData: match.loaderData,
      params: match.params,
      search: match.search,
      routeId: match.routeId,
    },
  }))

  // Use component renderer
  const html = renderer.render(contexts)
  rootElement.innerHTML = html
}

// Initialize headless router
const rootElement = document.getElementById('app')!
const headlessRouter = new HeadlessRouter(router, (state) => {
  renderWithComponentRenderer(state, rootElement)
})

// Setup link handlers
headlessRouter.setupLinkHandlers(rootElement)
