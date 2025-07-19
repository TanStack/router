# How to Set Up Authentication and Protected Routes

This guide covers implementing authentication patterns and protecting routes in TanStack Router applications.

## Quick Start

Set up authentication by creating a context-aware router, implementing auth state management, and using `beforeLoad` for route protection. Choose between redirect-based authentication (traditional login pages) or inline authentication (modals/overlays).

---

## React Context Authentication

### 1. Create Authentication Context

Create `src/auth.tsx`:

```tsx
import React, { createContext, useContext, useState } from 'react'

interface User {
  id: string
  username: string
  email: string
}

interface AuthState {
  isAuthenticated: boolean
  user: User | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  const login = async (username: string, password: string) => {
    // Replace with your authentication logic
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })

    if (response.ok) {
      const userData = await response.json()
      setUser(userData)
      setIsAuthenticated(true)
    } else {
      throw new Error('Authentication failed')
    }
  }

  const logout = () => {
    setUser(null)
    setIsAuthenticated(false)
    // Clear any stored tokens
    localStorage.removeItem('auth-token')
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
```

### 2. Set Up Router Context

Update `src/routes/__root.tsx`:

```tsx
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'

interface AuthState {
  isAuthenticated: boolean
  user: { id: string; username: string; email: string } | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

interface MyRouterContext {
  auth: AuthState
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: () => (
    <div>
      <Outlet />
      <TanStackRouterDevtools />
    </div>
  ),
})
```

### 3. Configure Router

Update `src/router.tsx`:

```tsx
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export const router = createRouter({
  routeTree,
  context: {
    // auth will be passed down from App component
    auth: undefined!,
  },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

### 4. Connect App with Authentication

Update `src/App.tsx`:

```tsx
import { RouterProvider } from '@tanstack/react-router'
import { AuthProvider, useAuth } from './auth'
import { router } from './router'

function InnerApp() {
  const auth = useAuth()
  return <RouterProvider router={router} context={{ auth }} />
}

function App() {
  return (
    <AuthProvider>
      <InnerApp />
    </AuthProvider>
  )
}

export default App
```

---

## Protected Routes with Redirects

### 1. Create Authentication Layout Route

Create `src/routes/_authenticated.tsx`:

```tsx
import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: '/login',
        search: {
          // Save current location for redirect after login
          redirect: location.href,
        },
      })
    }
  },
  component: () => <Outlet />,
})
```

### 2. Create Login Route

Create `src/routes/login.tsx`:

```tsx
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/login')({
  validateSearch: (search) => ({
    redirect: (search.redirect as string) || '/',
  }),
  beforeLoad: ({ context, search }) => {
    // Redirect to dashboard if already authenticated
    if (context.auth.isAuthenticated) {
      throw redirect({ to: search.redirect })
    }
  },
  component: LoginComponent,
})

function LoginComponent() {
  const navigate = useNavigate()
  const { auth } = Route.useRouteContext()
  const { redirect } = Route.useSearch()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      await auth.login(username, password)
      // Use router.history.push for full URL navigation
      window.location.href = redirect
    } catch (err) {
      setError('Invalid username or password')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={handleSubmit} className="max-w-md w-full space-y-4">
        <h1 className="text-2xl font-bold">Login</h1>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="username" className="block text-sm font-medium">
            Username
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            required
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            required
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
```

### 3. Create Protected Routes

Create `src/routes/_authenticated/dashboard.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardComponent,
})

function DashboardComponent() {
  const { auth } = Route.useRouteContext()

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Welcome, {auth.user?.username}!</p>
      <button
        onClick={auth.logout}
        className="bg-red-600 text-white px-4 py-2 rounded"
      >
        Logout
      </button>
    </div>
  )
}
```

---

## Inline Authentication (No Redirects)

### 1. Create Layout with Conditional Rendering

Create `src/routes/_authenticated.tsx`:

```tsx
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { LoginModal } from '../components/LoginModal'

