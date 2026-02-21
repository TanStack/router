---
name: start-quick-start
---

# Quick Start

The fastest way to create a TanStack Start project.

## Create New Project

```bash
# Using npm
npm create @tanstack/start@latest

# Using pnpm
pnpm create @tanstack/start@latest
```

The CLI will prompt you to configure:

- Project name
- Tailwind CSS
- ESLint
- Other options

## Clone an Example

```bash
# Clone basic example
npx gitpick TanStack/router/tree/main/examples/react/start-basic my-app
cd my-app
npm install
npm run dev
```

## Available Examples

| Example             | Slug                      | Description                  |
| ------------------- | ------------------------- | ---------------------------- |
| Basic               | `start-basic`             | Minimal starter              |
| Basic + Auth        | `start-basic-auth`        | Session-based authentication |
| Basic + React Query | `start-basic-react-query` | React Query integration      |
| Clerk Auth          | `start-clerk-basic`       | Clerk authentication         |
| Supabase            | `start-supabase-basic`    | Supabase integration         |
| Convex + Trellaux   | `start-convex-trellaux`   | Convex database              |
| Material UI         | `start-material-ui`       | MUI components               |
| WorkOS              | `start-workos`            | WorkOS authentication        |

## Clone Any Example

```bash
npx gitpick TanStack/router/tree/main/examples/react/EXAMPLE_SLUG my-project
cd my-project
npm install
npm run dev
```

Replace `EXAMPLE_SLUG` with the slug from the table above.

## After Setup

1. Start development: `npm run dev`
2. Learn routing: See `router/routing` section
3. Add server functions: See `start/server-functions` section
4. Configure deployment: See `start/deployment` section
