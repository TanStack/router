import dashboardRoute from "../dashboard";
import { router } from "../../router";

const routeConfig = dashboardRoute.createRoute({
  path: "/",
  component: DashboardHome,
});

export default routeConfig;

function DashboardHome() {
  const {
    loaderData: { invoices },
  } = router.useMatch(routeConfig.id);

  return (
    <div className="p-2">
      <div className="p-2">
        Welcome to the dashboard! You have{" "}
        <strong>{invoices.length} total invoices</strong>.
      </div>
    </div>
  );
}
