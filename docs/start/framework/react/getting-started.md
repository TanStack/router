---
id: getting-started
title: Getting Started
---

## Migrate an existing project from another framework

- [Start a new project from scratch](#start-a-new-project-from-scratch) to quickly learn how Start works (see below)
- Refer to a migration guide for your specific framework:
  - [Next.js](../migrate-from-next-js)
  - [React Router](../migrate-from-react-router) (Including React Router 7 "Data Mode")
  - Remix 2 / React Router 7 "Framework Mode" (coming soon!)

## Quickly scaffolding a new project

To get a new project scaffolded, simply run

```
pnpm create @tanstack/start@latest
```

or

```
npm create @tanstack/start@latest
```

depending on your package manage of choice. You'll be prompted to add things like Tailwind, eslint, and a ton of other options.

## Manually starting a new project from scratch

Choose one of the following options to start building a _new_ TanStack Start project:

- [TanStack Builder](#) (coming soon!) - A visual interface to configure new TanStack projects with a few clicks
- [TanStack Start CLI](https://github.com/TanStack/create-tsrouter-app/blob/main/cli/create-start-app/README.md) via `npx create-start-app@latest` - Local, fast, and optionally customizable
- [Quick Start Examples](../quick-start) Download or clone one of our official examples
- [Build a project from scratch](../build-from-scratch) - A guide to building a TanStack Start project line-by-line, file-by-file.

## Next Steps

Unless you chose to build a project from scratch, you can now move on to the [Routing](../routing) guide to learn how to use TanStack Start!
