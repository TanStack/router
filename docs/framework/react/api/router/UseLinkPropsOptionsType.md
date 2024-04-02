---
id: UseLinkPropsOptionsType
title: UseLinkPropsOptions type
---

The `UseLinkPropsOptions` type the options that can be used to build a [`LinkProps`](../LinkPropsType) object. It also extends the `React.AnchorHTMLAttributes<HTMLAnchorElement>` type, so that any additional props that are passed to the [`useLinkProps`](../useLinkPropsHook) hook will be merged with the [`LinkProps`](../LinkPropsType) object.

```tsx
type UseLinkPropsOptions = ActiveLinkOptions &
  React.AnchorHTMLAttributes<HTMLAnchorElement>
```

- [`ActiveLinkOptions`](../ActiveLinkOptionsType)
