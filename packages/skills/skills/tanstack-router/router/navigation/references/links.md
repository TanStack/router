# Links

The `<Link>` component provides type-safe, declarative navigation.

## Basic Usage

```tsx
import { Link } from '@tanstack/react-router'

// Static route
<Link to="/about">About</Link>

// With params
<Link to="/posts/$postId" params={{ postId: '123' }}>
  View Post
</Link>

// With search params
<Link to="/posts" search={{ page: 1, filter: 'recent' }}>
  Recent Posts
</Link>
```

## Link Props

```tsx
<Link
  to="/posts/$postId"
  params={{ postId: '123' }}
  search={{ tab: 'comments' }}
  hash="section-1"
  replace={false} // Replace history entry
  preload="intent" // Preload strategy
  preloadDelay={50} // Delay before preload
  activeProps={{ className: 'active' }}
  inactiveProps={{ className: 'inactive' }}
  activeOptions={{ exact: true, includeSearch: false }}
>
  Post
</Link>
```

## Active States

Style links based on route match:

```tsx
<Link
  to="/posts"
  activeProps={{ className: 'text-blue-500 font-bold' }}
  inactiveProps={{ className: 'text-gray-500' }}
>
  Posts
</Link>

// Exact matching (don't match children)
<Link
  to="/posts"
  activeOptions={{ exact: true }}
  activeProps={{ className: 'active' }}
>
  Posts
</Link>
```

## Preloading

Preload route data on hover/intent:

```tsx
// Preload on hover (default)
<Link to="/posts" preload="intent">Posts</Link>

// Preload immediately when link renders
<Link to="/posts" preload="render">Posts</Link>

// Preload on viewport entry
<Link to="/posts" preload="viewport">Posts</Link>

// Disable preloading
<Link to="/posts" preload={false}>Posts</Link>
```

## Custom Link Wrapper

```tsx
import { createLink, LinkComponent } from '@tanstack/react-router'

const CustomLinkComponent = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentPropsWithoutRef<'a'>
>((props, ref) => (
  <a ref={ref} {...props} className={`custom-link ${props.className}`} />
))

const CustomLink = createLink(CustomLinkComponent)

// Usage
<CustomLink to="/posts">Posts</CustomLink>
```

## useLinkProps

Get link props for custom components:

```tsx
import { useLinkProps } from '@tanstack/react-router'

function CustomNav() {
  const linkProps = useLinkProps({ to: '/posts' })
  return <a {...linkProps}>Posts</a>
}
```

## API Reference

### Link Component Props

```tsx
interface LinkProps {
  // Navigation
  to: string // Target route path
  params?: Record<string, string> // Path parameters
  search?: Record<string, any> | ((prev: Search) => Search)
  hash?: string // URL hash
  state?: Record<string, any> // History state

  // Behavior
  replace?: boolean // Replace vs push history (default: false)
  resetScroll?: boolean // Reset scroll position (default: true)
  disabled?: boolean // Disable navigation

  // Preloading
  preload?: 'intent' | 'render' | 'viewport' | false
  preloadDelay?: number // ms delay before preload (default: 50)

  // Active States
  activeProps?: React.HTMLAttributes<HTMLAnchorElement>
  inactiveProps?: React.HTMLAttributes<HTMLAnchorElement>
  activeOptions?: {
    exact?: boolean // Exact path match only
    includeHash?: boolean // Include hash in match
    includeSearch?: boolean // Include search in match
  }
}
```

### useLinkProps Hook

```tsx
function useLinkProps(
  options: LinkOptions,
): React.AnchorHTMLAttributes<HTMLAnchorElement>
```

Returns anchor props including `href`, `onClick`, `onFocus`, `onMouseEnter` for navigation and preloading.

### createLink Function

```tsx
function createLink<TComp>(component: TComp): LinkComponent<TComp>
```

Wraps a component to work with router navigation. Used for UI library integration.
