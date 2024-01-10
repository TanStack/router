import SideBar from "../components/sidebar";
import { Route, rootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { QueryClient } from "@tanstack/react-query";
import { UserResource, ActiveSessionResource } from "@clerk/types";

export const rootRoute = rootRouteWithContext<{
  queryClient: QueryClient;
  authentication:
    | {
        user: UserResource | null | undefined;
        isSignedIn: boolean | undefined | null;
        session: ActiveSessionResource | null | undefined;
      }
    | undefined;
}>()({
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
