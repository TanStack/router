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

## Method 2: Layout Route Sharing

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