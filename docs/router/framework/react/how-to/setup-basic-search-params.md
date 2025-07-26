---
title: Set Up Basic Search Parameters
---

# How to Set Up Basic Search Parameters

Learn how to add type-safe search parameters to your TanStack Router routes. This guide covers the fundamentals of search parameter validation, reading values, and basic type safety.

## Quick Start

Add search parameter validation to a route and read the values in your component:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/products')({
  validateSearch: (search: Record<string, unknown>) => ({
    page: Number(search.page) || 1,
    category: (search.category as string) || 'all',
    showSale: Boolean(search.showSale),
  }),
  component: ProductsPage,
})

function ProductsPage() {
  const { page, category, showSale } = Route.useSearch()
  
  return (
    <div>
      <h1>Products</h1>
      <p>Page: {page}</p>
      <p>Category: {category}</p>
      <p>Show Sale Items: {showSale ? 'Yes' : 'No'}</p>
    </div>
  )
}
```

## Step-by-Step Setup

### Step 1: Define Your Search Parameters

Start by identifying what search parameters your route needs. Common examples include:

- **Pagination:** `page`, `limit`, `offset`
- **Filtering:** `category`, `status`, `type`
- **Settings:** `sort`, `view`, `theme`
- **Flags:** `debug`, `preview`, `expanded`

### Step 2: Add Search Validation

Use the `validateSearch` option to define and validate your search parameters:

```tsx
// Basic validation with type coercion
export const Route = createFileRoute('/shop')({
  validateSearch: (search: Record<string, unknown>) => ({
    // Number with default value
    page: Number(search.page) || 1,
    
    // String with default value
    sort: (search.sort as string) || 'name',
    
    // Boolean flag
    showOnlyInStock: Boolean(search.showOnlyInStock),
    
    // Optional string
    searchTerm: search.searchTerm as string | undefined,
  }),
  component: ShopPage,
})
```

### Step 3: Read Search Parameters in Components

Use the route's `useSearch()` hook to access validated search parameters:

```tsx
function ShopPage() {
  const searchParams = Route.useSearch()
  
  // All properties are type-safe and validated
  const { page, sort, showOnlyInStock, searchTerm } = searchParams
  
  return (
    <div>
      <h1>Shop - Page {page}</h1>
      <div>Sort by: {sort}</div>
      <div>In stock only: {showOnlyInStock ? 'Yes' : 'No'}</div>
      {searchTerm && <div>Searching for: "{searchTerm}"</div>}
    </div>
  )
}
```

### Step 4: Handle Different Data Types

TanStack Router supports all JSON-serializable types:

```tsx
export const Route = createFileRoute('/dashboard')({
  validateSearch: (search: Record<string, unknown>) => ({
    // Numbers
    userId: Number(search.userId) || 0,
    refreshInterval: Number(search.refreshInterval) || 5000,
    
    // Strings
    theme: (search.theme as string) || 'light',
    timezone: search.timezone as string | undefined,
    
    // Booleans (TanStack Router auto-converts "true"/"false" to booleans)
    autoRefresh: Boolean(search.autoRefresh),
    debugMode: Boolean(search.debugMode),
    
    // Arrays (parsed from JSON)
    selectedIds: Array.isArray(search.selectedIds) 
      ? search.selectedIds.map(Number) 
      : [],
      
    // Objects (parsed from JSON)
    filters: typeof search.filters === 'object' && search.filters !== null
      ? search.filters as Record<string, string>
      : {},
  }),
  component: DashboardPage,
})
```

## Common Search Parameter Patterns

### Pagination

```tsx
export const Route = createFileRoute('/posts')({
  validateSearch: (search: Record<string, unknown>) => ({
    page: Math.max(1, Number(search.page) || 1),
    limit: Math.min(100, Math.max(10, Number(search.limit) || 20)),
  }),
  component: PostsPage,
})

function PostsPage() {
  const { page, limit } = Route.useSearch()
  
  // Calculate offset for API calls
  const offset = (page - 1) * limit
  
  return (
    <div>
      <h1>Posts (Page {page})</h1>
      <p>Showing {limit} posts per page</p>
      {/* Render posts... */}
    </div>
  )
}
```

### Filtering with Enums

```tsx
type SortOption = 'name' | 'date' | 'price'
type CategoryOption = 'electronics' | 'clothing' | 'books' | 'all'

export const Route = createFileRoute('/catalog')({
  validateSearch: (search: Record<string, unknown>) => {
    const validSorts: SortOption[] = ['name', 'date', 'price']
    const validCategories: CategoryOption[] = ['electronics', 'clothing', 'books', 'all']
    
    return {
      sort: validSorts.includes(search.sort as SortOption) 
        ? (search.sort as SortOption) 
        : 'name',
      category: validCategories.includes(search.category as CategoryOption)
        ? (search.category as CategoryOption)
        : 'all',
      ascending: search.ascending === false ? false : true, // Default to true
    }
  },
  component: CatalogPage,
})
```

### Search with Defaults

```tsx
const DEFAULT_SEARCH = {
  query: '',
  category: 'all',
  minPrice: 0,
  maxPrice: 1000,
  inStock: false,
} as const

