import {
  createRouter,
  createRootRoute,
  createRoute,
  buildHref,
  outlet,
  getMatchesHtml,
  vanillaRouter,
} from '@tanstack/vanilla-router'

// Root component
const RootComponent = (router: ReturnType<typeof createRouter>) => {
  const currentPath = router.state.location.pathname
  return `
    <nav>
      <a href="${buildHref(router, { to: '/' })}" ${currentPath === '/' ? 'class="active"' : ''}>Home</a>
      <a href="${buildHref(router, { to: '/about' })}" ${currentPath === '/about' ? 'class="active"' : ''}>About</a>
      <a href="${buildHref(router, { to: '/about' })}" data-reset-scroll="false">About (No Reset)</a>
      <a href="${buildHref(router, { to: '/scrollable' })}" ${currentPath === '/scrollable' ? 'class="active"' : ''}>Scrollable Container</a>
    </nav>
    <main>
      ${outlet()}
    </main>
  `
}

const rootRoute = createRootRoute({
  component: RootComponent,
})

// Index component with scrollable content
const IndexComponent = (router: ReturnType<typeof createRouter>) => {
  return `
    <div class="info">
      <strong>Scroll Restoration Demo:</strong> Scroll down on this page, then navigate to another page and come back. 
      Your scroll position should be restored automatically!
    </div>
    <h1>Welcome Home!</h1>
    <div>
      ${Array.from({ length: 50 }, (_, i) => `
        <div class="item">Home Item ${i + 1}</div>
      `).join('')}
    </div>
  `
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  loader: () => new Promise<void>((r) => setTimeout(r, 500)),
  component: IndexComponent,
})

// About component with scrollable content
const AboutComponent = (router: ReturnType<typeof createRouter>) => {
  return `
    <div class="info">
      <strong>Scroll Restoration Demo:</strong> Scroll down on this page, navigate away, and come back. 
      Your scroll position should be restored!
    </div>
    <h1>About Page</h1>
    <div>
      ${Array.from({ length: 50 }, (_, i) => `
        <div class="item">About Item ${i + 1}</div>
      `).join('')}
    </div>
  `
}

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  loader: () => new Promise<void>((r) => setTimeout(r, 500)),
  component: AboutComponent,
})

// Scrollable container component (demonstrates element-level scroll restoration)
const ScrollableComponent = (router: ReturnType<typeof createRouter>) => {
  return `
    <div class="info">
      <strong>Element-Level Scroll Restoration:</strong> Scroll within the container below, navigate away, and come back. 
      The scroll position within the container should be restored!
    </div>
    <h1>Scrollable Container Demo</h1>
    <div class="scrollable-container" data-scroll-restoration-id="scrollable-content">
      ${Array.from({ length: 50 }, (_, i) => `
        <div class="item">Scrollable Item ${i + 1}</div>
      `).join('')}
    </div>
  `
}

const scrollableRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/scrollable',
  loader: () => new Promise<void>((r) => setTimeout(r, 500)),
  component: ScrollableComponent,
})

// Create router with scroll restoration enabled
const routeTree = rootRoute.addChildren([
  indexRoute,
  aboutRoute,
  scrollableRoute,
])

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true, // Enable scroll restoration
})

// Render function
const rootElement = document.getElementById('app')
if (!rootElement) throw new Error('App element not found')

function render() {
  if (!rootElement) return
  const htmlParts = getMatchesHtml(router, router.state.matches)
  rootElement.innerHTML = htmlParts.join('')
  
  // Update active links
  const currentPath = router.state.location.pathname
  const links = rootElement.querySelectorAll('nav a')
  links.forEach((link) => {
    const href = link.getAttribute('href')
    if (href === currentPath) {
      link.classList.add('active')
    } else {
      link.classList.remove('active')
    }
  })
}

// Setup router
vanillaRouter(router, render).catch(console.error)

