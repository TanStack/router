---
id: UseLinkPropsOptionsType
title: `UseLinkPropsOptions` type
---


The `UseLinkPropsOptions` type the options that can be used to build a `LinkProps` object. It also extends the `React.AnchorHTMLAttributes<HTMLAnchorElement>` type, so that any additional props that are passed to the `useLinkProps` hook will be merged with the `LinkProps` object.

```tsx
type UseLinkPropsOptions = ActiveLinkOptions &
  React.AnchorHTMLAttributes<HTMLAnchorElement>
```
