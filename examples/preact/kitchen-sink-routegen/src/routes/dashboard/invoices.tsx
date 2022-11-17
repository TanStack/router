import { Outlet } from "@tanstack/react-router";

import { router } from "../../router";
import { Spinner } from "../../components/Spinner";
import dashboardRoute from "../dashboard";

const routeConfig = dashboardRoute.createRoute({
  path: "invoices",
  component: Invoices,
});

export default routeConfig;

function Invoices() {
  const {
    loaderData: { invoices },
    Link,
    MatchRoute,
    useRoute,
  } = router.useMatch(routeConfig.id);

  // Get the action for a child route
  const invoiceIndexRoute = useRoute("./");
  const invoiceDetailRoute = useRoute("./:invoiceId");

  return (
    <div className="flex-1 flex">
      <div className="divide-y w-48">
        {invoices?.map((invoice) => {
          const foundPending = invoiceDetailRoute.action.submissions.find(
            (d) => d.submission?.id === invoice.id,
          );

          if (foundPending?.submission) {
            invoice = { ...invoice, ...foundPending.submission };
          }

          return (
            <div key={invoice.id}>
              <Link
                to="/dashboard/invoices/:invoiceId"
                params={{
                  invoiceId: invoice.id,
                }}
                preload="intent"
                className="block py-2 px-3 text-blue-700"
                activeProps={{ className: `font-bold` }}
              >
                <pre className="text-sm">
                  #{invoice.id} - {invoice.title.slice(0, 10)}{' '}
                  {foundPending ? (
                    <Spinner />
                  ) : (
                    <MatchRoute
                      to="./:invoiceId"
                      params={{
                        invoiceId: invoice.id,
                      }}
                      pending
                    >
                      <Spinner />
                    </MatchRoute>
                  )}
                </pre>
              </Link>
            </div>
          );
        })}
        {invoiceIndexRoute.action.submissions.map((action) => (
          <div key={action.submittedAt}>
            <a href="#" className="block py-2 px-3 text-blue-700">
              <pre className="text-sm">
                #<Spinner /> - {action.submission.title?.slice(0, 10)}
              </pre>
            </a>
          </div>
        ))}
      </div>
      <div className="flex-1 border-l border-gray-200">
        <Outlet />
      </div>
    </div>
  );
}
