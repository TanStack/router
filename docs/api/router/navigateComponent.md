---
id: navigateComponent
title: Navigate component
---

The `Navigate` component is a component that can be used to navigate to a new location when rendered. This includes changes to the pathname, search params, hash, and location state. The underlying navigation will happen inside of a `useEffect` hook when successfully rendered.

### Props

#### `...options`

- Type: `NavigateOptions`

### Returns

#### `null`

### `useLinkProps` hook

The `useLinkProps` hook that takes a `UseLinkPropsOptions` object and returns an `React.AnchorHTMLAttributes<HTMLAnchorElement>` props object. These props can then be safely applied to an anchor element to create a link that can be used to navigate to the new location. This includes changes to the pathname, search params, hash, and location state.

### Options

#### `options`

- Type: `NavigateOptions`

### Returns

- A `React.AnchorHTMLAttributes<HTMLAnchorElement>` object that can be applied to an anchor element to create a link that can be used to navigate to the new location
