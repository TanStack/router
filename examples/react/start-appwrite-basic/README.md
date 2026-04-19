# TanStack Start - Appwrite Example

A TanStack Start example demonstrating integration with [Appwrite](https://appwrite.io) for authentication.

- [TanStack Router Docs](https://tanstack.com/router)
- [Appwrite Documentation](https://appwrite.io/docs)

## Start a new project based on this example

To start a new project based on this example, run:

```sh
npx gitpick TanStack/router/tree/main/examples/react/start-appwrite-basic start-appwrite-basic
```

## Setup

This example uses Appwrite's [Server-Side Rendering flow](https://appwrite.io/docs/products/auth/server-side-rendering)
with the [`node-appwrite`](https://www.npmjs.com/package/node-appwrite) SDK. The `.env` file
contains the environment variables the server needs:

```env
APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=your-project-id
APPWRITE_API_KEY=your-server-api-key
```

You'll need to:

1. Create an Appwrite project at [cloud.appwrite.io](https://cloud.appwrite.io) (or self-host)
2. Enable the **Email/Password** authentication method in **Auth → Settings**
3. Create a server **API Key** with at least the `sessions.write` and `users.write` scopes
4. Copy the project ID and API key into the `.env` file

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

## Appwrite Integration

This example demonstrates:

- Email/password sign up and sign in with Appwrite's Account service
- SSR-safe auth state using a session-secret cookie read on the server
- Server functions (`createServerFn`) that use the SSR `node-appwrite` SDK
