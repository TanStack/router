---
name: state-management-integration
---

# State Management Integration

Integrating TanStack Router with state management libraries.

## Zustand

### Installation

```bash
npm install zustand
```

### Basic Store

```tsx
// stores/auth.ts
import { create } from 'zustand'

interface User {
  id: string
  name: string
  email: string
}

interface AuthStore {
  user: User | null
  isAuthenticated: boolean
  login: (user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,
  login: (user) => set({ user, isAuthenticated: true }),
  logout: () => set({ user: null, isAuthenticated: false }),
}))
```

### Router Context Integration

```tsx
// router.tsx
import { createRouter } from '@tanstack/react-router'
import { useAuthStore } from './stores/auth'
import { routeTree } from './routeTree.gen'

export const router = createRouter({
  routeTree,
  context: {
    auth: undefined!, // Will be provided at render
  },
})
```

### Providing Store to Router

```tsx
// main.tsx
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import { useAuthStore } from './stores/auth'

function App() {
  const auth = useAuthStore()

  return <RouterProvider router={router} context={{ auth }} />
}
```

### Protected Routes with Zustand

```tsx
// routes/_authenticated.tsx
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: '/login' })
    }
  },
})
```

### Using Store in Components

```tsx
// routes/_authenticated/profile.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useAuthStore } from '../../stores/auth'

export const Route = createFileRoute('/_authenticated/profile')({
  component: ProfilePage,
})

function ProfilePage() {
  const { user, logout } = useAuthStore()
  const navigate = Route.useNavigate()

  const handleLogout = () => {
    logout()
    navigate({ to: '/login' })
  }

  return (
    <div>
      <h1>Welcome, {user?.name}</h1>
      <button onClick={handleLogout}>Logout</button>
    </div>
  )
}
```

### Persisted Store

```tsx
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist<AuthStore>(
    (set) => ({
      user: null,
      isAuthenticated: false,
      login: (user) => set({ user, isAuthenticated: true }),
      logout: () => set({ user: null, isAuthenticated: false }),
    }),
    {
      name: 'auth-storage',
    },
  ),
)
```

## Jotai

### Installation

```bash
npm install jotai
```

### Basic Atoms

```tsx
// atoms/auth.ts
import { atom } from 'jotai'

interface User {
  id: string
  name: string
}

export const userAtom = atom<User | null>(null)
export const isAuthenticatedAtom = atom((get) => get(userAtom) !== null)
```

### Provider Setup

```tsx
// routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Provider } from 'jotai'

export const Route = createRootRoute({
  component: () => (
    <Provider>
      <Outlet />
    </Provider>
  ),
})
```

### Using Atoms in Routes

```tsx
// routes/profile.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useAtom, useSetAtom } from 'jotai'
import { userAtom } from '../atoms/auth'

export const Route = createFileRoute('/profile')({
  component: ProfilePage,
})

function ProfilePage() {
  const [user, setUser] = useAtom(userAtom)
  const navigate = Route.useNavigate()

  const handleLogout = () => {
    setUser(null)
    navigate({ to: '/login' })
  }

  return (
    <div>
      <h1>{user?.name}</h1>
      <button onClick={handleLogout}>Logout</button>
    </div>
  )
}
```

### URL-Synced Atoms

```tsx
import { atom } from 'jotai'
import { atomWithLocation } from 'jotai-location'

// Sync atom with URL hash
export const hashAtom = atomWithLocation()

// Derived atom from search params
export const searchQueryAtom = atom(
  (get) => {
    const location = get(hashAtom)
    return new URLSearchParams(location.searchParams).get('q') || ''
  },
  (get, set, newQuery: string) => {
    const location = get(hashAtom)
    const params = new URLSearchParams(location.searchParams)
    params.set('q', newQuery)
    set(hashAtom, { ...location, searchParams: params.toString() })
  },
)
```

## Redux Toolkit

### Installation

```bash
npm install @reduxjs/toolkit react-redux
```

### Store Setup

```tsx
// store/index.ts
import { configureStore } from '@reduxjs/toolkit'
import authReducer from './authSlice'

export const store = configureStore({
  reducer: {
    auth: authReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
```

### Auth Slice

```tsx
// store/authSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface AuthState {
  user: { id: string; name: string } | null
  isAuthenticated: boolean
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
}

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    login: (state, action: PayloadAction<{ id: string; name: string }>) => {
      state.user = action.payload
      state.isAuthenticated = true
    },
    logout: (state) => {
      state.user = null
      state.isAuthenticated = false
    },
  },
})

export const { login, logout } = authSlice.actions
export default authSlice.reducer
```

### Provider Setup

```tsx
// routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Provider } from 'react-redux'
import { store } from '../store'

export const Route = createRootRoute({
  component: () => (
    <Provider store={store}>
      <Outlet />
    </Provider>
  ),
})
```

### Router Integration with Redux

```tsx
// router.tsx
import { createRouter } from '@tanstack/react-router'
import { store } from './store'
import { routeTree } from './routeTree.gen'

export const router = createRouter({
  routeTree,
  context: {
    store,
  },
})
```

### Protected Routes with Redux

```tsx
// routes/_authenticated.tsx
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context }) => {
    const state = context.store.getState()
    if (!state.auth.isAuthenticated) {
      throw redirect({ to: '/login' })
    }
  },
})
```

## Common Patterns

### Hydration with SSR

```tsx
// Zustand with SSR hydration
import { create } from 'zustand'

interface Store {
  count: number
  increment: () => void
}

export const useStore = create<Store>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}))

// In root component
function App({ initialState }) {
  // Hydrate store on mount
  useEffect(() => {
    if (initialState) {
      useStore.setState(initialState)
    }
  }, [])

  return <RouterProvider router={router} />
}
```

### Selective Re-renders

```tsx
// Zustand with selectors
function UserName() {
  // Only re-renders when name changes
  const name = useAuthStore((state) => state.user?.name)
  return <span>{name}</span>
}

// Jotai with selectAtom
import { selectAtom } from 'jotai/utils'

const userNameAtom = selectAtom(userAtom, (user) => user?.name)

function UserName() {
  const name = useAtomValue(userNameAtom)
  return <span>{name}</span>
}
```

### Navigation Side Effects

```tsx
// Listen to navigation and update store
import { useEffect } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { useStore } from './stores/analytics'

function AnalyticsTracker() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const trackPageView = useStore((s) => s.trackPageView)

  useEffect(() => {
    trackPageView(pathname)
  }, [pathname, trackPageView])

  return null
}
```
