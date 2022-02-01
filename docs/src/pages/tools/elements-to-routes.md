---
id: elements-to-routes
title: React Location Elements To Routes
---

The `react-location-elements-to-routes` package exports:

- A `Route` component
- An `elementsToRoutes` function

### Route

The `Route` component can be used to create a JSX representation of a `Route` object you would normally use to configure your routes in `react-location`

- `Route.children` is of type `React.ReactNode` instead of the usual `Route[]`.
- Only `<Route>` and `<React.Fragment>`/`<></>` elements may be used
- Ternary logic is supported
- The `<Route>` component is merely a placeholder component that simply renders `null`, so don't try to use it 😜.

Use the `Route` component and `elementsToRoutes` function like so:

```tsx
import {
  Route,
  elementsToRoutes,
} from '@tanstack/react-location-elements-to-routes'

const routes = elementsToRoutes(
  <Route path="admin" element={<Admin />}>
    <Route path="dashboard" element={<Dashboard />} />
    <Route
      path="users"
      element={<Users />}
      loader={async () => {
        return {
          users: await fetchUsers(),
        }
      }}
    />
    <Route path="settings" element={<Settings />} />
  </Route>,
)

// routes ===
//   [
//     {
//       path: 'admin',
//       element: <Admin />,
//       children: [
//         {
//           path: 'dashboard',
//           element: <Dashboard />,
//         },
//         {
//           path: 'users',
//           element: <Users />,
//           loader: async () => {
//             return {
//               users: await fetchUsers(),
//             }
//           },
//         },
//         {
//           path: 'settings',
//           element: <Settings />,
//         },
//       ],
//     },
//   ]
```

You can then pass these routes to `react-location`'s `Router` as you normally would:

```tsx
import { Router } from '@tanstack/react-location'
import {
  Route,
  elementsToRoutes,
} from '@tanstack/react-location-elements-to-routes'

function App() {
  return (
    <Router
      routes={elementsToRoutes(
        <Route path="admin" element={<Admin />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route
            path="users"
            element={<Users />}
            loader={async () => {
              return {
                users: await fetchUsers(),
              }
            }}
          />
          <Route path="settings" element={<Settings />} />
        </Route>,
      )}
    />
  )
}
```
