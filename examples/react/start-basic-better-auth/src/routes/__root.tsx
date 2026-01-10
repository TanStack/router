/// <reference types="vite/client" />
import type { ReactNode } from "react";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth, type AuthSession } from "~/utils/auth";
import { authClient } from "~/utils/auth-client";
import appCss from "~/styles/app.css?url";

export interface RouterContext {
  session: AuthSession | null;
}

const fetchSession = createServerFn({ method: "GET" }).handler(async () => {
  const headers = getRequestHeaders();
  const session = await auth.api.getSession({ headers });
  return session;
});

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async () => {
    const session = await fetchSession();
    return {
      session,
    };
  },
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "TanStack Start Auth Example",
      },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <NavBar />
        <main className="p-4">{children}</main>
        <TanStackRouterDevtools position="bottom-right" />
        <Scripts />
      </body>
    </html>
  );
}

function NavBar() {
  const router = useRouter();
  const routeContext = Route.useRouteContext();

  const handleSignOut = async () => {
    await authClient.signOut();
    await router.invalidate();
    await router.navigate({ to: "/" });
  };

  return (
    <nav className="p-4 flex gap-4 items-center bg-gray-100">
      <Link
        to="/"
        activeProps={{ className: "font-bold" }}
        activeOptions={{ exact: true }}
      >
        Home
      </Link>
      <Link to="/protected" activeProps={{ className: "font-bold" }}>
        Protected
      </Link>
      <div className="ml-auto flex items-center gap-4">
        {routeContext.session ? (
          <>
            <span className="text-gray-600">
              {routeContext.session?.user?.name ||
                routeContext.session?.user?.email}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 cursor-pointer"
            >
              Sign Out
            </button>
          </>
        ) : (
          <Link
            to="/login"
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Sign In
          </Link>
        )}
      </div>
    </nav>
  );
}
