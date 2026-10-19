---
id: createLinkFunction
title: createLink function
---

The `createLink` function creates a custom `Link` component with the same type parameters and type safety as [`Link`](./linkComponent.md). Use it to build cross-cutting link components with additional behavior or styles while keeping TanStack Router's navigation, preloading and active-state handling. See the [Custom Link](../guide/custom-link.md) guide for the full walkthrough.

## createLink options

- Type: `(Comp: Constrain<TComp, any, (props: CreateLinkProps) => ReactNode>) => LinkComponent<TComp>`
- Required

The function accepts a single argument, the component to render as the link's underlying element. The created component forwards all [`Link`](./linkComponent.md) props to that component and renders it in place of the default anchor element.

## Returns

A `LinkComponent` that accepts the same props as [`Link`](./linkComponent.md) (including `preload`, `activeProps`, `inactiveProps` and search-param props), rendered through the provided component.

## Examples

### Creating a basic custom link component

```tsx
import * as React from 'react'
import { createLink, LinkComponent } from '@tanstack/react-router'

interface BasicLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  // Add any additional props you want to pass to the anchor element
}

const BasicLinkComponent = React.forwardRef<HTMLAnchorElement, BasicLinkProps>(
  (props, ref) => {
    return (
      <a ref={ref} {...props} className={'block px-3 py-2 text-blue-700'} />
    )
  },
)

const CreatedLinkComponent = createLink(BasicLinkComponent)

export const CustomLink: LinkComponent<
  typeof BasicLinkComponent
> = (props) => {
  return <CreatedLinkComponent preload={'intent'} {...props} />
}
```
