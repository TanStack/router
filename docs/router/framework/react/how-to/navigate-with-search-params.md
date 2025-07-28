# How to Navigate with Search Parameters

This guide covers updating and managing search parameters during navigation using TanStack Router's Link components and programmatic navigation methods.

## Quick Start

Configure navigation that updates search parameters while preserving existing state:

```tsx
import { Link, useNavigate } from '@tanstack/react-router'

// Link with search parameter updates
<Link 
  to="/search"
  search={(prev) => ({ ...prev, query: 'new search' })}
>
  Search for "new search"
</Link>

// Programmatic navigation
const navigate = useNavigate()
navigate({ 
  to: '/search',
  search: (prev) => ({ ...prev, page: 1 })
})
```

## Navigation Methods

### Using Link Components

#### Basic Search Parameter Updates

Replace all search parameters:

```tsx
import { Link } from '@tanstack/react-router'

function SearchForm() {
  return (
    <div>
      {/* Replace all search params */}
      <Link to="/products" search={{ category: 'electronics', page: 1 }}>
        Electronics
      </Link>
      
      {/* Navigate to same route with new search */}
      <Link search={{ sort: 'price-asc' }}>
        Sort by Price
      </Link>
    </div>
  )
}
```

#### Functional Search Parameter Updates

Merge with existing search parameters:

```tsx
import { Link } from '@tanstack/react-router'

function Pagination() {
  return (
    <div>
      {/* Preserve existing search, update page */}
      <Link search={(prev) => ({ ...prev, page: (prev.page || 1) + 1 })}>
        Next Page
      </Link>
      
      {/* Toggle filter while keeping other params */}
      <Link 
        search={(prev) => ({ 
          ...prev, 
          inStock: !prev.inStock 
        })}
      >
        Toggle In Stock
      </Link>
      
      {/* Remove a search parameter */}
      <Link 
        search={(prev) => {
          const { category, ...rest } = prev
          return rest
        }}
      >
        Clear Category Filter
      </Link>
    </div>
  )
}
```

#### Navigation with Route Changes

Navigate to different routes with search parameters:

```tsx
import { Link } from '@tanstack/react-router'

function Navigation() {
  return (
    <nav>
      {/* Navigate to different route with search */}
      <Link 
        to="/search" 
        search={{ query: 'laptops', category: 'electronics' }}
      >
        Search Laptops
      </Link>
      
      {/* Inherit current search params to new route */}
      <Link 
        to="/products"
        search={(prev) => prev} // Carry over all search params
      >
        View Products
      </Link>
      
      {/* Transform search params for new route */}
      <Link 
        to="/advanced-search"
        search={(prev) => ({ 
          q: prev.query,  // Rename parameter
          filters: {
            category: prev.category,
            inStock: prev.inStock
          }
        })}
      >
        Advanced Search
      </Link>
    </nav>
  )
}
```

### Programmatic Navigation

#### Using useNavigate Hook

Navigate programmatically with search parameter updates:

```tsx
import { useNavigate } from '@tanstack/react-router'

function SearchControls() {
  const navigate = useNavigate()
  
  const handleSortChange = (sortBy: string) => {
    navigate({
      search: (prev) => ({ ...prev, sort: sortBy, page: 1 })
    })
  }
  
  const handleClearFilters = () => {
    navigate({
      search: (prev) => {
        const { category, minPrice, maxPrice, ...rest } = prev
        return rest
      }
    })
  }
  
  const handleSearch = (query: string) => {
    navigate({
      to: '/search',
      search: { query, page: 1 }
    })
  }
  
  return (
    <div>
      <select onChange={(e) => handleSortChange(e.target.value)}>
        <option value="relevance">Sort by Relevance</option>
        <option value="price-asc">Price: Low to High</option>
        <option value="price-desc">Price: High to Low</option>
      </select>
      
      <button onClick={handleClearFilters}>
        Clear Filters
      </button>
      
      <button onClick={() => handleSearch('latest products')}>
        Search Latest
      </button>
    </div>
  )
}
```

#### Navigation with Router Instance

Use the router directly only in non-React contexts where `useNavigate` or `Link` aren't available:

