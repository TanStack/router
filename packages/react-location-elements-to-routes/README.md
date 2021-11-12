# React Location Elements to Routes

This package exports:

- A `Route` component
- An `elementsToRoutes` function

### Route

The `Route` component is a JSX representation of a `Route` object you would normally use to configure your routes in `react-location`, with the main difference that `children` is of type `React.ReactNode` instead of `Route[]`.

- Only `<Route>` and `<React.Fragment>`/`<></>` elements may be used
- Ternary logic is supported

Instead of defining your routes via objects and arrays, you can use the `Route` component like so:

```tsx
import { Route, elementsToRoutes } from 'react-location-elements-to-routes'

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
import { Router } from 'react-location'
import { Route, elementsToRoutes } from 'react-location-elements-to-routes'

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
