---
name: testing-integration
---

# Testing Integration

Setting up comprehensive testing for TanStack Router applications.

## Test Framework Setup

### Vitest (Recommended)

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    typecheck: { enabled: true },
  },
})
```

```ts
// src/test/setup.ts
import '@testing-library/jest-dom/vitest'

// @ts-expect-error
global.IS_REACT_ACT_ENVIRONMENT = true
```

### Jest

```bash
npm install -D jest @testing-library/react @testing-library/jest-dom @testing-library/user-event jest-environment-jsdom
```

## Router Test Utilities

### Internal Pattern (TanStack Team Approach)

```tsx
import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import {
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import type { RouterHistory } from '@tanstack/react-router'

let history: RouterHistory

beforeEach(() => {
  history = createBrowserHistory()
  expect(window.location.pathname).toBe('/')
})

afterEach(() => {
  history.destroy()
  window.history.replaceState(null, 'root', '/')
  vi.clearAllMocks()
  cleanup()
})

test('should render route component', async () => {
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <h1>Home</h1>,
  })

  const routeTree = rootRoute.addChildren([indexRoute])
  const router = createRouter({ routeTree, history })

  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Home')).toBeInTheDocument()
})
```

### Memory History for Tests

```tsx
import { createMemoryHistory, createRouter } from '@tanstack/react-router'

function createTestRouter(routes, initialLocation = '/') {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const routeTree = rootRoute.addChildren(routes)

  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialLocation] }),
  })
}
```

## Testing Route Components

### Basic Component Test

```tsx
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { createRoute } from '@tanstack/react-router'

test('should render component', async () => {
  const testRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div data-testid="test">Hello</div>,
  })

  const router = createTestRouter([testRoute])
  render(<RouterProvider router={router} />)

  expect(await screen.findByTestId('test')).toBeInTheDocument()
})
```

### Testing Route Parameters

```tsx
test('should handle route params', async () => {
  function UserProfile() {
    const { userId } = Route.useParams()
    return <div>User: {userId}</div>
  }

  const userRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/users/$userId',
    component: UserProfile,
  })

  const router = createTestRouter([userRoute], '/users/123')
  render(<RouterProvider router={router} />)

  expect(await screen.findByText('User: 123')).toBeInTheDocument()
})
```

### Testing Search Params

```tsx
test('should handle search params', async () => {
  function SearchPage() {
    const { q, page } = Route.useSearch()
    return (
      <div>
        Query: {q}, Page: {page}
      </div>
    )
  }

  const searchRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/search',
    component: SearchPage,
    validateSearch: (search) => ({
      q: (search.q as string) || '',
      page: Number(search.page) || 1,
    }),
  })

  const router = createTestRouter([searchRoute], '/search?q=react&page=2')
  render(<RouterProvider router={router} />)

  expect(await screen.findByText('Query: react, Page: 2')).toBeInTheDocument()
})
```

## Testing Navigation

### Link Navigation

```tsx
import userEvent from '@testing-library/user-event'

test('should navigate when link clicked', async () => {
  const user = userEvent.setup()

  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <div>
        <h1>Home</h1>
        <Link to="/about">About</Link>
      </div>
    ),
  })

  const aboutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/about',
    component: () => <h1>About</h1>,
  })

  const router = createTestRouter([homeRoute, aboutRoute])
  render(<RouterProvider router={router} />)

  expect(await screen.findByText('Home')).toBeInTheDocument()

  await user.click(screen.getByText('About'))

  expect(await screen.findByText('About')).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/about')
})
```

### Programmatic Navigation

```tsx
test('should navigate programmatically', async () => {
  function NavigationTest() {
    const navigate = useNavigate()
    return (
      <button onClick={() => navigate({ to: '/dashboard' })}>
        Go to Dashboard
      </button>
    )
  }

  const testRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: NavigationTest,
  })

  const dashboardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/dashboard',
    component: () => <h1>Dashboard</h1>,
  })

  const router = createTestRouter([testRoute, dashboardRoute])
  render(<RouterProvider router={router} />)

  await userEvent.click(screen.getByRole('button'))

  expect(router.state.location.pathname).toBe('/dashboard')
})
```

## Testing Route Guards

```tsx
test('should redirect unauthenticated users', async () => {
  const protectedRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/protected',
    component: () => <h1>Protected</h1>,
    beforeLoad: () => {
      throw redirect({ to: '/login' })
    },
  })

  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    component: () => <h1>Login</h1>,
  })

  const router = createTestRouter([protectedRoute, loginRoute], '/protected')
  render(<RouterProvider router={router} />)

  expect(await screen.findByText('Login')).toBeInTheDocument()
})
```

## Testing Data Loading

```tsx
test('should load data from loader', async () => {
  const mockFetch = vi.fn().mockResolvedValue({ name: 'John' })

  function UserProfile() {
    const user = Route.useLoaderData()
    return <div>{user.name}</div>
  }

  const userRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/users/$userId',
    component: UserProfile,
    loader: ({ params }) => mockFetch(params.userId),
  })

  const router = createTestRouter([userRoute], '/users/1')
  render(<RouterProvider router={router} />)

  expect(await screen.findByText('John')).toBeInTheDocument()
  expect(mockFetch).toHaveBeenCalledWith('1')
})
```

## E2E Testing with Playwright

### Configuration

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

### E2E Test Example

```ts
// e2e/navigation.spec.ts
import { test, expect } from '@playwright/test'

test('should navigate between pages', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toContainText('Home')

  await page.click('text=About')
  await expect(page).toHaveURL('/about')
  await expect(page.locator('h1')).toContainText('About')

  await page.goBack()
  await expect(page).toHaveURL('/')
})

test('should handle search params', async ({ page }) => {
  await page.goto('/search?q=react')
  await expect(page.locator('[data-testid="search-input"]')).toHaveValue(
    'react',
  )
})
```

## Common Issues

### "window is not defined"

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    environment: 'jsdom', // Required
  },
})
```

### Router Context Missing

```tsx
// Always wrap with RouterProvider
render(<RouterProvider router={router} />)
```

### Async Data Not Loading

```tsx
// Use waitFor or findBy queries
await waitFor(() => {
  expect(screen.getByText('Loaded')).toBeInTheDocument()
})
```
