# TanStack Start - Deferred Head Example

This example demonstrates deferred head loading in TanStack Router: returning a `Promise` in `meta`, `links`, `scripts`, or `styles` so the page renders immediately while head data is fetched in the background. Crawlers receive fully-resolved tags in the initial response for correct indexing and social previews.

The `/deferred` route fetches page data with a 2-second delay and uses the resolved values to set title, description, Open Graph tags, canonical/hreflang links, and JSON-LD structured data.

- [TanStack Router Docs](https://tanstack.com/router)

## Start a new project based on this example

To start a new project based on this example, run:

```sh
npx gitpick TanStack/router/tree/main/examples/react/start-deferred-head start-deferred-head
```

## Getting Started

From your terminal:

```sh
pnpm install
pnpm dev
```

This starts your app in development mode, rebuilding assets on file changes.

## Build

To build the app for production:

```sh
pnpm build
```