export const Route = createFileRoute('/_authenticated')({
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const { auth } = Route.useRouteContext()

  if (!auth.isAuthenticated) {
    return <LoginModal />
  }

  return <Outlet />
}
```

### 2. Create Login Modal Component

Create `src/components/LoginModal.tsx`:

```tsx
import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'

interface LoginModalProps {
  onClose?: () => void
}

export function LoginModal({ onClose }: LoginModalProps) {
  const router = useRouter()
  const auth = router.options.context.auth
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      await auth.login(username, password)
      onClose?.()
    } catch (err) {
      setError('Invalid username or password')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold mb-6">Please sign in to continue</h2>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

---

## Popular Authentication Providers

### Auth0 Integration

```bash
npm install @auth0/auth0-react
```

Create `src/auth/auth0.tsx`:

```tsx
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import { createContext, useContext } from 'react'

interface Auth0ContextType {
  isAuthenticated: boolean
  user: any
  login: () => void
  logout: () => void
}

const Auth0Context = createContext<Auth0ContextType | undefined>(undefined)

export function Auth0Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <Auth0Provider
      domain={import.meta.env.VITE_AUTH0_DOMAIN}
      clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
      authorizationParams={{
        redirect_uri: window.location.origin,
      }}
    >
      <Auth0ContextProvider>{children}</Auth0ContextProvider>
    </Auth0Provider>
  )
}

function Auth0ContextProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, loginWithRedirect, logout } = useAuth0()

  const contextValue = {
    isAuthenticated,
    user,
    login: loginWithRedirect,
    logout: () => logout({ logoutParams: { returnTo: window.location.origin } }),
  }

  return (
    <Auth0Context.Provider value={contextValue}>
      {children}
    </Auth0Context.Provider>
  )
}

export function useAuth0Context() {
  const context = useContext(Auth0Context)
  if (context === undefined) {
    throw new Error('useAuth0Context must be used within Auth0Wrapper')
  }
  return context
}
```

### Clerk Integration

```bash
npm install @clerk/clerk-react
```

Create `src/auth/clerk.tsx`:

```tsx
import { ClerkProvider, useUser, useAuth } from '@clerk/clerk-react'

export function ClerkWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
      {children}
    </ClerkProvider>
  )
}

export function useClerkAuth() {
  const { isSignedIn } = useAuth()
  const { user } = useUser()

  return {
    isAuthenticated: isSignedIn,
    user: user ? {
      id: user.id,
      username: user.username || user.primaryEmailAddress?.emailAddress || '',
      email: user.primaryEmailAddress?.emailAddress || '',
    } : null,
    login: () => {
      // Clerk handles login through components like <SignIn />
    },
    logout: () => {
      // Clerk handles logout through components like <UserButton />
    },
  }
}
```

### Supabase Integration

```bash
npm install @supabase/supabase-js
```

Create `src/auth/supabase.tsx`:

```tsx
import { createClient } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState } from 'react'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

interface SupabaseAuthState {
  isAuthenticated: boolean
  user: any
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const SupabaseAuthContext = createContext<SupabaseAuthState | undefined>(undefined)

export function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setIsAuthenticated(!!session?.user)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        setIsAuthenticated(!!session?.user)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
  }

  const logout = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  return (
    <SupabaseAuthContext.Provider value={{ isAuthenticated, user, login, logout }}>
      {children}
    </SupabaseAuthContext.Provider>
  )
}

export function useSupabaseAuth() {
  const context = useContext(SupabaseAuthContext)
  if (context === undefined) {
    throw new Error('useSupabaseAuth must be used within SupabaseAuthProvider')
  }
  return context
}
```

---

## Role-Based Access Control

### 1. Extend Authentication Context

Update your auth context to include roles:

```tsx
interface User {
  id: string
  username: string
  email: string
  roles: string[]
}

interface AuthState {
  isAuthenticated: boolean
  user: User | null
  hasRole: (role: string) => boolean
  hasAnyRole: (roles: string[]) => boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  const hasRole = (role: string) => {
    return user?.roles.includes(role) ?? false
  }

  const hasAnyRole = (roles: string[]) => {
    return roles.some(role => user?.roles.includes(role)) ?? false
  }

  // ... login, logout logic

  return (
    <AuthContext.Provider value={{ 
      isAuthenticated, 
      user, 
      hasRole, 
      hasAnyRole, 
      login, 
      logout 
    }}>
      {children}
    </AuthContext.Provider>
  )
}
```

### 2. Create Role-Protected Routes

Create `src/routes/_authenticated/_admin.tsx`:

```tsx
import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/_admin')({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.hasRole('admin')) {
      throw redirect({
        to: '/unauthorized',
        search: {
          redirect: location.href,
        },
      })
    }
  },
  component: () => <Outlet />,
})
```

---

## Production Checklist

Before deploying authentication, ensure you have:

- [ ] Secured API endpoints with proper authentication middleware
- [ ] Set up HTTPS in production (required for secure cookies)
- [ ] Configured environment variables for auth providers
- [ ] Implemented proper session management and token refresh
- [ ] Added CSRF protection for form-based authentication
- [ ] Set up proper CORS configuration for your API
- [ ] Tested all authentication flows (login, logout, refresh)
- [ ] Implemented proper error handling for auth failures
- [ ] Added loading states for auth operations

---

## Common Problems

### Authentication Context Not Available

**Problem:** `useAuth must be used within an AuthProvider` error.

**Cause:** Trying to use auth context outside the provider or incorrect provider setup.

**Solutions:**
- Ensure `AuthProvider` wraps your entire app
- Check that `RouterProvider` is inside the auth provider
- Verify context is properly passed to router

### Infinite Redirect Loops

**Problem:** Page keeps redirecting between login and protected routes.

**Cause:** Authentication state not properly initialized or checking auth in wrong lifecycle.

**Solutions:**
- Add loading state while auth initializes:
  ```tsx
  if (isLoading) return <div>Loading...</div>
  ```
- Use `beforeLoad` instead of component for auth checks
- Ensure auth state is properly persisted

### User Logged Out on Page Refresh

**Problem:** Authentication state resets when page refreshes.

**Cause:** Auth state not persisted between sessions.

**Solutions:**
- Store tokens in localStorage/sessionStorage:
  ```tsx
  useEffect(() => {
    const token = localStorage.getItem('auth-token')
    if (token) {
      validateAndSetUser(token)
    }
  }, [])
  ```
- Use HTTP-only cookies for better security
- Implement token refresh logic

### Protected Route Flashing Before Redirect

**Problem:** Protected content briefly shows before redirecting to login.

**Cause:** Authentication check happening in component instead of `beforeLoad`.

**Solution:** Move auth checks to `beforeLoad`:
```tsx
export const Route = createFileRoute('/_authenticated/dashboard')({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: '/login' })
    }
  },
  component: DashboardComponent,
})
```

---

## Common Next Steps

After setting up authentication, you might want to:

<!-- TODO: Uncomment as how-to guides are created
- [How to Set Up Authorization and Permissions](./setup-authorization.md)
- [How to Implement Multi-Factor Authentication](./setup-mfa.md)
- [How to Handle User Sessions](./handle-user-sessions.md)
- [How to Set Up Social Login](./setup-social-login.md)
-->

## Related Resources

- [Authenticated Routes Guide](../guide/authenticated-routes.md) - Detailed conceptual guide
- [Router Context Guide](../guide/router-context.md) - Understanding context in TanStack Router
- [Authentication Examples](https://github.com/TanStack/router/tree/main/examples/react/authenticated-routes) - Complete working examples