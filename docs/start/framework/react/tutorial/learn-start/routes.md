---
id: learn-start-routes
title: Learn Start, Give Notes Their Own URLs
description: Add typed note links, route parameters, validated search values, and a real not-found response to the Field notes app.
---

This chapter turns the single page into a searchable list and a detail page. Use the [working checkpoint](https://github.com/TanStack/router/tree/main/examples/react/start-learn/checkpoints/02-routes) in `checkpoints/02-routes` as the reference. It still uses static data so you can check routing before introducing database failures.

From `examples/react/start-learn`, start this checkpoint:

```sh
pnpm exec vite checkpoints/02-routes --port 3141
```

## Add the note data

Create `src/notes.ts` with two entries. Each has a stable `slug`, a `title`, and a `body`. The checkpoint uses `first-route` and `server-html` as its slugs. The next chapter will move reads behind a server function; for now this file is safe to include in browser code because every field is public sample content.

## Match a route parameter

Add `src/routes/notes.$slug.tsx`. The `$slug` segment matches the part of the URL after `/notes/`. Its loader selects the matching note:

```tsx
export const Route = createFileRoute('/notes/$slug')({
  loader: ({ params }) => {
    const note = notes.find((item) => item.slug === params.slug)
    if (!note) {
      throw notFound()
    }
    return note
  },
  component: Note,
})
```

Import `createFileRoute` and `notFound` from `@tanstack/react-router` and `notes` from `../notes`. The component reads its result with `Route.useLoaderData()` and renders the note's title and body. The complete route is in the checkpoint.

Using `notFound()` means `/notes/does-not-exist` returns a missing-resource response. Do not return an ordinary successful page whose text happens to say “not found.” The root route provides the recovery link back to the list.

## Link with typed parameters

In the list, use `Link` rather than assembling a path by hand:

```tsx
<Link to="/notes/$slug" params={{ slug: note.slug }}>
  {note.title}
</Link>
```

The route tree supplies the parameter types. Renaming a route or parameter gives TypeScript a chance to find its callers.

## Put the filter in the URL

The index route validates the search value before the component reads it:

```tsx
validateSearch: (search: Record<string, unknown>) => ({
  q: typeof search.q === 'string' ? search.q : '',
}),
```

`Route.useSearch()` returns this validated value. Filter the list by title, and render a GET form with an input named `q`. Submitting that form produces a shareable URL such as `/?q=server`, with no custom event handler required. A query value with the wrong type falls back to an empty filter.

The detail route links back with an explicit empty search value:

```tsx
<Link to="/" search={{ q: '' }}>
  All notes
</Link>
```

That link intentionally clears the filter. The browser Back button returns to the previous filtered URL instead.

## Check the result

Open `/?q=server`, choose **Reading server HTML**, and use Back. The filter should still be `server`. Then request `/notes/does-not-exist` and inspect the HTTP status, which should be 404.

Stop the development server and run:

```sh
COURSE_CHECKPOINT=02-routes pnpm test:e2e
```

The test covers the filtered list, detail navigation, browser Back, and the raw 404 response. If navigation works but the status is 200, check that the loader throws `notFound()` before returning content.

Next: [Read notes from PostgreSQL](./data).
