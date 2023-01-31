---
title: Navigation
---

Believe it or not, every navigation within an app is **relative**, even if you aren't using explicit relative path syntax (`../../somewhere`). Any time a link is clicked or an imperative navigation call is made, you will always have an **origin** path and a **destination** path which means you are navigating **from** one route **to** another route.

TanStack Router keeps this constant concept of relative navigation in mind for every navigation, so you'll constantly see two properties in the API:

- `from` - The origin route ID
- `to` - The destination route ID

> ⚠️ Not supplying a `from` route ID will assume you are navigation from the root `/` route and only auto-complete absolute paths. After all, you need to know where you are from in order to know where you're going 😉.

Navigating in TanStack Router comes in a few flavors:

- The `<Link>` component
- The `<Navigate>` component
- The `useNavigate()` hook
- The `Router.navigate()` method

## `<Link>` Components

It takes a `to` prop, which . If a string is passed, it will be used as the route's path. If a route object is passed, it will be used as the route's path, and any additional props will be passed to the route's component.

```tsx

```
