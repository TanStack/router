---
name: ui-frameworks-integration
---

# UI Framework Integration

Integrating TanStack Router with popular UI component libraries.

## createLink Pattern

The key pattern for all UI integrations:

```tsx
import { createLink } from '@tanstack/react-router'
import { forwardRef } from 'react'

// Generic pattern
const RouterComponent = createLink(
  forwardRef<HTMLElement, ComponentProps>((props, ref) => (
    <OriginalComponent ref={ref} {...props} />
  )),
)
```

## Chakra UI

### Installation

```bash
npm install @chakra-ui/react @emotion/react @emotion/styled framer-motion
```

### Router-Compatible Link

```tsx
import { createLink } from '@tanstack/react-router'
import { Link as ChakraLink } from '@chakra-ui/react'
import { forwardRef } from 'react'

export const RouterLink = createLink(
  forwardRef<
    HTMLAnchorElement,
    React.ComponentPropsWithoutRef<typeof ChakraLink>
  >((props, ref) => <ChakraLink ref={ref} {...props} />),
)
```

### Usage

```tsx
<RouterLink to="/posts/$id" params={{ id: '123' }} color="blue.500">
  View Post
</RouterLink>
```

### Active State Navigation

```tsx
import { useMatchRoute, Link } from '@tanstack/react-router'
import { Button, HStack } from '@chakra-ui/react'

function Navigation() {
  const matchRoute = useMatchRoute()

  return (
    <HStack spacing={4}>
      <Link to="/">
        <Button
          colorScheme={matchRoute({ to: '/', fuzzy: false }) ? 'blue' : 'gray'}
        >
          Home
        </Button>
      </Link>
      <Link to="/posts">
        <Button
          colorScheme={
            matchRoute({ to: '/posts', fuzzy: true }) ? 'blue' : 'gray'
          }
        >
          Posts
        </Button>
      </Link>
    </HStack>
  )
}
```

### Provider Setup

```tsx
// routes/__root.tsx
import { ChakraProvider } from '@chakra-ui/react'
import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <ChakraProvider>
      <Outlet />
    </ChakraProvider>
  ),
})
```

## Material UI (MUI)

### Installation

```bash
npm install @mui/material @emotion/react @emotion/styled
```

### Router-Compatible Button

```tsx
import { createLink } from '@tanstack/react-router'
import { Button } from '@mui/material'
import { forwardRef } from 'react'

export const RouterButton = createLink(
  forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof Button>>(
    (props, ref) => <Button ref={ref} {...props} />,
  ),
)
```

### Router-Compatible Link

```tsx
import { createLink } from '@tanstack/react-router'
import { Link as MuiLink } from '@mui/material'
import { forwardRef } from 'react'

export const RouterLink = createLink(
  forwardRef<HTMLAnchorElement, React.ComponentPropsWithoutRef<typeof MuiLink>>(
    (props, ref) => <MuiLink ref={ref} {...props} />,
  ),
)
```

### Tabs with Router

```tsx
import { Tabs, Tab } from '@mui/material'
import { useMatchRoute, useNavigate } from '@tanstack/react-router'

function NavigationTabs() {
  const matchRoute = useMatchRoute()
  const navigate = useNavigate()

  const routes = ['/', '/posts', '/about']
  const currentTab = routes.findIndex((route) =>
    matchRoute({ to: route, fuzzy: route !== '/' }),
  )

  return (
    <Tabs
      value={currentTab}
      onChange={(_, idx) => navigate({ to: routes[idx] })}
    >
      <Tab label="Home" />
      <Tab label="Posts" />
      <Tab label="About" />
    </Tabs>
  )
}
```

## Shadcn/ui

### Installation

```bash
# New project
npx create-tsrouter-app@latest my-app --template file-router --tailwind --add-ons shadcn

# Existing project
npx shadcn@latest init
npx shadcn@latest add button navigation-menu
```

### Router-Compatible Button

