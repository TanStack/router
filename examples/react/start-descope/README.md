# TanStack Start + Descope

A [TanStack Start](https://tanstack.com/start) example demonstrating how to authenticate users with [Descope](https://www.descope.com): the [`@descope/react-sdk`](https://www.npmjs.com/package/@descope/react-sdk) renders the sign-in flow on the client, and the [`@descope/node-sdk`](https://www.npmjs.com/package/@descope/node-sdk) validates sessions on the server during SSR.

- [TanStack Router Docs](https://tanstack.com/router)
- [Descope Documentation](https://docs.descope.com)

## Start a new project based on this example

To start a new project based on this example, run:

```sh
npx gitpick TanStack/router/tree/main/examples/react/start-descope start-descope
```

## Prerequisites

You will need a [Descope account](https://www.descope.com/sign-up). Every project ships with a default `sign-up-or-in` flow, which is what this example renders — no extra flow setup is required.

## Running the example

1. Grab your **Project ID** from the [Descope console](https://app.descope.com/settings/project).
2. Copy `.env.example` to `.env` and fill in your Project ID:

   ```bash
   cp .env.example .env
   ```

   ```bash
   # Exposed to the browser for the client-side auth flow (must be VITE_ prefixed)
   VITE_DESCOPE_PROJECT_ID=<YOUR_PROJECT_ID>
   # The same Project ID, read by the server to validate sessions
   DESCOPE_PROJECT_ID=<YOUR_PROJECT_ID>
   ```

   > [!NOTE]
   > If you are using a custom domain (CNAME), or a private environment (for example `star`), also set `VITE_DESCOPE_BASE_URL` and `DESCOPE_BASE_URL`.

3. Run the following command and navigate to [http://localhost:3000](http://localhost:3000).

   ```bash
   pnpm dev
   ```

## Build

Build for production:

```sh
pnpm build
```

## About This Example

This example demonstrates:

- Descope authentication via the hosted `sign-up-or-in` flow (`<Descope flowId="sign-up-or-in" />`)
- Self-service account management via the `<UserProfile />` widget (name, avatar, passkeys, MFA)
- Server-side session validation during SSR with `@descope/node-sdk`, wired through TanStack Start request middleware
- Protected routes guarded in `beforeLoad`
- User session management (login, logout, session refresh)

### How it works

The Descope integration lives in `src/integrations/descope/`:

- **`provider.tsx`** — a client `<DescopeProvider>` wrapping `<AuthProvider>` from `@descope/react-sdk`. Passing `sessionTokenViaCookie` stores the session token in a cookie so it is sent with the SSR document request (rather than living only in local storage). Used in `src/routes/__root.tsx`.
- **`middleware.ts`** — `descopeMiddleware()`, registered in `src/start.ts` as a TanStack Start `requestMiddleware`. It runs on every server request, validates/refreshes the session, and puts the user on the global start context.
- **`session.server.ts`** — the server-only logic: reads the `DS` (session) and `DSR` (refresh) cookies, calls `validateAndRefreshSession`, and persists a rotated session cookie. This is the only module that imports `@descope/node-sdk`.
- **`server.ts`** — a `getSession` server function that reads the user off the global context (works during SSR and client-side navigation). The root route's `beforeLoad` exposes it as `context.user`.

Routes:

- **Login** — `src/routes/login.tsx` renders the `<Descope>` flow component. On success it invalidates the router so the server re-reads the new session.
- **Protected routes** — `src/routes/_authed.tsx` redirects to `/login` when there is no `context.user`; `src/routes/_authed/profile.tsx` renders the Descope `<UserProfile />` widget (every project ships a default `user-profile-widget`) and shows the resolved session.
- **Logout** — `src/routes/logout.tsx` calls `useDescope().logout()` and clears the server cookies.
