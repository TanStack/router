---
id: clientOnlyComponent
title: ClientOnly Component
---

The `ClientOnly` component is used to render a components only in the client, without breaking the server-side rendering due to hydration errors. It accepts a `fallback` prop that will be rendered if the JS is not yet loaded in the client.

## Props

The `ClientOnly` component accepts the following props:

### `props.fallback` prop

The fallback component to render if the JS is not yet loaded in the client.

### `props.children` prop

The component to render if the JS is loaded in the client.

## Returns

- Returns the component's children if the JS is loaded in the client.
- Returns the `fallback` component if the JS is not yet loaded in the client.

## Examples

```tsx
import { ClientOnly, createRoute } from '@tanstack/react-router'
import {
  Charts,
  FallbackCharts,
} from './charts-that-break-server-side-rendering'

const Route = createRoute({
  // ... other route options
  path: '/dashboard',
  component: Dashboard,
})

function Dashboard() {
  return (
    <div>
      <p>Dashboard</p>
      <ClientOnly fallback={<FallbackCharts />}>
        <Charts />
      </ClientOnly>
    </div>
  )
}
```
