---
title: Code Splitting
---

The implementation of code splitting in TanStack Router depends on the framework you use, but there are some basic concepts to understand.

## Component Splitting

Route components in TanStack Router are usually just functions, but the exact signature might vary by framework. Regardless, these component values should use the same component identifier for whatever framework you're using. For example, in React, a component is usually represented by a simple function:

```tsx
function MyComponent() {
  return <div>My Component</div>
}

const route = new Route({
  component: MyComponent,
})
```

### Using the TanStack Router framework adapters `lazy` wrapper

Regardless of framework, if a route component has a static `preload` method attached to it, the Router will preload it when the route is matched with the `onLoad` option.

If we were to **set this up manually** (so... don't do this) in React, it would look something like this:

```tsx
const MyComponent = React.lazy(() => import('./MyComponent'))

MyComponent.preload = async () => {
  await import('./MyComponent')
}

const route = new Route({
  component: MyComponent,
})
```

This is a lot of boilerplate, so the React Router adapter exports a `lazy` wrapper that you can use to simplify this process. Each adapter, if necessary, will export a similar wrapper.

```tsx
import { lazy } from '@tanstack/router-react'

const route = new Route({
  component: lazy(() => import('./MyComponent')),
})
```

The `lazy` wrapper not only implements `React.lazy()`, but automatically sets up the component with a preload method and promise management for you.

## Data Loader Splitting

Regardless of which data loading library you decide to go with, you may end up with a lot of data loaders that could potentially contribute to a large bundle size. If this is the case, you can code split your data loading logic using the Route's `onLoad` option:

```tsx
const route = new Route({
  path: '/my-route',
  component: MyComponent,
  onLoad: async () => {
    const data = await import('./data')
    return { data }
  },
})
```
