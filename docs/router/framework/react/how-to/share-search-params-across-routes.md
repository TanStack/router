---
title: Share Search Parameters Across Routes
---

# How to Share Search Parameters Across Routes

Learn to share search parameters across multiple routes, enabling consistent state management and complex navigation patterns that span your entire application.

## Quick Start

Share search parameters across routes using route context and middleware:

```tsx
// routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'

// Global search parameters shared across all routes
const globalSearchSchema = z.object({
  theme: z.enum(['light', 'dark']).default('light'),
  lang: z.enum(['en', 'es', 'fr']).default('en'),
  debug: z.boolean().default(false),
})

export const Route = createRootRoute({
  validateSearch: zodValidator(globalSearchSchema),
  component: RootComponent,
})

function RootComponent() {
  const { theme, lang, debug } = Route.useSearch()
  
  return (
    <div className={`app theme-${theme} lang-${lang}`}>
      {debug && <DebugPanel />}
      <Outlet />
    </div>
  )
}
```

```tsx
// routes/products/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'

const productSearchSchema = z.object({
  // Route-specific parameters
  page: z.number().default(1),
  category: z.string().default('all'),
})

export const Route = createFileRoute('/products/')({
  validateSearch: zodValidator(productSearchSchema),
  component: ProductsPage,
})

function ProductsPage() {
  // Route.useSearch() contains both local AND parent search params
  const search = Route.useSearch()
  
  return (
    <div>
      <h1>Products (Theme: {search.theme})</h1>
      <p>Page: {search.page}</p>
      <p>Category: {search.category}</p>
    </div>
  )
}
```

## Why Share Search Parameters?

**Common Use Cases:**
- **Global Settings**: Theme, language, debug flags
- **User Preferences**: Layout mode, timezone, accessibility settings
- **Analytics**: UTM parameters, tracking codes, referrers
- **Feature Flags**: A/B test variants, beta features
- **Navigation State**: Sidebar collapsed, modal open state

**Benefits:**
- **Consistent UX**: Settings persist across navigation
- **SEO-Friendly**: Shareable URLs with complete state
- **Developer Experience**: Centralized state management
- **Performance**: Avoid prop drilling and context overhead

## Method 1: Root Route Global Parameters

Share parameters at the application level using the root route.

### Basic Global Parameters

```tsx
// routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'

const globalSearchSchema = z.object({
  // User preferences
  theme: z.enum(['light', 'dark', 'auto']).default('auto'),
  lang: z.enum(['en', 'es', 'fr', 'de']).default('en'),
  
  // Layout preferences
  sidebar: z.enum(['expanded', 'collapsed']).default('expanded'),
  density: z.enum(['comfortable', 'compact']).default('comfortable'),
  
  // Analytics and tracking
  utm_source: z.string().optional(),
  utm_campaign: z.string().optional(),
  ref: z.string().optional(),
  
  // Debug and development
  debug: z.boolean().default(false),
  mock: z.boolean().default(false),
})

export const Route = createRootRoute({
  validateSearch: zodValidator(globalSearchSchema),
  component: RootComponent,
})

function RootComponent() {
  const search = Route.useSearch()
  
  // Apply global settings
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', search.theme)
    document.documentElement.setAttribute('data-density', search.density)
    document.documentElement.lang = search.lang
  }, [search.theme, search.density, search.lang])
  
  return (
    <div className={`app sidebar-${search.sidebar}`}>
      <Header />
      <main>
        <Outlet />
      </main>
      {search.debug && <DebugOverlay />}
    </div>
  )
}
```

### Accessing Global Parameters in Child Routes

```tsx
// routes/dashboard/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

const dashboardSearchSchema = z.object({
  // Dashboard-specific parameters
  view: z.enum(['grid', 'list']).default('grid'),
  period: z.enum(['day', 'week', 'month']).default('week'),
})

export const Route = createFileRoute('/dashboard/')({
  validateSearch: zodValidator(dashboardSearchSchema),
  component: DashboardPage,
})

function DashboardPage() {
  // Route.useSearch() contains both local AND parent search params
  const search = Route.useSearch()
  
  return (
    <div>
      <h1>Dashboard ({search.theme} theme)</h1>
      <ViewToggle view={search.view} />
      <PeriodSelector period={search.period} />
      <Analytics
        source={search.utm_source}
        campaign={search.utm_campaign}
      />
    </div>
  )
}
```

