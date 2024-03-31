---
id: useLinkPropsHook
title: useLinkProps hook
---

The `useLinkProps` hook that takes a [`UseLinkPropsOptions`](./api/router/UseLinkPropsOptionsType) object and returns an `React.AnchorHTMLAttributes<HTMLAnchorElement>` props object. These props can then be safely applied to an anchor element to create a link that can be used to navigate to the new location. This includes changes to the pathname, search params, hash, and location state.

## useLinkProps options

The [`UseLinkPropsOptions`](./api/router/UseLinkPropsOptionsType) object accepts the following properties:

### `options` option

- Type: [`NavigateOptions`](./api/router/NavigateOptionsType)

## useLinkProps returns

- A `React.AnchorHTMLAttributes<HTMLAnchorElement>` object that can be applied to an anchor element to create a link that can be used to navigate to the new location
