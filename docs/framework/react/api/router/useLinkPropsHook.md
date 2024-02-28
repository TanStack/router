---
id: useLinkPropsHook
title: useLinkProps hook
---

The `useLinkProps` hook that takes a `UseLinkPropsOptions` object and returns an `React.AnchorHTMLAttributes<HTMLAnchorElement>` props object. These props can then be safely applied to an anchor element to create a link that can be used to navigate to the new location. This includes changes to the pathname, search params, hash, and location state.

## useLinkProps `options`

The `UseLinkPropsOptions` object accepts the following properties:

### `options`

- Type: `NavigateOptions`

## useLinkProps `returns`

- A `React.AnchorHTMLAttributes<HTMLAnchorElement>` object that can be applied to an anchor element to create a link that can be used to navigate to the new location