## Method 2: Shared Search Context

Create a context provider for complex shared search state.

### Search Context Provider

```tsx
// contexts/SearchContext.tsx
import React from 'react'
import { useRouter } from '@tanstack/react-router'
import { z } from 'zod'

// Shared search schema
export const sharedSearchSchema = z.object({
  workspace: z.string().default('default'),
  org: z.string().optional(),
  team: z.string().optional(),
  user: z.string().optional(),
})

type SharedSearch = z.infer<typeof sharedSearchSchema>

interface SearchContextValue {
  sharedSearch: SharedSearch
  updateSharedSearch: (updates: Partial<SharedSearch>) => void
  clearSharedSearch: () => void
}

const SearchContext = React.createContext<SearchContextValue | null>(null)

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const search = router.state.location.search
  
  const sharedSearch = React.useMemo(() => {
    return sharedSearchSchema.parse(search)
  }, [search])
  
  const updateSharedSearch = React.useCallback(
    (updates: Partial<SharedSearch>) => {
      router.navigate({
        search: (prev) => ({ ...prev, ...updates }),
      })
    },
    [router],
  )
  
  const clearSharedSearch = React.useCallback(() => {
    router.navigate({
      search: (prev) => {
        const { workspace, org, team, user, ...rest } = prev
        return rest
      },
    })
  }, [router])
  
  return (
    <SearchContext.Provider
      value={{ sharedSearch, updateSharedSearch, clearSharedSearch }}
    >
      {children}
    </SearchContext.Provider>
  )
}

export function useSharedSearch() {
  const context = React.useContext(SearchContext)
  if (!context) {
    throw new Error('useSharedSearch must be used within SearchProvider')
  }
  return context
}
```

### Using Shared Search Context

```tsx
// routes/projects/$projectId.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useSharedSearch } from '../contexts/SearchContext'

export const Route = createFileRoute('/projects/$projectId')({
  component: ProjectPage,
})

function ProjectPage() {
  const { projectId } = Route.useParams()
  const { sharedSearch, updateSharedSearch } = useSharedSearch()
  
  return (
    <div>
      <h1>Project {projectId}</h1>
      <p>Workspace: {sharedSearch.workspace}</p>
      <p>Organization: {sharedSearch.org || 'None'}</p>
      
      <WorkspaceSelector
        value={sharedSearch.workspace}
        onChange={(workspace) => updateSharedSearch({ workspace })}
      />
      
      <OrgSelector
        value={sharedSearch.org}
        onChange={(org) => updateSharedSearch({ org })}
      />
    </div>
  )
}
```

## Method 3: Search Parameter Middleware

Create reusable middleware for complex sharing patterns.

### Parameter Inheritance Middleware

```tsx
// utils/searchMiddleware.ts
import { z } from 'zod'

export function createSearchInheritance<T extends Record<string, any>>(
  parentSchema: z.ZodSchema<T>,
  childSchema: z.ZodSchema<any>,
) {
  return {
    validateSearch: (search: any) => {
      // Parse parent parameters
      const parentResult = parentSchema.safeParse(search)
      const childResult = childSchema.safeParse(search)
      
      if (!childResult.success) {
        throw childResult.error
      }
      
      // Merge parent and child parameters
      return {
        ...( parentResult.success ? parentResult.data : {}),
        ...childResult.data,
      }
    },
  }
}

// Example usage
const baseSearchSchema = z.object({
  theme: z.string().default('light'),
  lang: z.string().default('en'),
})

const productSearchSchema = z.object({
  category: z.string().default('all'),
  page: z.number().default(1),
})

export const productSearchMiddleware = createSearchInheritance(
  baseSearchSchema,
  productSearchSchema,
)
```

