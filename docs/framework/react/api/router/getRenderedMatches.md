---
id: getRenderedMatchesFunction
title: getRenderedMatches function
---

The `getRenderedMatches` function returns an array of `RouteMatch` objects for all routes that are currently rendered, starting from the root route.

## getRenderedMatches options

The `getRenderedMatches` function accepts a single argument, the `state` which is the `RouterState` object of router.

- Type: [`RouterState`](./api/router/RouterStateType)
- Required

## getRenderedMatches returns

- Array of [`RouteMatch`](./api/router/RouteMatchType) objects for all rendered routes, starting from the root route.

## Examples

```tsx
import { redirect } from '@tanstack/react-router'

function App() {
  const router = useRouter()
  const matches = getRenderedMatches(router.state)
  const lastMatch = matches[matches.length - 1]

  // do something with lastMatch

  // print the last route search params
  console.log(lastMatch.search)
}
```