```tsx
import { router } from './router' // Your router instance

// ✅ Appropriate use case: Utility function outside React components
export function navigateFromUtility(searchParams: Record<string, any>) {
  router.navigate({
    search: (prev) => ({ ...prev, ...searchParams })
  })
}

// ✅ Appropriate use case: Event handlers in non-React code
class ApiService {
  onAuthError() {
    // Navigate to login when auth fails
    router.navigate({
      to: '/login',
      search: { redirect: window.location.pathname }
    })
  }
}

// ✅ Appropriate use case: Global error handler
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason.status === 401) {
    router.navigate({
      to: '/login',
      search: { error: 'session-expired' }
    })
  }
})
```

**⚠️ In React components, prefer `useNavigate` instead:**

```tsx
// ❌ Avoid in React components
function Component() {
  const router = useRouter()
  
  const handleClick = () => {
    router.navigate({ search: { filter: 'active' } })
  }
  
  return <button onClick={handleClick}>Filter</button>
}

// ✅ Use useNavigate in React components
function Component() {
  const navigate = useNavigate()
  
  const handleClick = () => {
    navigate({ search: { filter: 'active' } })
  }
  
  return <button onClick={handleClick}>Filter</button>
}
```

## Advanced Navigation Patterns

### Conditional Navigation

Navigate only when certain conditions are met:

```tsx
import { Link, useSearch } from '@tanstack/react-router'

function ConditionalNavigation() {
  const search = useSearch({ from: '/products' })
  
  return (
    <div>
      {/* Only show if not already filtered */}
      {!search.category && (
        <Link search={{ category: 'electronics' }}>
          Filter Electronics
        </Link>
      )}
      
      {/* Conditional parameter updates */}
      <Link 
        search={(prev) => ({
          ...prev,
          ...(prev.query && { page: 1 }), // Reset page if query exists
          premium: !prev.premium
        })}
      >
        Toggle Premium
      </Link>
    </div>
  )
}
```

### Navigation with Validation

Validate search parameters before navigation:

```tsx
import { useNavigate } from '@tanstack/react-router'
import { z } from 'zod'

const searchSchema = z.object({
  query: z.string().min(1),
  page: z.number().int().positive(),
  category: z.string().optional()
})

function ValidatedNavigation() {
  const navigate = useNavigate()
  
  const safeNavigate = (newSearch: Record<string, any>) => {
    try {
      const validated = searchSchema.parse(newSearch)
      navigate({ search: validated })
    } catch (error) {
      console.error('Invalid search parameters:', error)
      // Handle validation error (show toast, etc.)
    }
  }
  
  const handleFormSubmit = (formData: FormData) => {
    const query = formData.get('query') as string
    const page = parseInt(formData.get('page') as string) || 1
    
    safeNavigate({ query, page })
  }
  
  return (
    <form action={handleFormSubmit}>
      <input name="query" placeholder="Search..." required />
      <input name="page" type="number" defaultValue="1" />
      <button type="submit">Search</button>
    </form>
  )
}
```

### Navigation with State Synchronization

Keep component state in sync with URL search parameters:

```tsx
import { useState, useEffect } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'

function SynchronizedForm() {
  const navigate = useNavigate()
  const search = useSearch({ from: '/products' })
  
  // Local state synced with URL
  const [localFilters, setLocalFilters] = useState({
    minPrice: search.minPrice || 0,
    maxPrice: search.maxPrice || 1000,
    inStock: search.inStock || false
  })
  
  // Update local state when URL changes
  useEffect(() => {
    setLocalFilters({
      minPrice: search.minPrice || 0,
      maxPrice: search.maxPrice || 1000,
      inStock: search.inStock || false
    })
  }, [search.minPrice, search.maxPrice, search.inStock])
  
  const applyFilters = () => {
    navigate({
      search: (prev) => ({
        ...prev,
        ...localFilters,
        page: 1 // Reset pagination
      })
    })
  }
  
  const resetFilters = () => {
    const defaultFilters = { minPrice: 0, maxPrice: 1000, inStock: false }
    setLocalFilters(defaultFilters)
    
    navigate({
      search: (prev) => {
        const { minPrice, maxPrice, inStock, ...rest } = prev
        return rest
      }
    })
  }
  
  return (
    <div>
      <label>
        Min Price: 
        <input 
          type="number" 
          value={localFilters.minPrice}
          onChange={(e) => setLocalFilters(prev => ({
            ...prev, 
            minPrice: parseInt(e.target.value) || 0
          }))}
        />
      </label>
      
      <label>
        Max Price: 
        <input 
          type="number" 
          value={localFilters.maxPrice}
          onChange={(e) => setLocalFilters(prev => ({
            ...prev, 
            maxPrice: parseInt(e.target.value) || 1000
          }))}
        />
      </label>
      
      <label>
        <input 
          type="checkbox" 
          checked={localFilters.inStock}
          onChange={(e) => setLocalFilters(prev => ({
            ...prev, 
            inStock: e.target.checked
          }))}
        />
        In Stock Only
      </label>
      
      <button onClick={applyFilters}>Apply Filters</button>
      <button onClick={resetFilters}>Reset</button>
    </div>
  )
}
```

