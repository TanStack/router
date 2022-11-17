import { createRouteConfig, Outlet } from "@tanstack/react-router";

import { router } from "../router";
import { loaderDelayFn } from "../utils";

const routeConfig = createRouteConfig().createRoute({
  id: "layout",
  component: LayoutWrapper,
  loader: async () => {
    return loaderDelayFn(() => {
      return {
        random: Math.random(),
      };
    });
  },
});

export default routeConfig;

function LayoutWrapper() {
  const { loaderData } = router.useMatch(routeConfig.id);
  return (
    <div>
      <div>Layout</div>
      <div>Random #: {loaderData.random}</div>
      <hr />
      <Outlet />
    </div>
  );
}
