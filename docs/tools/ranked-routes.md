---
title: TanStack Router Rank Routes
---

A simple utility for ranking routes based on their specificity

## Installation

```bash
yarn add @tanstack/router-rank-routes
# or
npm i @tanstack/router-rank-routes
```

## Getting Started

```tsx
import { Router } from '@tanstack/react-router'
import { rankRoutes } from '@tanstack/router-rank-routes'

//

function App() {
  return (
    <Router
      filterRoutes={rankRoutes}
      routes={[
        {
          path: '/',
        },
        {
          path: '/todos',
        },
        {
          path: '/todos/:todoId',
          children: [
            {
              path: '/',
            },
            {
              path: '/tasks',
            },
            {
              path: '/tasks/:taskId',
            },
            {
              path: '/',
            },
          ],
        },
        {
          path: '/',
        },
      ]}
    />
  )
}
```

The Routes above will be filtered and ranked in the following order:

```tsx
const routes = [
  {
    path: '/',
  },
  {
    path: '/todos/:todoId',
    children: [
      {
        path: '/',
      },
      {
        path: '/tasks/:taskId',
      },
      {
        path: '/tasks',
      },
      {
        path: '/*',
      },
    ],
  },
  {
    path: '/todos',
  },
  {
    path: '/*',
  },
]
```
