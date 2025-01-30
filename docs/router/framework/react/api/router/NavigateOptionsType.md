---
id: NavigateOptionsType
title: NavigateOptions type
---

The `NavigateOptions` type is used to describe the options that can be used when describing a navigation action in TanStack Router.

```tsx
type NavigateOptions = ToOptions & {
  replace?: boolean
  resetScroll?: boolean
  hashScrollIntoView?: boolean | ScrollIntoViewOptions
  ignoreBlocker?: boolean
  reloadDocument?: boolean
  href?: string
}
```

## NavigateOptions properties

The `NavigateOptions` object accepts the following properties:

### `replace`

- Type: `boolean`
- Optional
- Defaults to `false`.
- If `true`, the location will be committed to the browser history using `history.replace` instead of `history.push`.

### `resetScroll`

- Type: `boolean`
- Optional
- Defaults to `true` so that the scroll position will be reset to 0,0 after the location is committed to the browser history.
- If `false`, the scroll position will not be reset to 0,0 after the location is committed to history.

### `ignoreBlocker`

- Type: `boolean`
- Optional
- Defaults to `false`.
- If `true`, navigation will ignore any blockers that might prevent it.

### `reloadDocument`

- Type: `boolean`
- Optional
- Defaults to `false`.
- If `true`, navigation to a route inside of router will trigger a full page load instead of the traditional SPA navigation.

### `href`

- Type: `string`
- Optional
- This can be used instead of `to` to navigate to a fully built href, e.g. pointing to an external target.

- [`ToOptions`](./ToOptionsType.md)
