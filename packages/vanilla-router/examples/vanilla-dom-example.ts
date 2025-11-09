/**
 * Example: Using headless router with direct DOM manipulation
 */

import { createRouter, createRoute } from '@tanstack/vanilla-router'
import {
  buildHref,
  outlet,
  getMatchesHtml,
  setupLinkHandlers,
  setRouter,
  getRouter,
} from '@tanstack/vanilla-router'

// Define routes - components are simple functions that return HTML strings
// Note: Routes can reference each other, but for simple paths you can use strings
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => {
    return '<h1>Home Page</h1><p>Welcome to the home page!</p>'
  },
})

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: () => {
    return '<h1>About</h1><p>This is the about page.</p>'
  },
})

const postRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '/posts/$postId',
  component: () => {
    // Use route getter to access params
    const params = postRoute.getParams()
    return `<h1>Post ${params.postId}</h1><p>This is post ${params.postId}</p>`
  },
})

const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/posts',
  component: () => {
    const posts = [
      { id: 1, title: 'Post 1' },
      { id: 2, title: 'Post 2' },
    ]
    // Use buildHref utility for type-safe hrefs with params (like navigate() and <Link>)
    const router = getRouter()
    return `
      <h1>Posts</h1>
      <ul>
        ${posts.map((post) => `<li><a href="${buildHref(router, { to: '/posts/$postId', params: { postId: String(post.id) } })}">${post.title}</a></li>`).join('')}
      </ul>
    `
  },
})

const rootRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'root',
  component: () => {
    // Use outlet() function to mark where child routes should render
    const router = getRouter()
    return `
      <div>
        <nav>
          <a href="${buildHref(router, { to: '/' })}">Home</a>
          <a href="${buildHref(router, { to: '/about' })}">About</a>
          <a href="${buildHref(router, { to: '/posts' })}">Posts</a>
        </nav>
        <main>${outlet()}</main>
      </div>
    `
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

// Initialize router
const rootElement = document.getElementById('app')!
setRouter(router) // Set global router context for route getters

// Render function - direct DOM manipulation
function renderToDOM(router: typeof router, rootElement: HTMLElement) {
  rootElement.innerHTML = ''

  const state = router.state

  // Check for not found
  if (state.matches.some((m) => m.status === 'notFound' || m.globalNotFound)) {
    rootElement.innerHTML = '<div>404 - Not Found</div>'
    return
  }

  // Use getMatchesHtml utility to get nested HTML strings (outlet replacement is handled internally)
  const htmlParts = getMatchesHtml(router, state.matches)
  rootElement.innerHTML = htmlParts.join('')
}

// Subscribe to router events and render on changes
async function init() {
  // Load initial matches if needed
  if (router.state.matches.length === 0) {
    try {
      await router.load()
    } catch (error) {
      console.error('Error loading router:', error)
    }
  }

  // Initial render
  renderToDOM(router, rootElement)

  // Subscribe to router state changes
  router.subscribe('onResolved', () => {
    renderToDOM(router, rootElement)
  })

  router.subscribe('onLoad', () => {
    renderToDOM(router, rootElement)
  })
}

init()

// Setup link handlers (returns cleanup function)
const cleanupLinkHandlers = setupLinkHandlers(router, rootElement)