## Common Patterns

### Search Result Navigation

Handle search result navigation with query preservation:

```tsx
import { Link, useSearch } from '@tanstack/react-router'

function SearchResults() {
  const search = useSearch({ from: '/search' })
  
  return (
    <div>
      {/* Preserve search query, change view */}
      <nav>
        <Link search={(prev) => ({ ...prev, view: 'grid' })}>
          Grid View
        </Link>
        <Link search={(prev) => ({ ...prev, view: 'list' })}>
          List View
        </Link>
      </nav>
      
      {/* Pagination with query preservation */}
      <div>
        {search.page > 1 && (
          <Link search={(prev) => ({ ...prev, page: prev.page - 1 })}>
            Previous
          </Link>
        )}
        
        <Link search={(prev) => ({ ...prev, page: (prev.page || 1) + 1 })}>
          Next
        </Link>
      </div>
      
      {/* Related searches */}
      <div>
        Related searches:
        {[
          'laptops gaming',
          'laptops business', 
          'laptops student'
        ].map(suggestion => (
          <Link 
            key={suggestion}
            search={(prev) => ({ ...prev, query: suggestion, page: 1 })}
          >
            {suggestion}
          </Link>
        ))}
      </div>
    </div>
  )
}
```

### Filter Navigation

Build filtering interfaces with search parameter navigation:

```tsx
import { Link, useSearch } from '@tanstack/react-router'

const categories = ['electronics', 'clothing', 'books', 'home']
const sortOptions = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'rating', label: 'Customer Rating' }
]

function FilterNavigation() {
  const search = useSearch({ from: '/products' })
  
  return (
    <aside>
      {/* Category filters */}
      <div>
        <h3>Categories</h3>
        {categories.map(category => (
          <Link
            key={category}
            search={(prev) => ({
              ...prev,
              category: prev.category === category ? undefined : category,
              page: 1
            })}
            className={search.category === category ? 'active' : ''}
          >
            {category}
          </Link>
        ))}
      </div>
      
      {/* Sort options */}
      <div>
        <h3>Sort By</h3>
        {sortOptions.map(option => (
          <Link
            key={option.value}
            search={(prev) => ({ ...prev, sort: option.value, page: 1 })}
            className={search.sort === option.value ? 'active' : ''}
          >
            {option.label}
          </Link>
        ))}
      </div>
      
      {/* Clear all filters */}
      <Link
        search={(prev) => {
          const { category, sort, minPrice, maxPrice, ...rest } = prev
          return rest
        }}
      >
        Clear All Filters
      </Link>
    </aside>
  )
}
```

### Breadcrumb Navigation

Create breadcrumbs that maintain search state:

```tsx
import { Link, useRouterState } from '@tanstack/react-router'

function Breadcrumbs() {
  const routerState = useRouterState()
  const currentSearch = routerState.location.search
  
  return (
    <nav aria-label="Breadcrumb">
      <ol>
        <li>
          <Link to="/" search={{}}>Home</Link>
        </li>
        
        {currentSearch.category && (
          <li>
            <Link 
              to="/products"
              search={(prev) => ({ 
                category: prev.category,
                // Preserve category, clear other filters
                page: 1
              })}
            >
              {currentSearch.category}
            </Link>
          </li>
        )}
        
        {currentSearch.query && (
          <li>
            <Link 
              to="/search"
              search={(prev) => ({ 
                query: prev.query,
                page: 1
              })}
            >
              Search: "{currentSearch.query}"
            </Link>
          </li>
        )}
      </ol>
    </nav>
  )
}
```

