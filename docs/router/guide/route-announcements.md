---
title: Route Announcements
---

When a link loads a new document, the browser starts focus at the top of the new page and screen readers read its title. A client-side navigation does neither: focus stays on the link that was clicked, or is lost if that link unmounts, and a screen reader user gets no sign that the page changed.

The `<RouteAnnouncer />` component brings both back. After a client-side navigation to a new path, it:

- moves focus to the new page's `h1`, or to `<main>` if there is no `h1`, without scrolling. An element that is not focusable gets `tabindex="-1"`.
- writes `document.title` into a visually hidden `aria-live="polite"` region, so screen readers announce it. Without a title, it announces the text of the `h1`, then the pathname.

It runs on the `onRendered` [router event](./router-events.md), so the title from the new route's `head` is already in the document and [scroll restoration](./scroll-restoration.md) has already run.

A navigation that only changes the search params or the hash leaves focus and the live region alone, so filters, tabs and in-page links work as before. The first render is also left alone: after server rendering, the browser has already read that page.

## Usage

Render it once, in the root route, so that the live region is in the document (and in the server-rendered HTML) before its text changes:

```tsx
import { Outlet, RouteAnnouncer, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <>
      <RouteAnnouncer />
      <Header />
      <main>
        <Outlet />
      </main>
    </>
  ),
})
```

`RouteAnnouncer` is exported by `@tanstack/react-router`, `@tanstack/solid-router` and `@tanstack/vue-router`.

## Choosing the Focus Target

`focusSelectors` lists the selectors to try, in order. The first element found gets focus. The default is `['h1', 'main']`. If your layout has an `h1` outside the page content, such as a logo, point it at the page heading:

```tsx
<RouteAnnouncer focusSelectors={['main h1', 'main']} />
```

Pass an empty array to leave focus where it is and only announce the new page:

```tsx
<RouteAnnouncer focusSelectors={[]} />
```
