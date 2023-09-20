import { loaderClient } from "@/loaders";
import SideBar from "../components/sidebar";
import { Route, RouterContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { actionClient } from "@/actions";

export const routerContext = new RouterContext<{
  loaderClient: typeof loaderClient;
  actionClient: typeof actionClient;
}>();

export const rootRoute = routerContext.createRootRoute({
  component: () => {
    return (
      <>
        <SideBar />
        {/* Start rendering router matches */}
        <TanStackRouterDevtools position="bottom-right" />
      </>
    );
  },
});

export const indexRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => {
    return (
      <div className="p-2">
        <h3>Welcome Home!</h3>
      </div>
    );
  },
});
