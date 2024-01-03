---
id: ActiveLinkOptionsType
title: `ActiveLinkOptions` type
---


The `ActiveLinkOptions` type extends the `LinkOptions` type and contains additional options that can be used to describe how a link should be styled when it is active.

#### `activeProps`

- `React.AnchorHTMLAttributes<HTMLAnchorElement>`
- Optional
- The props that will be applied to the anchor element when the link is active

#### `inactiveProps`

- Type: `React.AnchorHTMLAttributes<HTMLAnchorElement>`
- Optional
- The props that will be applied to the anchor element when the link is inactive

```tsx
type ActiveLinkOptions = LinkOptions & {
  activeProps?:
    | React.AnchorHTMLAttributes<HTMLAnchorElement>
    | (() => React.AnchorHTMLAttributes<HTMLAnchorElement>)
  inactiveProps?:
    | React.AnchorHTMLAttributes<HTMLAnchorElement>
    | (() => React.AnchorHTMLAttributes<HTMLAnchorElement>)
}
```
