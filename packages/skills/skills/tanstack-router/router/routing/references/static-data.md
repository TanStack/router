# Static Route Data

Attach static metadata to routes.

## Basic Static Data

```tsx
export const Route = createFileRoute('/about')({
  staticData: {
    title: 'About Us',
    breadcrumb: 'About',
    icon: 'info',
  },
})
```

## Type-Safe Static Data

```tsx
// Extend route types
declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    title?: string
    breadcrumb?: string
    icon?: string
    permissions?: string[]
  }
}

// Now typed in all routes
export const Route = createFileRoute('/admin')({
  staticData: {
    title: 'Admin Panel',
    permissions: ['admin'], // Type-safe
  },
})
```

## Accessing Static Data

```tsx
import { useMatches } from '@tanstack/react-router'

function Breadcrumbs() {
  const matches = useMatches()

  return (
    <nav>
      {matches.map((match) => (
        <span key={match.id}>{match.staticData?.breadcrumb || match.id}</span>
      ))}
    </nav>
  )
}
```

## Navigation Menu from Static Data

```tsx
function NavMenu() {
  const router = useRouter()

  // Get all routes with menu data
  const menuItems = router.routeTree.children
    .filter((route) => route.options.staticData?.showInMenu)
    .map((route) => ({
      path: route.fullPath,
      label: route.options.staticData?.menuLabel,
      icon: route.options.staticData?.icon,
    }))

  return (
    <nav>
      {menuItems.map((item) => (
        <Link key={item.path} to={item.path}>
          <Icon name={item.icon} />
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
```

## Permission Checking

```tsx
function ProtectedRoute() {
  const match = useMatch({ from: Route.fullPath })
  const user = useAuth()

  const requiredPermissions = match.staticData?.permissions || []

  const hasAccess = requiredPermissions.every((perm) =>
    user.permissions.includes(perm),
  )

  if (!hasAccess) {
    return <Unauthorized />
  }

  return <Outlet />
}
```

## Static Data vs Loader Data

| Static Data             | Loader Data          |
| ----------------------- | -------------------- |
| Available at build time | Fetched at runtime   |
| Same for all users      | Can be user-specific |
| Used for metadata       | Used for content     |
| No async                | Async                |
