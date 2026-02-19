---
id: quick-start
title: Quick Start
---

## Impatient?

The fastest way to get a Start project up and running is with [TanStack Builder](https://tanstack.com/builder) or the CLI.

### Builder (recommended)

Open [TanStack Builder](https://tanstack.com/builder), choose your framework/toolchain/deployment/add-ons, and generate a project.

### CLI

Run:

```
npx @tanstack/cli create
```

You'll be prompted to add things like Tailwind, eslint, and a ton of other options.

### Canonical issue repro baseline

We keep exactly one lightweight React Start baseline for reproductions and bug reports:

- [start-basic](https://github.com/TanStack/router/tree/main/examples/react/start-basic)

Clone it with:

```bash
npx gitpick TanStack/router/tree/main/examples/react/start-basic start-basic
cd start-basic
npm install
npm run dev
```

If you're looking for full templates (blog, resume, and more), use [TanStack Builder](https://tanstack.com/builder).

Once you've created your project, head to the [Routing](./guide/routing) guide.
