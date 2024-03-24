---
title: Imperative State Access
---

Sometimes you need to access the state of the router without subscribing to any hooks like `useLoaderDeps`,`useSearch`,`useParams`, etc. This will allow you to prevent unwanted re-renders.

You can access the <b>current</b> router state with `useRouter().state`. Then use the `getRenderedMatches(state)` function from `@tanstack/react-router` to get the rendered route matches. This function will give you an array of all routes that are rendered currently, starting from the root route.

## Example

Here is a simple practical example where we want to use uncontrolled `<input>` to change the search param, without re-rendering the `<input>`:

```tsx
import { getRenderedMatches, useRouter } from '@tanstack/react-router'
import { useDebounceCallback } from "usehooks-ts"

function Search() {
  const router = useRouter()
  const matches = getRenderedMatches(router.state)
  const lastMatch = matches[matches.length - 1]

  const debouncedSearch = useDebounceCallback((e) => {
    router.navigate({ search: { q: e.target.value } })
  }, 300)

  return (
    <input
      defaultValue={lastMatch.search.q}
      onChange={debouncedSearch}
    />
  )
}
```

Here we are debouncing the change by 300ms, so we don't hammer the `router.navigate` on every key press.

## Caveats

Be aware that `getRenderedMatches` is not reactive. This means that you may end up with stale data, if your component is not rendered for a while. If you need always up-to-date data, use `useSearch`, `useParams`, `useLoaderDeps`, etc instead.