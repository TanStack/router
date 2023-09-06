import { Route } from "@/types";
import { Link, Outlet } from "@tanstack/react-router";
import { RootRoute } from "@tanstack/router-core";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { Fragment } from "react";

const routes: Route[] = [
  { label: "Home", to: "/" },
  { label: "Posts", to: "/posts" },
];

export const route = new RootRoute({
  component: () => (
    <Fragment>
      <div className="h-full flex flex-col">
        <nav className="h-16 flex items-center gap-4 px-2 bg-gray-600">
          {routes.map(({ label, to }, index) => (
            <Link
              key={index}
              to={to}
              className="px-2 py-1 rounded"
              inactiveProps={{ className: "bg-gray-400" }}
              activeProps={{ className: "bg-indigo-400" }}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex-1">
          <Outlet />
        </div>
      </div>
      <TanStackRouterDevtools position="bottom-right" />
    </Fragment>
  ),
});
