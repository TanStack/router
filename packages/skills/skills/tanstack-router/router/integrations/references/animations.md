---
name: animations-integration
---

# Animation Integration

Integrating route transitions and animations with TanStack Router.

## Framer Motion

### Installation

```bash
npm install framer-motion
```

### Page Transition Wrapper

```tsx
// components/PageTransition.tsx
import { motion, AnimatePresence } from 'framer-motion'
import { useLocation } from '@tanstack/react-router'

interface PageTransitionProps {
  children: React.ReactNode
}

export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
```

### Root Route Setup

```tsx
// routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { PageTransition } from '../components/PageTransition'

export const Route = createRootRoute({
  component: () => (
    <div className="app">
      <Navigation />
      <PageTransition>
        <Outlet />
      </PageTransition>
    </div>
  ),
})
```

### Slide Transitions

```tsx
const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 300 : -300,
    opacity: 0,
  }),
}

function SlideTransition({ children, direction = 1 }) {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait" custom={direction}>
      <motion.div
        key={location.pathname}
        custom={direction}
        variants={slideVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ type: 'tween', duration: 0.3 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
```

### Fade with Scale

```tsx
const fadeScaleVariants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 1.05 },
}

function FadeScaleTransition({ children }) {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        variants={fadeScaleVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: 0.2 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
```

### Route-Specific Animations

```tsx
// routes/posts.$id.tsx
import { createFileRoute } from '@tanstack/react-router'
import { motion } from 'framer-motion'

export const Route = createFileRoute('/posts/$id')({
  component: PostDetail,
})

function PostDetail() {
  const { id } = Route.useParams()

  return (
    <motion.article
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.4 }}
    >
      <motion.h1
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        Post {id}
      </motion.h1>
    </motion.article>
  )
}
```

### Shared Layout Animations

```tsx
import { motion, LayoutGroup } from 'framer-motion'
import { Link, Outlet, useMatchRoute } from '@tanstack/react-router'

function TabNavigation() {
  const matchRoute = useMatchRoute()
  const tabs = [
    { to: '/posts', label: 'Posts' },
    { to: '/comments', label: 'Comments' },
  ]

  return (
    <LayoutGroup>
      <nav className="flex gap-4 relative">
        {tabs.map((tab) => (
          <Link key={tab.to} to={tab.to} className="relative px-4 py-2">
            {tab.label}
            {matchRoute({ to: tab.to, fuzzy: true }) && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-0 bg-blue-100 rounded"
                style={{ zIndex: -1 }}
                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
              />
            )}
          </Link>
        ))}
      </nav>
      <Outlet />
    </LayoutGroup>
  )
}
```

## CSS-Only Transitions

### View Transitions API

```tsx
// For browsers that support View Transitions API
function useViewTransition() {
  const navigate = useNavigate()

  return (to: string) => {
    if (document.startViewTransition) {
      document.startViewTransition(() => {
        navigate({ to })
      })
    } else {
      navigate({ to })
    }
  }
}
```

```css
/* CSS for View Transitions */
@keyframes fade-in {
  from {
    opacity: 0;
  }
}

@keyframes fade-out {
  to {
    opacity: 0;
  }
}

@keyframes slide-from-right {
  from {
    transform: translateX(30px);
  }
}

@keyframes slide-to-left {
  to {
    transform: translateX(-30px);
  }
}

::view-transition-old(root) {
  animation:
    90ms cubic-bezier(0.4, 0, 1, 1) both fade-out,
    300ms cubic-bezier(0.4, 0, 0.2, 1) both slide-to-left;
}

::view-transition-new(root) {
  animation:
    210ms cubic-bezier(0, 0, 0.2, 1) 90ms both fade-in,
    300ms cubic-bezier(0.4, 0, 0.2, 1) both slide-from-right;
}
```

### Tailwind CSS Transitions

```tsx
// Simple CSS transitions without JS
function PageWrapper({ children }) {
  return <div className="animate-fadeIn">{children}</div>
}
```

```css
/* tailwind.config.js extend */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fadeIn {
  animation: fadeIn 0.3s ease-out;
}
```

## Loading States

### Pending UI with Motion

```tsx
import { useRouterState } from '@tanstack/react-router'
import { motion, AnimatePresence } from 'framer-motion'

function LoadingIndicator() {
  const isLoading = useRouterState({ select: (s) => s.isLoading })

  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          exit={{ opacity: 0 }}
          className="fixed top-0 left-0 h-1 bg-blue-500 origin-left"
          style={{ width: '100%' }}
          transition={{ duration: 0.3 }}
        />
      )}
    </AnimatePresence>
  )
}
```

### Skeleton Loading

```tsx
import { motion } from 'framer-motion'

function SkeletonLoader() {
  return (
    <motion.div
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.5, repeat: Infinity }}
      className="h-4 bg-gray-200 rounded"
    />
  )
}

// In route
export const Route = createFileRoute('/posts/$id')({
  pendingComponent: () => (
    <div className="space-y-4">
      <SkeletonLoader />
      <SkeletonLoader />
    </div>
  ),
})
```

## Performance Tips

### Reduce Motion for Accessibility

```tsx
import { useReducedMotion } from 'framer-motion'

function PageTransition({ children }) {
  const shouldReduceMotion = useReducedMotion()

  if (shouldReduceMotion) {
    return <>{children}</>
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {children}
    </motion.div>
  )
}
```

### Optimize Large Lists

```tsx
// Use layout animations sparingly on large lists
function PostList({ posts }) {
  return (
    <motion.ul>
      {posts.slice(0, 10).map((post) => (
        <motion.li
          key={post.id}
          layout
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {post.title}
        </motion.li>
      ))}
    </motion.ul>
  )
}
```
