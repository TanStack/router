import {
  createRouter,
  createRootRoute,
  createRoute,
  buildHref,
  outlet,
  vanillaRouter,
} from '@tanstack/vanilla-router'
import { VanillaRenderer, jsx } from './renderer'

// Mock data fetching
async function fetchPosts() {
  await new Promise(resolve => setTimeout(resolve, 500))
  return [
    { id: '1', title: 'Getting Started with Vanilla Router' },
    { id: '2', title: 'JSX Rendering Made Simple' },
    { id: '3', title: 'Building Modern Web Apps' },
  ]
}

async function fetchPost(id: string) {
  await new Promise(resolve => setTimeout(resolve, 300))
  const posts: Record<string, { title: string; body: string }> = {
    '1': { title: 'Getting Started with Vanilla Router', body: 'Vanilla Router is a powerful routing solution for vanilla JavaScript applications. It provides type-safe routing, nested routes, and excellent developer experience.' },
    '2': { title: 'JSX Rendering Made Simple', body: 'Combine the power of JSX with vanilla JavaScript. The JSX renderer makes it easy to build component-based UIs without a framework.' },
    '3': { title: 'Building Modern Web Apps', body: 'Modern web applications require modern tools. Vanilla Router and JSX renderer provide a lightweight alternative to heavy frameworks.' },
  }
  if (!posts[id]) throw new Error('Post not found')
  return posts[id]
}

// Root component using JSX
const RootComponent = (router: ReturnType<typeof createRouter>) => {
  return () => {
    return jsx('div', {},
      jsx('nav', {},
        jsx('a', { href: buildHref(router, { to: '/' }) }, 'Home'),
        jsx('a', { href: buildHref(router, { to: '/posts' }) }, 'Posts')
      ),
      jsx('main', {},
        outlet()
      )
    )
  }
}

const rootRoute = createRootRoute({
  component: RootComponent,
})

// Index component
const IndexComponent = (router: ReturnType<typeof createRouter>) => {
  return () => {
    return jsx('div', {},
      jsx('h1', {}, 'Welcome Home!'),
      jsx('p', {}, 'This is the home page using Vanilla Router with JSX rendering.')
    )
  }
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexComponent,
})

// Posts layout route
const postsLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'posts',
  loader: () => fetchPosts(),
  component: (router: ReturnType<typeof createRouter>) => {
    return () => {
      const posts = postsLayoutRoute.getLoaderData(router)
      
      if (!posts) {
        return jsx('div', { className: 'loading' }, 'Loading posts...')
      }

      return jsx('div', {},
        jsx('h1', {}, 'Posts'),
        jsx('ul', { className: 'post-list' },
          ...posts.map(post => 
            jsx('li', { className: 'post-item' },
              jsx('a', { href: buildHref(router, { to: '/posts/$postId', params: { postId: post.id } }) }, post.title)
            )
          )
        ),
        outlet()
      )
    }
  },
})

// Posts index
const postsIndexRoute = createRoute({
  getParentRoute: () => postsLayoutRoute,
  path: '/',
  component: (router: ReturnType<typeof createRouter>) => {
    return () => {
      return jsx('div', {},
        jsx('p', {}, 'Select a post to view details.')
      )
    }
  },
})

// Post detail route
const postRoute = createRoute({
  getParentRoute: () => postsLayoutRoute,
  path: '$postId',
  loader: ({ params }: { params: { postId: string } }) => fetchPost(params.postId),
  component: (router: ReturnType<typeof createRouter>) => {
    return () => {
      const post = postRoute.getLoaderData(router)
      
      if (!post) {
        return jsx('div', { className: 'loading' }, 'Loading...')
      }

      return jsx('div', { className: 'post-detail' },
        jsx('h1', { className: 'post-title' }, post.title),
        jsx('div', { className: 'post-body' }, post.body)
      )
    }
  },
})

// Create router
const routeTree = rootRoute.addChildren([
  postsLayoutRoute.addChildren([postRoute, postsIndexRoute]),
  indexRoute,
])

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
})

// Render function using VanillaRenderer
const renderer = new VanillaRenderer()
const rootElement = document.getElementById('app')
if (!rootElement) throw new Error('App element not found')

function render() {
  if (!rootElement) return
  const state = router.state
  
  // Convert router matches to render contexts
  const contexts = state.matches.map((match) => {
    const route = router.routesById[match.routeId]
    const matchState = router.getMatch(match.id)
    
    return {
      component: route.options.component,
      errorComponent: route.options.errorComponent,
      pendingComponent: route.options.pendingComponent,
      error: matchState?.error,
      isPending: matchState?._displayPending,
      data: {
        loaderData: matchState?.loaderData,
        params: matchState?.params,
        search: matchState?.search,
        routeId: match.routeId,
      },
    }
  })

  // Render using JSX renderer with router
  const html = renderer.render(contexts, router)
  rootElement.innerHTML = html
}

// Setup router
vanillaRouter(router, render).catch(console.error)

