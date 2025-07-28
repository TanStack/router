# DRAFT: Content for "Validate Search Parameters with Schemas" Guide

## From navigate-with-search-params.md - Navigation with Validation Section

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

## From navigate-with-search-params.md - Common Problems Section

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

## TODO: This content should be moved to the validation guide when created