### Parameter Propagation Middleware

```tsx
// utils/searchPropagation.ts
import { useRouter } from '@tanstack/react-router'

export function createSearchPropagator(
  sharedParams: string[],
) {
  return function useSharedParams() {
    const router = useRouter()
    const currentSearch = router.state.location.search
    
    // Extract shared parameters
    const sharedSearch = Object.fromEntries(
      sharedParams
        .filter(param => param in currentSearch)
        .map(param => [param, currentSearch[param as keyof typeof currentSearch]])
    )
    
    // Navigate function that preserves shared parameters
    const navigateWithShared = React.useCallback(
      (options: any) => {
        router.navigate({
          ...options,
          search: (prev) => ({
            ...sharedSearch, // Always include shared params
            ...prev,
            ...(options.search || {}),
          }),
        })
      },
      [router, sharedSearch],
    )
    
    return {
      sharedSearch,
      navigateWithShared,
    }
  }
}

// Usage
const useAppSharedParams = createSearchPropagator([
  'theme',
  'lang',
  'workspace',
  'debug'
])

function ProductPage() {
  const { sharedSearch, navigateWithShared } = useAppSharedParams()
  
  return (
    <div>
      <h1>Products (Theme: {sharedSearch.theme})</h1>
      
      <Button
        onClick={() => navigateWithShared({
          to: '/products/$id',
          params: { id: '123' },
          search: { view: 'details' }, // Shared params preserved automatically
        })}
      >
        View Product Details
      </Button>
    </div>
  )
}
```

## Method 4: Layout Route Sharing

Share parameters through layout routes for section-specific state.

### Layout Route with Shared Parameters

```tsx
// routes/_authenticated.tsx
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { z } from 'zod'

const authSearchSchema = z.object({
  // Authentication-specific shared params
  impersonate: z.string().optional(),
  role: z.enum(['admin', 'user', 'viewer']).optional(),
  
  // UI state
  sidebar: z.boolean().default(true),
  notifications: z.boolean().default(true),
})

export const Route = createFileRoute('/_authenticated')({
  validateSearch: zodValidator(authSearchSchema),
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const search = Route.useSearch()
  
  return (
    <div className="authenticated-layout">
      {search.sidebar && <Sidebar />}
      
      <main className="main-content">
        {search.notifications && <NotificationBar />}
        <Outlet />
      </main>
      
      {search.impersonate && (
        <ImpersonationBanner user={search.impersonate} />
      )}
    </div>
  )
}
```

### Child Routes Accessing Layout Parameters

```tsx
// routes/_authenticated/dashboard.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  // Route.useSearch() contains both local AND parent search params
  const search = Route.useSearch()
  
  return (
    <div>
      <h1>Dashboard</h1>
      {search.impersonate && (
        <Alert>
          Currently impersonating: {search.impersonate}
        </Alert>
      )}
      
      <DashboardContent />
    </div>
  )
}
```

## Advanced Patterns

### Conditional Parameter Sharing

```tsx
// utils/conditionalSharing.ts
export function createConditionalSharing<T>(
  condition: (route: any) => boolean,
  sharedParams: (keyof T)[],
) {
  return function useConditionalSharedParams() {
    const router = useRouter()
    const currentRoute = router.state.location
    
    if (!condition(currentRoute)) {
      return { sharedParams: {}, navigate: router.navigate }
    }
    
    const shared = Object.fromEntries(
      sharedParams
        .filter(param => param in currentRoute.search)
        .map(param => [param, currentRoute.search[param as string]])
    )
    
    const navigate = (options: any) => {
      router.navigate({
        ...options,
        search: (prev) => ({ ...shared, ...prev, ...options.search }),
      })
    }
    
    return { sharedParams: shared, navigate }
  }
}

// Example: Only share admin params on admin routes
const useAdminSharedParams = createConditionalSharing(
  (route) => route.pathname.startsWith('/admin'),
  ['impersonate', 'debug', 'audit']
)
```

### Parameter Namespace Isolation

