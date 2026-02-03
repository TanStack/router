# TanStack Start - Ory Auth Example

A TanStack Start example demonstrating authentication with [Ory Kratos](https://www.ory.com/docs/kratos/quickstart).
Routes are guarded via route context, and all Ory API calls are made through server functions using the
[`@ory/client-fetch`](https://github.com/ory/sdk) SDK.

- [TanStack Router Docs](https://tanstack.com/router)
- [Ory Kratos Docs](https://www.ory.com/docs/kratos/quickstart)
- [Ory SDK (client-fetch)](https://github.com/ory/sdk)

## Start a new project based on this example

```sh
npx gitpick TanStack/router/tree/main/examples/react/start-basic-ory start-basic-ory
```

## Prerequisites

- [Node.js](https://nodejs.org) 20+
- [pnpm](https://pnpm.io)
- An Ory identity provider running and accessible. See the two options below.

## Option A — Ory Network + Ory Tunnel (recommended for new projects)

Ory Tunnel proxies Ory Network (cloud) APIs onto `localhost:4000`, which is the same origin the app expects.
This avoids CORS and cookie-domain issues without running anything in Docker.

1. Install the Ory CLI:

```sh
npm install -g @ory/ory-cli
```

2. Log in and create a project (skip if you already have one):

```sh
ory login
ory create project --name "my-ory-project"
```

   Note the **project ID** and **workspace ID** that are printed.

3. Start the tunnel. It exposes Ory APIs at `http://localhost:4000` by default,
   which matches the `VITE_ORY_SDK_URL` default in this example:

```sh
ory tunnel --project <project-id> --workspace <workspace-id> http://localhost:3000
```

   Keep this process running in a separate terminal while you develop.

4. In another terminal, start the app (see [Getting Started](#getting-started) below).
   Access it through the tunnel URL (`http://localhost:4000`) rather than `http://localhost:3000`
   so that cookies and CSRF tokens share the same domain.

## Option B — Self-hosted Kratos in Docker

Use this option if you want a fully local setup with no cloud dependency.

1. Clone the Kratos repo and run the standalone quickstart:

```sh
git clone --depth 1 https://github.com/ory/kratos.git
cd kratos
docker-compose -f quickstart.yml -f quickstart-standalone.yml up --force-recreate
```

   This starts:
   - Kratos public API on `http://localhost:4433`
   - Kratos admin API on `http://localhost:4434`
   - The Ory self-service UI on `http://localhost:4455`

2. Set `VITE_ORY_SDK_URL` to point at the Kratos public API:

```sh
export VITE_ORY_SDK_URL=http://localhost:4433
```

3. Start the app (see [Getting Started](#getting-started) below).

   > **Note:** In standalone mode the self-service UI (`localhost:4455`) handles login and
   > registration pages. Your app's Login link will redirect there. Cookie domains work
   > because everything runs on `127.0.0.1`.

## Getting Started

From your terminal:

```sh
pnpm install
pnpm dev
```

This starts the app in development mode on `http://localhost:3000`, rebuilding assets on file changes.

## Build

To build the app for production:

```sh
pnpm build
```

To preview the production build locally:

```sh
pnpm preview
```