export const Route = createFileRoute('/search')({
  validateSearch: (search: Record<string, unknown>) => ({
    query: (search.query as string) || DEFAULT_SEARCH.query,
    category: (search.category as string) || DEFAULT_SEARCH.category,
    minPrice: Number(search.minPrice) || DEFAULT_SEARCH.minPrice,
    maxPrice: Number(search.maxPrice) || DEFAULT_SEARCH.maxPrice,
    inStock: search.inStock !== undefined 
      ? Boolean(search.inStock) 
      : DEFAULT_SEARCH.inStock,
  }),
  component: SearchPage,
})
```

## Reading Search Parameters Outside Components

### Using getRouteApi

If your component is code-split or in a separate file:

```tsx
// components/ProductFilters.tsx
import { getRouteApi } from '@tanstack/react-router'

const routeApi = getRouteApi('/products')

export function ProductFilters() {
  const { category, sort, showSale } = routeApi.useSearch()
  
  return (
    <div>
      <select value={category}>
        <option value="all">All Categories</option>
        <option value="electronics">Electronics</option>
        <option value="clothing">Clothing</option>
      </select>
      {/* More filters... */}
    </div>
  )
}
```

### Using useSearch with from

```tsx
import { useSearch } from '@tanstack/react-router'

function GenericSearchDisplay() {
  const search = useSearch({ from: '/products' })
  
  return (
    <div>
      Current search: {JSON.stringify(search)}
    </div>
  )
}
```

## Production Checklist

- [ ] **Search validation** handles all expected input types
- [ ] **Default values** are provided for all optional parameters
- [ ] **Type safety** is maintained throughout the component
- [ ] **Edge cases** are handled (invalid numbers, empty strings, etc.)
- [ ] **URL limits** are considered (very long search params may be truncated)
- [ ] **Security** - search parameters are validated and not directly used in database queries

## Common Problems

### Problem: Search Parameters Are Always Undefined

**Cause:** Missing or incorrect `validateSearch` function.

**Solution:** Ensure `validateSearch` is defined and returns an object:

```tsx
// ❌ Missing validateSearch
export const Route = createFileRoute('/page')({
  component: MyPage,
})

// ✅ Correct validateSearch
export const Route = createFileRoute('/page')({
  validateSearch: (search) => ({
    param: search.param as string,
  }),
  component: MyPage,
})
```

### Problem: Numbers Are Coming Through as Strings

**Cause:** Search parameters are always strings from the URL.

**Solution:** Use type coercion in `validateSearch`:

```tsx
// ❌ No type coercion
validateSearch: (search) => ({
  page: search.page, // This will be a string "1", not number 1
})

// ✅ Proper type coercion
validateSearch: (search) => ({
  page: Number(search.page) || 1,
})
```

### Problem: Boolean Flags Not Working

**Cause:** Understanding how TanStack Router parses boolean values.

**Solution:** TanStack Router automatically converts JSON values. Handle booleans properly:

```tsx
validateSearch: (search) => ({
  // TanStack Router converts "true"/"false" strings to actual booleans
  explicitFlag: Boolean(search.explicitFlag),
  
  // For ?flag (presence = true, absence = false) - presence gives empty string
  presenceFlag: search.presenceFlag === '' || search.presenceFlag === true,
  
  // Simple boolean conversion works for most cases
  safeBooleanFlag: Boolean(search.safeBooleanFlag),
})
```

### Problem: TypeScript Errors with Search Parameters

**Cause:** TypeScript can't infer the return type of `validateSearch`.

**Solution:** Define a type for your search parameters:

```tsx
type ProductSearch = {
  page: number
  category: string
  showSale: boolean
}

export const Route = createFileRoute('/products')({
  validateSearch: (search: Record<string, unknown>): ProductSearch => ({
    page: Number(search.page) || 1,
    category: (search.category as string) || 'all',
    showSale: Boolean(search.showSale),
  }),
  component: ProductsPage,
})
```

## Common Next Steps

<!-- Uncomment when guides are available
- [Navigate with Search Parameters](./navigate-with-search-params.md) - Learn to update search params with Links and navigation
- [Validate Search Parameters with Schemas](./validate-search-params.md) - Use Zod or Valibot for robust validation
-->

## Related Resources

- [Search Parameters Guide](../guide/search-params.md) - Comprehensive search parameters documentation
- [Type Safety Guide](../guide/type-safety.md) - Understanding TanStack Router's type safety
- [Route API Reference](../api/router/RouteOptionsType.md) - Complete route configuration options

## Testing

This guide's examples are tested in `packages/react-router/tests/how-to-basic-search-params.test.tsx` to ensure all patterns work correctly.