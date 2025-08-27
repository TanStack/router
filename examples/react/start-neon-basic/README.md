# TanStack Start + Neon Auth Example

SSR-compatible authentication with Neon Auth and TanStack Start.

- [TanStack Router Docs](https://tanstack.com/router)
- [Neon Auth Documentation](https://neon.com/docs/neon-auth/overview)

## Features

- **Neon Auth Integration** - Complete authentication flow with Neon Auth (based on Stack Auth)
- **SSR Compatible** - Works with TanStack Start's server-side rendering
- **Auto Database Setup** - Neon Launchpad creates database connection
- **Modern UI** - Clean interface with Tailwind CSS

## Quickest (impatient) Start

```bash
npx gitpick TanStack/router/tree/main/examples/react/start-neon-basic start-neon-basic
cd start-neon-basic
npm install
npm run dev
```

## Quick Start

1. **Install dependencies:**
   ```bash
   pnpm install
   cp env.example .env
   ```

2. **Get your Neon Auth credentials:**
   - [Neon Launchpad](https://neon.com/docs/reference/neon-launchpad) will automatically create a Neon project for you
   - Claim your project when prompted (a browser tab will open automatically, and the claim URL is also saved to .env)
   - Go to the "Auth" section in your project dashboard, enable Auth, and get your credentials
   - Edit `.env` and replace these values with your actual credentials:

     ```bash
     VITE_STACK_PROJECT_ID=your_actual_project_id
     VITE_STACK_PUBLISHABLE_CLIENT_KEY=your_actual_publishable_key
     STACK_SECRET_SERVER_KEY=your_actual_secret_key
     ```

3. **Run:** `pnpm dev` → Visit `http://localhost:3000`

## Environment Variables

- `VITE_STACK_PROJECT_ID` - Neon Auth project ID
- `VITE_STACK_PUBLISHABLE_CLIENT_KEY` - Neon Auth publishable key
- `STACK_SECRET_SERVER_KEY` - Neon Auth secret key (server-side only)

### Database Auto-Creation

This example uses the `@neondatabase/vite-plugin-postgres` plugin which automatically:
- Creates a Neon database connection via [Neon Launchpad](https://neon.com/docs/reference/neon-launchpad)
- Sets up the `DATABASE_URL` environment variable
- Handles database initialization

You can override this by setting your own `DATABASE_URL` in the `.env` file before running `pnpm dev`.

## How It Works

- **Auth Flow**: Login/Signup → Neon Auth → `/handler/*` callback → Redirect
- **Handler Route**: `src/routes/handler.$.tsx` (client-only, catch-all)
- **SSR Safe**: Uses `useState` + `useEffect` pattern

## Project Structure

```
src/
├── routes/
│   ├── __root.tsx          # Root with StackProvider
│   ├── handler.$.tsx       # Auth callbacks (client-only)
│   ├── index.tsx           # Home page
│   └── _authed/            # Protected routes
├── stack.ts                # Stack Auth configuration
└── utils/                  # Database utilities
```

## Troubleshooting

- **404 on `/handler/sign-in`**: Ensure file is named `handler.$.tsx`
- **SSR errors**: All Stack Auth components must be client-only
- **Route conflicts**: Delete `src/routeTree.gen.ts` and restart

See [docs/AUTHENTICATION_TROUBLESHOOTING.md](./docs/AUTHENTICATION_TROUBLESHOOTING.md) for detailed solutions.
