# How to Integrate with Popular UI Libraries

This guide covers integration of TanStack Router with popular React UI libraries, including solutions for common compatibility issues and animation problems.

## Quick Start

**Time Required:** 30-60 minutes depending on library  
**Difficulty:** Intermediate  
**Prerequisites:** Basic TanStack Router setup, chosen UI library installed

### What You'll Accomplish

- Set up type-safe navigation components with your UI library
- Fix animation and compatibility issues
- Implement proper styling integration
- Handle component composition patterns
- Resolve common integration problems

---

## Shadcn/ui Integration

Shadcn/ui is one of the most popular component libraries, but requires specific setup to work properly with TanStack Router.

### Installation and Setup

**1. Install Shadcn/ui in your TanStack Router project**

```bash
# Using the TanStack Router template with Shadcn/ui
npx create-tsrouter-app@latest my-app --template file-router --tailwind --add-ons shadcn

# Or add to existing project
npx shadcn@latest init
```

**2. Configure components.json for TanStack Router**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/app/globals.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

### Fixing Animation Issues

**Problem:** Shadcn/ui animations (like Sheet, Dialog, etc.) don't work with TanStack Router.

**Solution:** Ensure proper portal and animation context setup:

**1. Update your root route to include animation context**

```tsx
// src/routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

export const Route = createRootRoute({
  component: () => (
    <>
      {/* Ensure proper DOM structure for portals */}
      <div id="root-content">
        <Outlet />
      </div>
      {/* Portal root for overlays */}
      <div id="portal-root"></div>
      <TanStackRouterDevtools />
    </>
  ),
})
```

**2. Create a custom Sheet component with proper animation setup**

```tsx
// src/components/ui/router-sheet.tsx
import * as React from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

interface RouterSheetProps {
  children: React.ReactNode
  trigger: React.ReactNode
  title: string
  description?: string
}

export function RouterSheet({
  children,
  trigger,
  title,
  description,
}: RouterSheetProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  )
}
```

**3. Use animations with proper key management**

```tsx
// src/routes/posts/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { RouterSheet } from '@/components/ui/router-sheet'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/posts/')({
  component: PostsPage,
})

function PostsPage() {
  return (
    <div className="p-4">
      <RouterSheet
        trigger={<Button>Open Menu</Button>}
        title="Navigation Menu"
        description="Navigate through your posts"
      >
        <div className="space-y-4">
          {/* Sheet content with animations will work properly */}
          <p>This sheet animates correctly with TanStack Router!</p>
        </div>
      </RouterSheet>
    </div>
  )
}
```

### Navigation Components with Shadcn/ui

**Create router-aware Shadcn/ui navigation components:**

```tsx
// src/components/ui/router-navigation.tsx
import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu'

interface NavItem {
  to: string
  label: string
  exact?: boolean
}

interface RouterNavigationProps {
  items: NavItem[]
  className?: string
}

export function RouterNavigation({ items, className }: RouterNavigationProps) {
  return (
    <NavigationMenu className={className}>
      <NavigationMenuList>
        {items.map((item) => (
          <NavigationMenuItem key={item.to}>
            <Link
              to={item.to}
              activeOptions={{ exact: item.exact }}
              className={({ isActive }) =>
                cn(
                  navigationMenuTriggerStyle(),
                  isActive && 'bg-accent text-accent-foreground',
                )
              }
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

---

## Material-UI (MUI) Integration

Material-UI requires specific patterns for proper TypeScript integration and component composition.

### Installation and Setup

**1. Install Material-UI dependencies**

```bash
npm install @mui/material @emotion/react @emotion/styled @mui/icons-material
```

**2. Set up the theme provider**

```tsx
// src/components/theme-provider.tsx
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'

const theme = createTheme({
  palette: {
    mode: 'light',
  },
})

export function MuiThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  )
}
```

**3. Update your root route**

```tsx
// src/routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { MuiThemeProvider } from '@/components/theme-provider'

