---
id: simple-cache
title: React Location Rank Routes
---

A simple utility for ranking routes based on their specificity

## Installation

```bash
yarn add react-location-rank-routes
# or
npm i react-location-rank-routes
```

## Getting Started

```tsx
import { ReactLocation, Router } from '@tanstack/react-location'
import { rankRoutes } from '@tanstack/react-location-rank-routes'

//

const location = new ReactLocation()

function App() {
  return (
    <Router
      location={location}
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
