import {
  createRouter,
  createRootRoute,
  createRoute,
  buildHref,
  outlet,
  getMatchesHtml,
  vanillaRouter,
} from '@tanstack/vanilla-router'
import { NotFoundError, fetchPost, fetchPosts } from './posts'

// Root component
const RootComponent = (router: ReturnType<typeof createRouter>) => {
  return `
    <div class="p-2 flex gap-2 text-lg border-b">
      <a href="${buildHref(router, { to: '/' })}">Home</a>
      <a href="${buildHref(router, { to: '/posts' })}">Posts</a>
    </div>
    ${outlet()}
  `
}

const rootRoute = createRootRoute({
  component: RootComponent,
  notFoundComponent: () => (router: ReturnType<typeof createRouter>) => {
    return `
      <div>
        <p>This is the notFoundComponent configured on root route</p>
        <a href="/">Start Over</a>
      </div>
    `
  },
})

// Index component
const IndexComponent = (router: ReturnType<typeof createRouter>) => {
  return `
    <div class="p-2">
      <h3>Welcome Home!</h3>
    </div>
  `
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexComponent,
})

// Posts layout route with component
export const postsLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'posts',
  loader: () => fetchPosts(),
  component: (router: ReturnType<typeof createRouter>) => {
    // Access data via route getters - pass router explicitly
    const posts = postsLayoutRoute.getLoaderData(router) as Array<{ id: string; title: string }> | undefined

    if (!posts) {
      return `<div>Loading posts...</div>`
    }

    return `
      <div class="p-2">
        <ul>
          ${posts.map((post) => `
            <li>
              <a href="${buildHref(router, { to: '/posts/$postId', params: { postId: post.id } })}">${post.title}</a>
            </li>
          `).join('')}
        </ul>
        ${outlet()}
      </div>
    `
  },
})

// Posts index component
const PostsIndexComponent = (router: ReturnType<typeof createRouter>) => {
  return `<div>Select a post.</div>`
}

const postsIndexRoute = createRoute({
  getParentRoute: () => postsLayoutRoute,
  path: '/',
  component: PostsIndexComponent,
})

// Post route
const postRoute = createRoute({
  getParentRoute: () => postsLayoutRoute,
  path: '$postId',
  errorComponent: ({ error }) => (router: ReturnType<typeof createRouter>) => {
    if (error instanceof NotFoundError) {
      return `<div>${error.message}</div>`
    }
    return `<div>Error: ${String(error)}</div>`
  },
  loader: ({ params }) => fetchPost(params.postId),
  component: (router: ReturnType<typeof createRouter>) => {
    // Access data via route getters - pass router explicitly
    const post = postRoute.getLoaderData(router) as { title: string; body: string } | undefined
    
    if (!post) {
      return `<div>Loading...</div>`
    }

    return `
      <div class="space-y-2">
        <h4 class="text-xl font-bold">${post.title}</h4>
        <hr class="opacity-20" />
        <div class="text-sm">${post.body}</div>
      </div>
    `
  },
})

const routeTree = rootRoute.addChildren([
  postsLayoutRoute.addChildren([postRoute, postsIndexRoute]),
  indexRoute,
])

// Create router
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
})

// Register router for type safety
declare module '@tanstack/vanilla-router' {
  interface Register {
    router: typeof router
  }
}

// Initialize router
const rootElement = document.getElementById('app')!

// Render function - direct DOM manipulation
function render() {
  rootElement.innerHTML = ''

  const state = router.state

  // Use getMatchesHtml utility to get nested HTML strings (outlet replacement is handled internally)
  const htmlParts = getMatchesHtml(router, state.matches)
  rootElement.innerHTML = htmlParts.join('')
}

// Setup router with state subscription and link handlers
await vanillaRouter(router, render)

