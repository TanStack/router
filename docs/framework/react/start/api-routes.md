---
id: api-routes
title: API Routes
---

API routes are a powerful feature of TanStack Start that allow you to create server-side endpoints in your application without the need for a separate server. API routes are useful for handling form submissions, user authentication, and more.

By default, API routes are defined in your `./app/routes/api` directory of your project and are automatically handled by the TanStack Start server.

> 🧠 This means that by default, your API routes will be prefixed with `/api` and will be served from the same server as your application. You can customize this base path by changing the `apiBase` in your TanStack Start config.
