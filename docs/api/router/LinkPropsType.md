---
id: LinkPropsType
title: `LinkProps` type
---


The `LinkProps` type extends the `ActiveLinkOptions` and `React.AnchorHTMLAttributes<HTMLAnchorElement>` types and contains additional props specific to the `Link` component.

### Properties

- All of the props from `ActiveLinkOptions`
- All of the props from `React.AnchorHTMLAttributes<HTMLAnchorElement>`

#### `children`

- Type: `React.ReactNode | ((state: { isActive: boolean }) => React.ReactNode)`
- Optional
- The children that will be rendered inside of the anchor element. If a function is provided, it will be called with an object that contains the `isActive` boolean value that can be used to determine if the link is active.

```tsx
type LinkProps = ActiveLinkOptions &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & {
    children?:
      | React.ReactNode
      | ((state: { isActive: boolean }) => React.ReactNode)
  }
```