export const Route = createRootRoute({
  component: () => (
    <MuiThemeProvider>
      <Outlet />
    </MuiThemeProvider>
  ),
})
```

### Creating Router-Compatible MUI Components

**Problem:** MUI Link and Button components don't work properly with TanStack Router's type system.

**Solution:** Use `createLink` to create properly typed MUI components:

**1. Create typed MUI Link component**

```tsx
// src/components/ui/mui-router-link.tsx
import { createLink } from '@tanstack/react-router'
import { Link as MuiLink, type LinkProps } from '@mui/material/Link'
import { forwardRef } from 'react'

// Create a router-compatible MUI Link
export const RouterLink = createLink(
  forwardRef<HTMLAnchorElement, LinkProps>((props, ref) => {
    return <MuiLink ref={ref} {...props} />
  }),
)
```

**2. Create typed MUI Button component**

```tsx
// src/components/ui/mui-router-button.tsx
import { createLink } from '@tanstack/react-router'
import { Button, type ButtonProps } from '@mui/material/Button'
import { forwardRef } from 'react'

// Create a router-compatible MUI Button
export const RouterButton = createLink(
  forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
    return <Button ref={ref} component="button" {...props} />
  }),
)
```

**3. Usage with full type safety**

```tsx
// src/routes/posts/$postId.tsx
import { createFileRoute } from '@tanstack/react-router'
import { Container, Typography, Box } from '@mui/material'
import { RouterLink, RouterButton } from '@/components/ui/mui-router-link'

export const Route = createFileRoute('/posts/$postId')({
  component: PostPage,
})

function PostPage() {
  const { postId } = Route.useParams()

  return (
    <Container>
      <Typography variant="h4">Post {postId}</Typography>

      {/* Fully typed router navigation */}
      <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
        <RouterLink to="/posts" color="primary" underline="hover">
          Back to Posts
        </RouterLink>

        <RouterButton
          to="/posts/$postId/edit"
          params={{ postId }}
          variant="contained"
          color="primary"
        >
          Edit Post
        </RouterButton>
      </Box>
    </Container>
  )
}
```

### Handling Active States with MUI

**Create navigation with active state indicators:**

```tsx
// src/components/navigation/mui-nav-tabs.tsx
import { useMatchRoute } from '@tanstack/react-router'
import { Tabs, Tab, type TabsProps } from '@mui/material'
import { RouterLink } from '@/components/ui/mui-router-link'

interface NavTab {
  label: string
  to: string
  value: string
}

interface MuiNavTabsProps extends Omit<TabsProps, 'value' | 'onChange'> {
  tabs: NavTab[]
}

export function MuiNavTabs({ tabs, ...tabsProps }: MuiNavTabsProps) {
  const matchRoute = useMatchRoute()

  // Find active tab based on current route
  const activeTab =
    tabs.find((tab) => matchRoute({ to: tab.to, fuzzy: true }))?.value || false

  return (
    <Tabs value={activeTab} {...tabsProps}>
      {tabs.map((tab) => (
        <Tab
          key={tab.value}
          label={tab.label}
          value={tab.value}
          component={RouterLink}
          to={tab.to}
        />
      ))}
    </Tabs>
  )
}
```

---

## Framer Motion Integration

Framer Motion works well with TanStack Router but requires specific patterns for route animations.

### Installation and Setup

```bash
npm install framer-motion
```

### Route Transition Animations

**1. Create an animated route wrapper**

```tsx
// src/components/animated-route.tsx
import { motion, type MotionProps } from 'framer-motion'
import { ReactNode } from 'react'

interface AnimatedRouteProps extends MotionProps {
  children: ReactNode
}

const pageVariants = {
  initial: { opacity: 0, x: -20 },
  in: { opacity: 1, x: 0 },
  out: { opacity: 0, x: 20 },
}

const pageTransition = {
  type: 'tween',
  ease: 'anticipate',
  duration: 0.3,
}

export function AnimatedRoute({
  children,
  ...motionProps
}: AnimatedRouteProps) {
  return (
    <motion.div
      initial="initial"
      animate="in"
      exit="out"
      variants={pageVariants}
      transition={pageTransition}
      {...motionProps}
    >
      {children}
    </motion.div>
  )
}
```

**2. Use animations in your routes**

```tsx
// src/routes/posts/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { AnimatedRoute } from '@/components/animated-route'

