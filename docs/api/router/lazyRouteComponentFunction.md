---
id: lazyRouteComponentFunction
title: lazyRouteComponent function
---

The `lazyRouteComponent` function can be used to create a code-split route component that can be preloaded using a `component.preload()` method.

### Options

#### `importer`

- Type: `() => Promise<T>`
- Required
- A function that returns a promise that resolves to an object that contains the component to be loaded

#### `exportName`

- Type: `string`
- Optional
- The name of the component to be loaded from the imported object. Defaults to `'default'`

### Returns

- A `React.lazy` component that can be preloaded using a `component.preload()` method

### Examples

```tsx
import { lazyRouteComponent } from '@tanstack/react-router'

const route = new Route({
  path: '/posts/$postId',
  component: lazyRouteComponent(() => import('./Post')),
})
```
