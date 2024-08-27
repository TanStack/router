---
id: api-routes
title: API Routes
---

API routes are a powerful feature of TanStack Start that allow you to create server-side endpoints in your application without the need for a separate server. API routes are useful for handling form submissions, user authentication, and more.

By default, API routes are defined in your `./app/routes/api` directory of your project and are automatically handled by the TanStack Start server.

> 🧠 This means that by default, your API routes will be prefixed with `/api` and will be served from the same server as your application. You can customize this base path by changing the `apiBase` in your TanStack Start config.

## File Route Conventions

API routes in TanStack Start, follow the same file-based routing conventions as TanStack Router. This means that each file in your `routes` directory that is prefixed with `api` (which can be configured) will be treated as an API route. Here are a few examples:

- `routes/api.users.ts` will create an API route at `/api/users`
- `routes/api/users.ts` will **also** create an API route at `/api/users`
- `routes/api/users.index.ts` will **also** create an API route at `/api/users`
- `routes/api/users/$id.ts` will create an API route at `/api/users/$id`
- `routes/api/users/$id/posts.ts` will create an API route at `/api/users/$id/posts`
- `routes/api.users.$id.posts.ts` will **also** create an API route at `/api/users/$id/posts`
- `routes/api/file/$.ts` will create an API route at `/api/file/$`

Your route files that are prefixed with `api`, can be thought of as the handlers for the given API route path. It's important to remember that each route can only have a single handler file associated with it.

So, if you have a file named `routes/api/users.ts` which'd equal the request path of `/api/users`, you cannot have other files that'd also resolve to the same route, like:

- `routes/api/users.index.ts`
- `routes/api.users.ts`.
- `routes/api.users.index.ts`.

❗ One more thing, API routes do not have the concept of pathless/layout routes or parallel routes. So, a file named:

- `routes/api/_layout/users.ts` would resolve to `/api/_layout/users` and NOT `/api/users`.

## Directories vs File-names

In the examples above, you may have noticed that the file naming conventions are flexible and allow you to mix and match directories and file names. This is intentional and allows you to organize your API routes in a way that makes sense for your application.

So you can choose to organize your API routes in a flat structure 🫓:

```bash
routes/
  api.users.ts
  api.posts.ts
  api.comments.ts
```

Or you can choose to organize your API routes in a nested structure ⛰️:

```bash
routes/
  api/
    users.ts
    posts.ts
    comments.ts
```

Or even a combination of both 🤯:

```bash
routes/
  api.users.ts
  api/
    posts.ts
    comments.ts
```
