# TanStack Start - Module Federation Example

Two TanStack Start apps composed at runtime with
[Module Federation](https://module-federation.io) through
[`@module-federation/tanstack`](https://github.com/module-federation/tanstack).

- `host/` (port 3000) owns the routes, the document and the server.
- `remote/` (port 3001) is a catalog app that exposes `ProductList` and
  `ProductDetail` as `catalog/ProductList` and `catalog/ProductDetail`.

The host renders the remote's components on the server, so their markup and
stylesheets are in the initial HTML, and they hydrate in the browser.

- [TanStack Start Docs](https://tanstack.com/start)
- [Module Federation Docs](https://module-federation.io)

## Getting Started

From your terminal:

```sh
pnpm install
pnpm dev
```

This starts both apps. Open the host at http://127.0.0.1:3000 and go to
Products. The remote also runs on its own at http://127.0.0.1:3001.

## Build

To build both apps for production and serve them:

```sh
pnpm build
pnpm preview
```

## How it works

- `tanstackStartModuleFederation()` goes before `tanstackStart()` in each
  `vite.config.ts`. The remote declares `exposes`, the host declares `remotes`.
- React and TanStack Router are shared singletons, so the remote's `<Link>`
  navigates with the host's router and its state hooks use the host's React.
- Each host route preloads its remote module and stylesheets in the `loader`
  (see `host/src/catalog.ts`). That puts the remote's markup and CSS in the
  server response.
- Components are created with `lazyRemote`, which retries after a failure, and
  render inside `RemoteBoundary`, so an offline remote shows a fallback instead
  of failing the route.
- `host/src/remotes.d.ts` types the exposed modules. Route params stay typed in
  the host and are passed to the remote as props.
- The remote mirrors the host's `/products` paths, so its links work both
  standalone and inside the host.
