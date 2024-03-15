---
id: UseLinkPropsOptionsType
title: UseLinkPropsOptions type
---

The `UseLinkPropsOptions` type the options that can be used to build a [`LinkProps`](./api/router/LinkPropsType) object. It also extends the `React.AnchorHTMLAttributes<HTMLAnchorElement>` type, so that any additional props that are passed to the [`useLinkProps`](./api/router/useLinkPropsHook) hook will be merged with the [`LinkProps`](./api/router/LinkPropsType) object.

```tsx
type UseLinkPropsOptions = ActiveLinkOptions &
  React.AnchorHTMLAttributes<HTMLAnchorElement>
```

- [`ActiveLinkOptions`](./api/router/ActiveLinkOptionsType)
