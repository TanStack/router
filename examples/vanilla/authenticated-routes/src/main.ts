import {
  createRouter,
  createRootRoute,
  createRoute,
  buildHref,
  outlet,
  getMatchesHtml,
  vanillaRouter,
  redirect,
} from '@tanstack/vanilla-router'

// Simple auth state management
let currentUser: { username: string } | null = null

function login(username: string, password: string): Promise<void> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (username === 'admin' && password === 'password') {
        currentUser = { username }
        resolve()
      } else {
        reject(new Error('Invalid credentials'))
      }
    }, 500)
  })
}

function logout() {
  currentUser = null
}

function isAuthenticated(): boolean {
  return currentUser !== null
}

function getCurrentUser() {
  return currentUser
}

// Root component
const RootComponent = (router: ReturnType<typeof createRouter>) => {
  const currentPath = router.state.location.pathname
  const user = getCurrentUser()
  
  return `
    <nav>
      <div class="links">
        <a href="${buildHref(router, { to: '/' })}" ${currentPath === '/' ? 'class="active"' : ''}>Home</a>
        ${user ? `<a href="${buildHref(router, { to: '/dashboard' })}" ${currentPath === '/dashboard' ? 'class="active"' : ''}>Dashboard</a>` : ''}
        ${!user ? `<a href="${buildHref(router, { to: '/login' })}" ${currentPath === '/login' ? 'class="active"' : ''}>Login</a>` : ''}
      </div>
      ${user ? `<div class="user-info">Logged in as: ${user.username} | <button class="button secondary" onclick="window.logout()">Logout</button></div>` : ''}
    </nav>
    <main>
      ${outlet()}
    </main>
  `
}

const rootRoute = createRootRoute({
  component: RootComponent,
  context: () => ({
    auth: {
      isAuthenticated: isAuthenticated(),
      user: getCurrentUser(),
    },
  }),
})

// Index component (public)
const IndexComponent = (router: ReturnType<typeof createRouter>) => {
  const user = getCurrentUser()
  return `
    <div class="card">
      <h1>Welcome Home!</h1>
      <p>This is a public page. Anyone can access it.</p>
      ${user ? `
        <p>You are logged in as <strong>${user.username}</strong>.</p>
        <a href="${buildHref(router, { to: '/dashboard' })}" class="button">Go to Dashboard</a>
      ` : `
        <p>You are not logged in.</p>
        <a href="${buildHref(router, { to: '/login' })}" class="button">Login</a>
      `}
    </div>
  `
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexComponent,
})

// Login component (public, but redirects if already authenticated)
const LoginComponent = (router: ReturnType<typeof createRouter>) => {
  return `
    <div class="card">
      <h1>Login</h1>
      <form id="login-form">
        <label for="username">Username:</label>
        <input type="text" id="username" name="username" value="admin" required />
        <label for="password">Password:</label>
        <input type="password" id="password" name="password" value="password" required />
        <button type="submit" class="button">Login</button>
      </form>
      <div id="login-error" style="display: none;"></div>
      <p style="margin-top: 1rem; color: #666; font-size: 0.9rem;">
        <strong>Demo credentials:</strong><br />
        Username: admin<br />
        Password: password
      </p>
    </div>
  `
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  beforeLoad: ({ context }) => {
    // Redirect to dashboard if already authenticated
    if (context.auth.isAuthenticated) {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: LoginComponent,
})

// Dashboard component (protected)
const DashboardComponent = (router: ReturnType<typeof createRouter>) => {
  const user = getCurrentUser()
  return `
    <div class="card">
      <h1>Dashboard</h1>
      <p>Welcome, <strong>${user?.username}</strong>!</p>
      <p>This is a protected route. Only authenticated users can access it.</p>
      <p>If you try to access this page while logged out, you'll be redirected to the login page.</p>
      <button class="button secondary" onclick="window.logout()">Logout</button>
    </div>
  `
}

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  beforeLoad: ({ context }) => {
    // Redirect to login if not authenticated
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: '/login' })
    }
  },
  component: DashboardComponent,
})

// Create router
const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  dashboardRoute,
])

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  context: {
    auth: {
      isAuthenticated: false,
      user: null,
    },
  },
})

// Render function
const rootElement = document.getElementById('app')
if (!rootElement) throw new Error('App element not found')

function render() {
  if (!rootElement) return
  
  // Update router context with current auth state
  router.options.context = {
    auth: {
      isAuthenticated: isAuthenticated(),
      user: getCurrentUser(),
    },
  }
  
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
  
  // Setup login form handler
  const loginForm = rootElement.querySelector('#login-form') as HTMLFormElement
  if (loginForm) {
    loginForm.onsubmit = async (e) => {
      e.preventDefault()
      const formData = new FormData(loginForm)
      const username = formData.get('username') as string
      const password = formData.get('password') as string
      const errorDiv = rootElement.querySelector('#login-error') as HTMLDivElement
      
      try {
        await login(username, password)
        errorDiv.style.display = 'none'
        // Navigate to dashboard after successful login
        await router.navigate({ to: '/dashboard' })
      } catch (error) {
        errorDiv.style.display = 'block'
        errorDiv.className = 'error'
        errorDiv.textContent = error instanceof Error ? error.message : 'Login failed'
      }
    }
  }
}

// Setup logout function
;(window as any).logout = async () => {
  logout()
  await router.navigate({ to: '/' })
}

// Setup router
vanillaRouter(router, render).catch(console.error)

