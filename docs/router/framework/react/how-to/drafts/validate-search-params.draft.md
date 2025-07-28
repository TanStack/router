# DRAFT: Validate Search Parameters with Schemas

**Final Destination:** `docs/router/framework/react/how-to/validate-search-params.md`  
**Progressive Series Position:** Intermediate Level (Common Patterns) - Guide #3  
**Depends On:** `setup-basic-search-params.md`, `navigate-with-search-params.md`  
**Status:** Ready for implementation - substantial content available

---

## Content Staged from navigate-with-search-params.md

### Navigation with Validation

Validate search parameters before navigation:

```tsx
import { useNavigate } from '@tanstack/react-router'
import { z } from 'zod'

const searchSchema = z.object({
  query: z.string().min(1),
  page: z.number().int().positive(),
  category: z.string().optional(),
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

### Common Problems - Invalid Search Parameter Types

**Problem:** TypeScript errors when navigating with search parameters.

```tsx
// ❌ Wrong - number passed as string
navigate({ search: { page: '1' } }) // Type error if page expects number

// ✅ Correct - proper type conversion
navigate({ search: { page: 1 } })

// ✅ Alternative - parse string to number
const pageNum = parseInt(pageString) || 1
navigate({ search: { page: pageNum } })
```

### Common Problems - Search Parameter Serialization Issues

**Problem:** Complex objects don't serialize properly in URLs.

```tsx
// ❌ Wrong - complex object won't serialize properly
navigate({
  search: {
    filters: {
      nested: { value: 'complex' },
    },
  },
})

// ✅ Correct - flatten or stringify complex data
navigate({
  search: {
    filters: JSON.stringify({ nested: { value: 'complex' } }),
  },
})

// ✅ Better - use separate parameters
navigate({
  search: {
    filterType: 'nested',
    filterValue: 'complex',
  },
})
```

---

## Implementation Notes

### Additional Content Needed:

- [ ] Zod schema setup and configuration
- [ ] Valibot integration examples
- [ ] TypeScript integration patterns
- [ ] Error handling strategies
- [ ] Custom validation functions
- [ ] Schema composition patterns
- [ ] Runtime vs compile-time validation

### Cross-References to Add:

- Link to `setup-basic-search-params.md` for foundation
- Link to `navigate-with-search-params.md` for navigation patterns
- Forward link to `complex-search-param-types.md` for advanced types

### README Update Required:

- [ ] Mark guide as completed in progressive series
- [ ] Uncomment "Common Next Steps" in related guides
