---
title: Code Splitting
---

## Using `lazyRouteComponent`

Synchronous components are usually defined as functions and passed to the `route.component` option:

```tsx
function MyComponent() {
  return <div>My Component</div>
}

const route = new Route({
  component: MyComponent,
})
```

But with TanStack Router, a route component can have a static `preload` method attached to it which will get called and awaited when the route is matched and loaded.

If we were to **set this up manually (don't do this)**, it would look something like this:

```tsx
const MyComponent = React.lazy(() => import('./MyComponent'))

MyComponent.preload = async () => {
  await import('./MyComponent')
}

const route = new Route({
  component: MyComponent,
})
```

This is a bit noisy and repetitive, so the TanStack Router exports a `lazyRouteComponent` wrapper that you can use to simplify this process:

```tsx
import { lazyRouteComponent } from '@tanstack/router-react'

const route = new Route({
  component: lazyRouteComponent(() => import('./MyComponent')),
})
```

The `lazyRouteComponent` wrapper not only implements `React.lazy()` under the hood, but automatically sets up the component with a preload method and promise management for you.

### Handling Named exports with `lazyRouteComponent`

The `lazyRouteComponent` wrapper also allows you to easily load components that are named exports from a module. To use this functionality, provide the name of the exported component as a second argument to the function:

```tsx
const route = new Route({
  component: lazyRouteComponent(() => import('./MyComponent'), 'NamedExport'),
})
```

Type safety ensures that you are only able to provide valid named exports from the module, which helps to prevent runtime errors.

## Data Loader Splitting

Regardless of which data loading library you decide to go with, you may end up with a lot of data loaders that could potentially contribute to a large bundle size. If this is the case, you can code split your data loading logic using the Route's `loader` option. While this process makes it difficult to maintain type-safety with the parameters passed to your loader, you can always use the generic `LoaderContext` type to get most of the way there:

```tsx
import { LoaderContext } from '@tanstack/react-router'

const route = new Route({
  path: '/my-route',
  component: MyComponent,
  loader: (...args) => import('./loader').then((d) => d.loader(...args)),
})

// In another file...
export const loader = async (context: LoaderContext) => {
  /// ...
}
```

Again, this process can feel heavy-handed, so TanStack Router export another utility called `lazyFn` which is very similar to `lazyRouteComponent` that can help simplify this process:

```tsx
import { lazyFn } from '@tanstack/react-router'

const route = new Route({
  path: '/my-route',
  component: MyComponent,
  loader: lazyFn(() => import('./loader'), 'loader'),
})

// In another file...
export const loader = async (context: LoaderContext) => {
  /// ...
}
```