```tsx
import { createLink } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { forwardRef } from 'react'

export const RouterButton = createLink(
  forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof Button>>(
    (props, ref) => <Button ref={ref} {...props} />,
  ),
)
```

### Navigation Menu with Active States

```tsx
import { Link, useMatchRoute } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu'

function MainNav() {
  const matchRoute = useMatchRoute()
  const items = [
    { to: '/', label: 'Home', exact: true },
    { to: '/posts', label: 'Posts' },
  ]

  return (
    <NavigationMenu>
      <NavigationMenuList>
        {items.map((item) => (
          <NavigationMenuItem key={item.to}>
            <Link
              to={item.to}
              className={cn(
                navigationMenuTriggerStyle(),
                matchRoute({ to: item.to, fuzzy: !item.exact }) &&
                  'bg-accent text-accent-foreground font-medium',
              )}
            >
              {item.label}
            </Link>
          </NavigationMenuItem>
        ))}
      </NavigationMenuList>
    </NavigationMenu>
  )
}
```

### Sheet with Router Navigation

```tsx
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

function MobileNav() {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline">Menu</Button>
      </SheetTrigger>
      <SheetContent>
        <nav className="flex flex-col gap-4">
          <Link to="/" onClick={() => setOpen(false)}>
            Home
          </Link>
          <Link to="/posts" onClick={() => setOpen(false)}>
            Posts
          </Link>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
```

## Mantine

### Installation

```bash
npm install @mantine/core @mantine/hooks
```

### Router-Compatible Button

```tsx
import { createLink } from '@tanstack/react-router'
import { Button } from '@mantine/core'
import { forwardRef } from 'react'

export const RouterButton = createLink(
  forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof Button>>(
    (props, ref) => <Button ref={ref} {...props} />,
  ),
)
```

### Provider Setup

```tsx
import { MantineProvider } from '@mantine/core'
import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <MantineProvider>
      <Outlet />
    </MantineProvider>
  ),
})
```

## Radix UI

### Tabs with Router

```tsx
import * as Tabs from '@radix-ui/react-tabs'
import { useMatchRoute, useNavigate } from '@tanstack/react-router'

function RouterTabs() {
  const matchRoute = useMatchRoute()
  const navigate = useNavigate()

  const tabs = [
    { value: 'overview', to: '/dashboard' },
    { value: 'analytics', to: '/dashboard/analytics' },
    { value: 'settings', to: '/dashboard/settings' },
  ]

  const activeTab =
    tabs.find((tab) => matchRoute({ to: tab.to, fuzzy: false }))?.value ||
    'overview'

  return (
    <Tabs.Root
      value={activeTab}
      onValueChange={(value) => {
        const tab = tabs.find((t) => t.value === value)
        if (tab) navigate({ to: tab.to })
      }}
    >
      <Tabs.List>
        {tabs.map((tab) => (
          <Tabs.Trigger key={tab.value} value={tab.value}>
            {tab.value}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs.Root>
  )
}
```

## Common Patterns

### Active State Hook

```tsx
import { useMatchRoute } from '@tanstack/react-router'

function useIsActive(to: string, fuzzy = true) {
  const matchRoute = useMatchRoute()
  return matchRoute({ to, fuzzy })
}

// Usage
const isActive = useIsActive('/posts')
```

### Breadcrumbs

```tsx
import { useMatches, Link } from '@tanstack/react-router'

function Breadcrumbs() {
  const matches = useMatches()

  return (
    <nav>
      {matches
        .filter((match) => match.staticData?.breadcrumb)
        .map((match, i, arr) => (
          <span key={match.id}>
            {i > 0 && ' / '}
            {i === arr.length - 1 ? (
              <span>{match.staticData.breadcrumb}</span>
            ) : (
              <Link to={match.fullPath}>{match.staticData.breadcrumb}</Link>
            )}
          </span>
        ))}
    </nav>
  )
}
```
