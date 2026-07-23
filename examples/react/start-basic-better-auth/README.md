# TanStack Start - Better Auth Example

A TanStack Start example demonstrating authentication with Better Auth.

- [TanStack Router Docs](https://tanstack.com/router)
- [Better Auth Documentation](https://www.better-auth.com/)

## Start a new project based on this example

To start a new project based on this example, run:

```sh
npx gitpick TanStack/router/tree/main/examples/react/start-basic-better-auth start-basic-better-auth
```

## Setup

This example requires environment variables for Better Auth configuration. Copy the `.env.example` file to `.env` and fill in your GitHub OAuth credentials:

```sh
cp .env.example .env
```

### GitHub OAuth Setup

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in:
   - Application name: Your app name
   - Homepage URL: `http://localhost:10000`
   - Authorization callback URL: `http://localhost:10000/api/auth/callback/github`
4. Copy the Client ID and Client Secret to your `.env` file

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

## Authentication Configuration

This example demonstrates how to integrate Better Auth with TanStack Start. Check the source code for examples of:

- Configuring social authentication providers
- Protecting routes with authentication
- Accessing session data in server functions

### Key Files

- `src/utils/auth.ts` - Better Auth server configuration
- `src/utils/auth-client.ts` - Better Auth client setup
- `src/routes/__root.tsx` - Session fetching and navigation
- `src/routes/protected.tsx` - Example of a protected route
