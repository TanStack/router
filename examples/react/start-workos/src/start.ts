import { createStart, createCsrfMiddleware } from '@tanstack/react-start';
import { authkitMiddleware } from '@workos/authkit-tanstack-react-start';

/**
 * Reject cross-site requests to server-function RPC endpoints.
 *
 * Defining a `startInstance` with a custom `requestMiddleware` list opts the app
 * out of the CSRF middleware TanStack Start applies by default, so we add it back
 * here. It's a pure header check (Sec-Fetch-Site / Origin / Referer) — no tokens,
 * no interaction with the AuthKit session cookie. Scoped to server functions so
 * cross-site flows like the WorkOS OAuth callback navigation are not blocked.
 */
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
});

/**
 * Configure TanStack Start with AuthKit middleware.
 * The middleware runs on every server request and provides auth context.
 */
export const startInstance = createStart(() => {
  return {
    // CSRF first so cross-site requests are rejected before any session work runs
    requestMiddleware: [csrfMiddleware, authkitMiddleware()],
  };
});