```tsx
// utils/namespaceSharing.ts
export function createNamespacedSharing(namespace: string) {
  return {
    encode: (params: Record<string, any>) => {
      return Object.fromEntries(
        Object.entries(params).map(([key, value]) => [
          `${namespace}.${key}`,
          value,
        ])
      )
    },
    
    decode: (search: Record<string, any>) => {
      const prefix = `${namespace}.`
      return Object.fromEntries(
        Object.entries(search)
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, value]) => [key.slice(prefix.length), value])
      )
    },
    
    navigate: (router: any, params: Record<string, any>) => {
      const encodedParams = encode(params)
      router.navigate({
        search: (prev) => ({ ...prev, ...encodedParams }),
      })
    },
  }
}

// Usage
const filterNamespace = createNamespacedSharing('filter')
const uiNamespace = createNamespacedSharing('ui')

// URL: ?filter.category=tech&filter.status=active&ui.sidebar=true&ui.theme=dark
function ProductsPage() {
  const router = useRouter()
  const search = router.state.location.search
  
  const filterParams = filterNamespace.decode(search)
  const uiParams = uiNamespace.decode(search)
  
  return (
    <div>
      <ProductFilters
        filters={filterParams}
        onChange={(filters) => filterNamespace.navigate(router, filters)}
      />
      
      <UIControls
        settings={uiParams}
        onChange={(settings) => uiNamespace.navigate(router, settings)}
      />
    </div>
  )
}
```

## Production Checklist

### ✅ Parameter Design

- [ ] **Clear ownership**: Define which parameters belong to which level (global, layout, route)
- [ ] **Avoid conflicts**: Use namespacing or prefixes to prevent parameter name collisions
- [ ] **Document sharing**: Clearly document which parameters are shared and how
- [ ] **Default values**: Provide sensible defaults for all shared parameters

### ✅ Performance Optimization

- [ ] **Memoization**: Memoize shared parameter parsing and context values
- [ ] **Selective updates**: Only trigger re-renders when relevant parameters change
- [ ] **Lazy loading**: Load shared parameter logic only when needed
- [ ] **Parameter cleanup**: Remove unused parameters from URLs

### ✅ Type Safety

- [ ] **Shared schemas**: Define TypeScript types for all shared parameter groups
- [ ] **Validation**: Validate shared parameters at route boundaries
- [ ] **Context typing**: Properly type context providers and consumers
- [ ] **Parameter inheritance**: Ensure child routes properly inherit parent types

### ✅ User Experience

- [ ] **URL readability**: Keep shared parameters minimal and human-readable
- [ ] **State persistence**: Preserve important shared state across navigation
- [ ] **Deep linking**: Ensure shared parameters work with direct URL access
- [ ] **Graceful degradation**: Handle missing or invalid shared parameters gracefully

## Common Problems

### Problem: Parameter Conflicts Between Routes

```tsx
// ❌ Problem: Both routes define 'filter' parameter differently
// routes/products.tsx
const productSearchSchema = z.object({
  filter: z.string(), // Product filter
})

// routes/users.tsx  
const userSearchSchema = z.object({
  filter: z.object({ // User filter object
    name: z.string(),
    role: z.string(),
  }),
})
```

**Solution**: Use namespacing or different parameter names:

```tsx
// ✅ Solution: Use distinct parameter names
// routes/products.tsx
const productSearchSchema = z.object({
  productFilter: z.string(),
})

// routes/users.tsx
const userSearchSchema = z.object({
  userFilter: z.object({
    name: z.string(),
    role: z.string(),
  }),
})

// Or use namespacing
const productSearchSchema = z.object({
  'product.filter': z.string(),
})
```

### Problem: Shared Parameters Not Persisting

```tsx
// ❌ Problem: Navigation doesn't preserve shared parameters
function ProductCard({ product }) {
  const router = useRouter()
  
  return (
    <div
      onClick={() => {
        router.navigate({
          to: '/products/$id',
          params: { id: product.id },
          // Missing: shared parameters are lost
        })
      }}
    >
      {product.name}
    </div>
  )
}
```

