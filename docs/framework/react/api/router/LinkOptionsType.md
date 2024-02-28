---
id: LinkOptionsType
title: LinkOptions type
---

The `LinkOptions` type extends the [`NavigateOptions`](./api/router/NavigateOptionsType) type and contains additional options that can be used by TanStack Router when handling actual anchor element attributes.

```tsx
type LinkOptions = NavigateOptions & {
  target?: HTMLAnchorElement['target']
  activeOptions?: ActiveOptions
  preload?: false | 'intent'
  preloadDelay?: number
  disabled?: boolean
}
```

## LinkOptions `properties`

The `LinkOptions` object accepts/contains the following properties:

### `target`

- Type: `HTMLAnchorElement['target']`
- Optional
- The standard anchor tag target attribute

### `activeOptions`

- Type: `ActiveOptions`
- Optional
- The options that will be used to determine if the link is active

### `preload`

- Type: `false | 'intent'`
- Optional
- If set, will preload the linked route on hover and cache it for this many milliseconds in hopes that the user will eventually navigate there.

### `preloadDelay`

- Type: `number`
- Optional
- Delay intent preloading by this many milliseconds. If the intent exits before this delay, the preload will be cancelled.

### `disabled`

- Type: `boolean`
- Optional
- If true, will render the link without the href attribute

