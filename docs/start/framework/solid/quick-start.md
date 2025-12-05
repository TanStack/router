---
id: quick-start
title: Quick Start
---

## Impatient?

The fastest way to get a Start project up and running is with the cli. Just run

```
pnpm create @tanstack/start@latest --framework solid
```

or

```
npm create @tanstack/start@latest -- --framework solid
```

depending on your package manage of choice. You'll be prompted to add things like Tailwind, eslint, and a ton of other options.

You can also clone and run the [Basic](https://github.com/TanStack/router/tree/main/examples/solid/start-basic) example right away with the following commands:

```bash
npx gitpick TanStack/router/tree/main/examples/solid/start-basic start-basic
cd start-basic
npm install
npm run dev
```

If you'd like to use a different example, you can replace `start-basic` above with the slug of the example you'd like to use from the list below.

Once you've cloned the example you want, head back to the [Routing](./guide/routing) guide to learn how to use TanStack Start!

## Examples

TanStack Start has load of examples to get you started. Pick one of the examples below to get started!

- [Bare](https://github.com/TanStack/router/tree/main/examples/solid/start-bare) (start-bare)
- [Basic](https://github.com/TanStack/router/tree/main/examples/solid/start-basic) (start-basic)
- [Basic Static](https://github.com/TanStack/router/tree/main/examples/solid/start-basic-stats) (start-basic-static)
- [Counter](https://github.com/TanStack/router/tree/main/examples/solid/start-counter) (start-counter)

### Stackblitz

Each example above has an embedded stackblitz preview to find the one that feels like a good starting point

### Quick Deploy

To quickly deploy an example, click the **Deploy to Netlify** button on an example's page to both clone and deploy the example to Netlify.

### Manual Deploy

To manually clone and deploy the example to anywhere else you'd like, use the following commands replacing `EXAMPLE_SLUG` with the slug of the example you'd like to use from above:

```bash
npx gitpick TanStack/router/tree/main/examples/solid/EXAMPLE_SLUG my-new-project
cd my-new-project
npm install
npm run dev
```

Once you've clone or deployed an example, head back to the [Routing](./guide/routing) guide to learn how to use TanStack Start!
