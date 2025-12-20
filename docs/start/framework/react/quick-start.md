---
id: quick-start
title: Quick Start
---

## Impatient?

The fastest way to get a Start project up and running is with the cli. Just run

```
pnpm create @tanstack/start@latest
```

or

```
npm create @tanstack/start@latest
```

depending on your package manager of choice. You'll be prompted to add things like Tailwind, eslint, and a ton of other options.

You can also clone and run the [Basic](https://github.com/TanStack/router/tree/main/examples/react/start-basic) example right away with the following commands:

```bash
npx gitpick TanStack/router/tree/main/examples/react/start-basic start-basic
cd start-basic
npm install
npm run dev
```

If you'd like to use a different example, you can replace `start-basic` above with the slug of the example you'd like to use from the list below.

Once you've cloned the example you want, head back to the [Routing](./guide/routing) guide to learn how to use TanStack Start!

## Examples

TanStack Start has load of examples to get you started. Pick one of the examples below to get started!

- [Basic](https://github.com/TanStack/router/tree/main/examples/react/start-basic) (start-basic)
- [Basic + Auth](https://github.com/TanStack/router/tree/main/examples/react/start-basic-auth) (start-basic-auth)
- [Counter](https://github.com/TanStack/router/tree/main/examples/react/start-counter) (start-counter)
- [Basic + React Query](https://github.com/TanStack/router/tree/main/examples/react/start-basic-react-query) (start-basic-react-query)
- [Clerk Auth](https://github.com/TanStack/router/tree/main/examples/react/start-clerk-basic) (start-clerk-basic)
- [Convex + Trellaux](https://github.com/TanStack/router/tree/main/examples/react/start-convex-trellaux) (start-convex-trellaux)
- [Supabase](https://github.com/TanStack/router/tree/main/examples/react/start-supabase-basic) (start-supabase-basic)
- [Trellaux](https://github.com/TanStack/router/tree/main/examples/react/start-trellaux) (start-trellaux)
- [WorkOS](https://github.com/TanStack/router/tree/main/examples/react/start-workos) (start-workos)
- [Material UI](https://github.com/TanStack/router/tree/main/examples/react/start-material-ui) (start-material-ui)

### Stackblitz

Each example above has an embedded stackblitz preview to find the one that feels like a good starting point

### Quick Deploy

To quickly deploy an example, click the **Deploy to Netlify** button on an example's page to both clone and deploy the example to Netlify.

### Manual Deploy

To manually clone and deploy the example to anywhere else you'd like, use the following commands replacing `EXAMPLE_SLUG` with the slug of the example you'd like to use from above:

```bash
npx gitpick TanStack/router/tree/main/examples/react/EXAMPLE_SLUG my-new-project
cd my-new-project
npm install
npm run dev
```

Once you've clone or deployed an example, head back to the [Routing](./guide/routing) guide to learn how to use TanStack Start!

## Other Router Examples

While not Start-specific examples, these may help you understand more about how TanStack Router works:

- [Quickstart (file-based)](https://github.com/TanStack/router/tree/main/examples/react/quickstart-file-based)
- [Basic (file-based)](https://github.com/TanStack/router/tree/main/examples/react/basic-file-based)
- [Kitchen Sink (file-based)](https://github.com/TanStack/router/tree/main/examples/react/kitchen-sink-file-based)
- [Kitchen Sink + React Query (file-based)](https://github.com/TanStack/router/tree/main/examples/react/kitchen-sink-react-query-file-based)
- [Location Masking](https://github.com/TanStack/router/tree/main/examples/react/location-masking)
- [Authenticated Routes](https://github.com/TanStack/router/tree/main/examples/react/authenticated-routes)
- [Scroll Restoration](https://github.com/TanStack/router/tree/main/examples/react/scroll-restoration)
- [Deferred Data](https://github.com/TanStack/router/tree/main/examples/react/deferred-data)
- [Navigation Blocking](https://github.com/TanStack/router/tree/main/examples/react/navigation-blocking)
- [View Transitions](https://github.com/TanStack/router/tree/main/examples/react/view-transitions)
- [With tRPC](https://github.com/TanStack/router/tree/main/examples/react/with-trpc)
- [With tRPC + React Query](https://github.com/TanStack/router/tree/main/examples/react/with-trpc-react-query)