export const Route = createFileRoute('/posts/')({
  component: PostsPage,
})

function PostsPage() {
  return (
    <AnimatedRoute>
      <div className="container mx-auto p-4">
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-3xl font-bold mb-6"
        >
          Posts
        </motion.h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="grid gap-4"
        >
          {/* Post cards with animations */}
        </motion.div>
      </div>
    </AnimatedRoute>
  )
}
```

### Navigation Animations

**Create animated navigation with Framer Motion:**

```tsx
// src/components/navigation/animated-nav.tsx
import { Link, useMatchRoute } from '@tanstack/react-router'
import { motion } from 'framer-motion'

interface NavItem {
  to: string
  label: string
}

interface AnimatedNavProps {
  items: NavItem[]
}

export function AnimatedNav({ items }: AnimatedNavProps) {
  const matchRoute = useMatchRoute()

  return (
    <nav className="flex space-x-1 p-2 bg-gray-100 rounded-lg">
      {items.map((item) => {
        const isActive = matchRoute({ to: item.to, fuzzy: true })

        return (
          <Link
            key={item.to}
            to={item.to}
            className="relative px-3 py-2 rounded-md text-sm font-medium transition-colors"
          >
            {isActive && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-0 bg-white rounded-md shadow-sm"
                initial={false}
                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span className="relative z-10">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
```

---

## Chakra UI Integration

Chakra UI integrates smoothly with TanStack Router with minimal setup.

### Installation and Setup

```bash
npm install @chakra-ui/react @emotion/react @emotion/styled framer-motion
```

**1. Set up Chakra provider**

```tsx
// src/routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { ChakraProvider } from '@chakra-ui/react'

export const Route = createRootRoute({
  component: () => (
    <ChakraProvider>
      <Outlet />
    </ChakraProvider>
  ),
})
```

**2. Create router-compatible Chakra components**

```tsx
// src/components/ui/chakra-router-link.tsx
import { createLink } from '@tanstack/react-router'
import { Link as ChakraLink, Button } from '@chakra-ui/react'

// Router-compatible Chakra Link
export const RouterLink = createLink(ChakraLink)

// Router-compatible Chakra Button
export const RouterButton = createLink(Button)
```

**3. Usage example**

```tsx
// src/routes/about.tsx
import { createFileRoute } from '@tanstack/react-router'
import { Box, Heading, Text, VStack } from '@chakra-ui/react'
import { RouterLink, RouterButton } from '@/components/ui/chakra-router-link'

export const Route = createFileRoute('/about')({
  component: AboutPage,
})

function AboutPage() {
  return (
    <Box p={8} maxW="container.md" mx="auto">
      <VStack spacing={6} align="start">
        <Heading>About Us</Heading>
        <Text>Welcome to our application!</Text>

        <RouterLink to="/" color="blue.500">
          Back to Home
        </RouterLink>

        <RouterButton to="/contact" colorScheme="blue" variant="solid">
          Contact Us
        </RouterButton>
      </VStack>
    </Box>
  )
}
```

---

## Common Problems

### Animations Not Working

**Problem:** UI library animations (especially modals, sheets, drawers) don't work properly.

**Solutions:**

1. **Ensure proper DOM structure for portals:**

   ```tsx
   // Add portal root in your HTML
   <div id="portal-root"></div>

   // Or in your root route
   <div id="modal-root"></div>
   ```

2. **Check CSS-in-JS integration:**

   ```tsx
   // For Emotion-based libraries
   import { CacheProvider } from '@emotion/react'
   import createCache from '@emotion/cache'

   const cache = createCache({ key: 'css' })

   export function App() {
     return <CacheProvider value={cache}>{/* Your app */}</CacheProvider>
   }
   ```

3. **Use proper animation keys:**
   ```tsx
   // Ensure animations have stable keys
   <motion.div key={router.state.location.pathname}>
     <Outlet />
   </motion.div>
   ```

### TypeScript Errors with Component Props

**Problem:** TypeScript errors when using UI library components with TanStack Router props.

**Solution:** Create properly typed wrapper components using `createLink`:

```tsx
// Type-safe wrapper pattern
import { createLink } from '@tanstack/react-router'
import { ComponentType, forwardRef } from 'react'

function createRouterComponent<T extends ComponentType<any>>(Component: T) {
  return createLink(
    forwardRef((props, ref) => <Component ref={ref} {...props} />),
  )
}

// Usage
export const RouterButton = createRouterComponent(Button)
export const RouterLink = createRouterComponent(Link)
```

### CSS Conflicts and Styling Issues

**Problem:** UI library styles conflict with TanStack Router or application styles.

**Solutions:**

1. **CSS Module integration:**

   ```tsx
   // Use CSS Modules with UI libraries
   import styles from './component.module.css'
   import { Button } from '@mui/material'

   ;<Button className={styles.customButton}>Click me</Button>
   ```

2. **Theme integration:**

   ```tsx
   // Extend UI library themes
   const theme = createTheme({
     components: {
       MuiButton: {
         styleOverrides: {
           root: {
             // Custom styles that work with router
           },
         },
       },
     },
   })
   ```

3. **CSS-in-JS specificity:**
   ```tsx
   // Increase specificity for router-specific styles
   const StyledButton = styled(Button)(({ theme }) => ({
     '&.router-active': {
       backgroundColor: theme.palette.primary.main,
     },
   }))
   ```

### Performance Issues with Large UI Libraries

**Problem:** Bundle size or runtime performance issues.

**Solutions:**

1. **Tree shaking:**

   ```tsx
   // Import only what you need
   import Button from '@mui/material/Button'
   import TextField from '@mui/material/TextField'

   // Instead of
   import { Button, TextField } from '@mui/material'
   ```

2. **Code splitting with lazy loading:**

   ```tsx
   import { createLazyFileRoute } from '@tanstack/react-router'
   import { lazy } from 'react'

   const HeavyUIComponent = lazy(() => import('@/components/heavy-ui'))

   export const Route = createLazyFileRoute('/heavy-page')({
     component: () => (
       <Suspense fallback={<div>Loading...</div>}>
         <HeavyUIComponent />
       </Suspense>
     ),
   })
   ```

---

## Production Checklist

Before deploying your app with UI library integration:

### Performance

- [ ] Tree shaking enabled for UI library imports
- [ ] CSS-in-JS properly configured for SSR (if applicable)
- [ ] Bundle size optimized with code splitting
- [ ] Animation performance tested on slower devices

### Functionality

- [ ] All navigation components work with router state
- [ ] Animations and transitions work on route changes
- [ ] TypeScript compilation successful with UI library integration
- [ ] Active states properly reflected in navigation components

### Styling

- [ ] Theme consistency across router and UI library
- [ ] CSS conflicts resolved
- [ ] Responsive design working with UI library components
- [ ] Dark mode integration (if applicable)

### Accessibility

- [ ] Keyboard navigation works with router-integrated components
- [ ] Screen reader compatibility maintained
- [ ] Focus management working across route transitions
- [ ] ARIA attributes properly maintained

---

<!-- Common Next Steps (commented out until guides exist)
## Common Next Steps

- [Set up authentication](./setup-authentication.md) - Add protected routes with your UI library
- [Setup testing](./setup-testing.md) - Test UI library components with router
- [Handle search parameters](./handle-search-parameters.md) - Integrate search state with UI components
-->

## Related Resources

- [Shadcn/ui TanStack Router Installation](https://ui.shadcn.com/docs/installation/tanstack-router) - Official Shadcn/ui integration guide
- [Material-UI with TypeScript](https://mui.com/material-ui/guides/typescript/) - MUI TypeScript integration
- [Framer Motion Documentation](https://www.framer.com/motion/) - Animation library documentation
- [Chakra UI Getting Started](https://chakra-ui.com/getting-started) - Chakra UI setup guide
- [TanStack Router createLink API](../api/router#createlink) - Official API documentation for component integration