## Common Problems

### Search Parameters Not Updating

**Problem:** Link navigation doesn't update search parameters.

```tsx
// ❌ Wrong - no search prop
<Link to="/products">Electronics</Link>

// ✅ Correct - with search parameters
<Link to="/products" search={{ category: 'electronics' }}>
  Electronics
</Link>
```

### Losing Existing Search Parameters

**Problem:** New navigation replaces all search parameters instead of updating specific ones.

```tsx
// ❌ Wrong - replaces all search params
<Link search={{ page: 2 }}>Next Page</Link>

// ✅ Correct - preserves existing search params
<Link search={(prev) => ({ ...prev, page: 2 })}>
  Next Page
</Link>
```

### Invalid Search Parameter Types

**Problem:** TypeScript errors when navigating with search parameters.

```tsx
// ❌ Wrong - number passed as string
navigate({ search: { page: "1" } }) // Type error if page expects number

// ✅ Correct - proper type conversion
navigate({ search: { page: 1 } })

// ✅ Alternative - parse string to number
const pageNum = parseInt(pageString) || 1
navigate({ search: { page: pageNum } })
```

### Navigation During Render

**Problem:** Calling navigate during component render causes infinite loops.

```tsx
function ProblematicComponent() {
  const navigate = useNavigate()
  
  // ❌ Wrong - navigate during render
  if (someCondition) {
    navigate({ search: { redirect: true } })
  }
  
  return <div>Content</div>
}

function FixedComponent() {
  const navigate = useNavigate()
  
  // ✅ Correct - navigate in effect
  useEffect(() => {
    if (someCondition) {
      navigate({ search: { redirect: true } })
    }
  }, [someCondition, navigate])
  
  return <div>Content</div>
}
```

### Search Parameter Serialization Issues

**Problem:** Complex objects don't serialize properly in URLs.

```tsx
// ❌ Wrong - complex object won't serialize properly
navigate({ 
  search: { 
    filters: { 
      nested: { value: 'complex' } 
    } 
  } 
})

// ✅ Correct - flatten or stringify complex data
navigate({ 
  search: { 
    filters: JSON.stringify({ nested: { value: 'complex' } })
  } 
})

// ✅ Better - use separate parameters
navigate({ 
  search: { 
    filterType: 'nested',
    filterValue: 'complex'
  } 
})
```

### Performance Issues with Functional Updates

**Problem:** Complex functional updates cause unnecessary re-renders.

```tsx
// ❌ Wrong - complex computation in render
<Link search={(prev) => {
  // Expensive computation on every render
  const result = expensiveCalculation(prev)
  return { ...prev, computed: result }
}}>
  Update
</Link>

// ✅ Correct - memoize or use callback
const updateSearch = useCallback((prev) => {
  const result = expensiveCalculation(prev)
  return { ...prev, computed: result }
}, [])

<Link search={updateSearch}>Update</Link>
```

## Related Resources

<!-- Next steps will be uncommented as guides become available
## Common Next Steps

After setting up navigation with search parameters, you might want to:

- [Validate Search Parameters with Schemas](./validate-search-params.md) - Add schema validation for robust type safety
- [Handle Complex Search Parameter Types](./complex-search-param-types.md) - Work with arrays, objects, and dates
- [Share Search Parameters Across Routes](./share-search-params-across-routes.md) - Inherit search params in route hierarchies
-->

- [TanStack Router Search Params Guide](https://tanstack.com/router/latest/docs/framework/react/guide/search-params) - Official search parameters documentation
- [Set Up Basic Search Parameters](./setup-basic-search-params.md) - Foundation guide for search parameter setup
- [TanStack Router Navigation API](https://tanstack.com/router/latest/docs/framework/react/api/router/useNavigateFunction) - Complete navigation API reference