**Solution**: Always preserve shared parameters during navigation:

```tsx
// ✅ Solution: Preserve shared parameters
function ProductCard({ product }) {
  const router = useRouter()
  const currentSearch = router.state.location.search
  
  // Define which parameters to preserve
  const sharedParams = {
    theme: currentSearch.theme,
    lang: currentSearch.lang,
    workspace: currentSearch.workspace,
  }
  
  return (
    <div
      onClick={() => {
        router.navigate({
          to: '/products/$id',
          params: { id: product.id },
          search: (prev) => ({ ...sharedParams, ...prev }),
        })
      }}
    >
      {product.name}
    </div>
  )
}
```

### Problem: Complex Shared State Management

```tsx
// ❌ Problem: Manually tracking shared state everywhere
function useUserPreferences() {
  const router = useRouter()
  const search = router.state.location.search
  
  // Repeated in every component
  const theme = search.theme || 'light'
  const lang = search.lang || 'en'
  const sidebar = search.sidebar || true
  
  return { theme, lang, sidebar }
}
```

**Solution**: Create centralized shared state management:

```tsx
// ✅ Solution: Centralized shared state management
const sharedStateSchema = z.object({
  theme: z.enum(['light', 'dark']).default('light'),
  lang: z.enum(['en', 'es', 'fr']).default('en'),
  sidebar: z.boolean().default(true),
})

export function useSharedState() {
  const router = useRouter()
  const search = router.state.location.search
  
  const sharedState = React.useMemo(() => {
    return sharedStateSchema.parse(search)
  }, [search])
  
  const updateSharedState = React.useCallback(
    (updates: Partial<z.infer<typeof sharedStateSchema>>) => {
      router.navigate({
        search: (prev) => ({ ...prev, ...updates }),
      })
    },
    [router],
  )
  
  return { sharedState, updateSharedState }
}
```

### Problem: Performance Issues with Shared Parameters

```tsx
// ❌ Problem: Re-parsing shared parameters on every render
function MyComponent() {
  const router = useRouter()
  const search = router.state.location.search
  
  // Expensive parsing on every render
  const sharedParams = expensiveSharedParamSchema.parse(search)
  
  return <div>{/* component content */}</div>
}
```

**Solution**: Memoize expensive operations:

```tsx
// ✅ Solution: Memoize shared parameter parsing
function useSharedParams() {
  const router = useRouter()
  const search = router.state.location.search
  
  const sharedParams = React.useMemo(() => {
    return expensiveSharedParamSchema.parse(search)
  }, [search])
  
  return sharedParams
}

// Or use a context provider with memoization
const SharedParamsContext = React.createContext(null)

export function SharedParamsProvider({ children }) {
  const router = useRouter()
  const search = router.state.location.search
  
  const value = React.useMemo(() => {
    return expensiveSharedParamSchema.parse(search)
  }, [search])
  
  return (
    <SharedParamsContext.Provider value={value}>
      {children}
    </SharedParamsContext.Provider>
  )
}
```

<!--
## Common Next Steps

After implementing shared search parameters, you might want to:

- [Handle Search Parameters in Forms](./search-params-in-forms.md) - Integrate shared parameters with form state
- [Build Advanced Search Parameter Middleware](./advanced-search-param-middleware.md) - Create reusable parameter sharing logic
- [Optimize Search Parameter Performance](./optimize-search-param-performance.md) - Improve performance of complex parameter sharing
- [Debug Search Parameter Issues](./debug-search-param-issues.md) - Troubleshoot parameter sharing problems
-->

## Related Resources

- [Set Up Basic Search Parameters](./setup-basic-search-params.md) - Learn search parameter fundamentals
- [Navigate with Search Parameters](./navigate-with-search-params.md) - Navigate while preserving search state
- [Validate Search Parameters with Schemas](./validate-search-params.md) - Add type safety to shared parameters
- [Work with Arrays, Objects, and Dates](./arrays-objects-dates-search-params.md) - Handle complex shared data types
- [Router Context Guide](../guide/router-context.md) - Understanding router context patterns