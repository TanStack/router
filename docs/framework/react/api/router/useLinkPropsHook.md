---
id: useLinkPropsHook
title: useLinkProps hook
---

The `useLinkProps` hook that takes a [`UseLinkPropsOptions`](../UseLinkPropsOptionsType) object and returns an `React.AnchorHTMLAttributes<HTMLAnchorElement>` props object. These props can then be safely applied to an anchor element to create a link that can be used to navigate to the new location. This includes changes to the pathname, search params, hash, and location state.

## useLinkProps options

```tsx
type UseLinkPropsOptions = ActiveLinkOptions &
  React.AnchorHTMLAttributes<HTMLAnchorElement>
```

- [`ActiveLinkOptions`](../ActiveLinkOptionsType)
- The `useLinkProps` options are used to build a [`LinkProps`](../LinkPropsType) object.
- It also extends the `React.AnchorHTMLAttributes<HTMLAnchorElement>` type, so that any additional props that are passed to the `useLinkProps` hook will be merged with the [`LinkProps`](../LinkPropsType) object.

The [`UseLinkPropsOptions`](../UseLinkPropsOptionsType) object accepts the following properties:

## useLinkProps returns

- A `React.AnchorHTMLAttributes<HTMLAnchorElement>` object that can be applied to an anchor element to create a link that can be used to navigate to the new location
