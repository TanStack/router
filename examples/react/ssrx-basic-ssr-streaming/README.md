# Example

To run this example in development:

- `pnpm i`
- `pnpm dev`

There should be no flash of unstyled content, and hot reloading should work for the client and server.

To run the production build:

- `pnpm build`
- `pnpm start`

Visit a url that includes lazy loaded routes, such as `http://localhost:3000/admin/members`. The relevant preload links should be injected into the document head for the lazy loaded assets.
