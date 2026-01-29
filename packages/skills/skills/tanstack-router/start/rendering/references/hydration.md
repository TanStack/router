# Hydration

Client-side hydration of server-rendered HTML.

## How Hydration Works

1. Server renders HTML with initial data
2. HTML sent to browser (user sees content)
3. JavaScript loads
4. React "hydrates" - attaches event listeners
5. App becomes interactive

## Hydration Errors

Common causes and fixes:

### Date/Time Mismatch

```tsx
// ❌ Bad - different on server vs client
function Component() {
  return <span>{new Date().toLocaleString()}</span>
}

// ✅ Good - use state for client values
function Component() {
  const [time, setTime] = useState<string>()

  useEffect(() => {
    setTime(new Date().toLocaleString())
  }, [])

  return <span>{time ?? 'Loading...'}</span>
}
```

### Browser-Only APIs

```tsx
// ❌ Bad - window doesn't exist on server
function Component() {
  return <span>{window.innerWidth}px</span>
}

// ✅ Good - check for client
function Component() {
  const [width, setWidth] = useState<number>()

  useEffect(() => {
    setWidth(window.innerWidth)
  }, [])

  if (!width) return null
  return <span>{width}px</span>
}
```

### Conditional Rendering

```tsx
// ❌ Bad - might differ server vs client
function Component() {
  return Math.random() > 0.5 ? <A /> : <B />
}

// ✅ Good - deterministic rendering
function Component({ showA }) {
  return showA ? <A /> : <B />
}
```

## Debugging Hydration

```tsx
// Temporarily disable SSR to isolate issue
export const Route = createFileRoute('/debug')({
  ssr: false,
})
```

## suppressHydrationWarning

```tsx
// For intentional mismatches (use sparingly)
<time suppressHydrationWarning>{new Date().toLocaleString()}</time>
```
