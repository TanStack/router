# DRAFT: Content for "Optimize Search Parameter Performance" Guide

## From navigate-with-search-params.md - Common Problems Section

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

## TODO: This content should be moved to the performance optimization guide when created