import {
  Link,
  Outlet,
  useMatches,
  useLoader,
  useRouter,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { Route } from "@tanstack/router-core";
import { postRoute } from "./postRoutes";
import { rootRoute } from "./rootRoute";
import { fetchFirstData } from "../fetchers/sales";
import { equals } from "remeda";
import { fetchDeposit } from "@/fetchers/deposits";
import { TrashIcon } from "@/components";
import { useAction } from "@tanstack/react-actions";

type LoaderData = {
  data: {
    firstInvoiceId: string;
    firstCustomerId: string;
  };
};

export const salesRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "sales",
  key: false,
  loader: fetchFirstData,
  component: ({ useLoader }) => {
    // const { data } = useLoader<LoaderData>();
    const matches = useMatches();
    const indexMatches = matches.some((m) => equals(m.pathname, "/sales"));
    const invoiceMatches = matches.some((m) => equals(m.pathname, "/invoices"));
    const customerMatches = matches.some((m) =>
      equals(m.pathname, "/customers")
    );

    return (
      <div className="relative h-full p-10">
        <h1 className="font-display text-d-h3 text-black">Sales</h1>
        <div className="h-6" />
        <div className="flex gap-4 border-b border-gray-100 pb-4 text-[length:14px] font-medium text-gray-400">
          <Link
            to="/sales/"
            activeProps={{
              className: indexMatches ? "font-bold text-black" : "",
            }}
          >
            Overview
          </Link>
          <Link preload="intent" to="/sales/subscriptions">
            Subscriptions
          </Link>
          <Link
            preload="intent"
            to="/sales/invoices"
            activeProps={{
              className: invoiceMatches ? "font-bold text-black" : "",
            }}
          >
            Invoices
          </Link>
          <Link
            preload="intent"
            to="/sales/customers"
            activeProps={{
              className: customerMatches ? "font-bold text-black" : "",
            }}
          >
            Customers
          </Link>
          <Link preload="intent" to="/sales/deposits">
            Deposits
          </Link>
        </div>
        <div className="h-4" />
        <Outlet />
      </div>
    );
  },
});

export const subscriptionsRoute = new Route({
  getParentRoute: () => salesRoute,
  path: "subscriptions",
  component: () => {
    return <div>Subscriptions</div>;
  },
});

export const depositsRoute = new Route({
  getParentRoute: () => salesRoute,
  path: "deposits",
  component: () => {
    return (
      <>
        <div>Deposits</div>
        <Outlet />
      </>
    );
  },
});

export const depositIdRoute = new Route({
  getParentRoute: () => depositsRoute,
  path: "$depositId",
  loader: async ({ params: { depositId } }) => fetchDeposit(depositId),
  component: ({ useLoader }) => {
    const { depositDetails } = useLoader();
    const { depositId } = useParams({ strict: false });
    console.log("deposit details", depositDetails);

    const router = useRouter();

    const [{ latestSubmission }, submitDeleteDeposit] = useAction({
      key: "deleteDeposit",
    });

    const navigate = useNavigate({
      from: router.state.location.pathname as any,
    });

    const handleSubmit = async (event: any) => {
      event.preventDefault();
      event.stopPropagation();
      const formData = new FormData(event.target as HTMLFormElement);

      await submitDeleteDeposit({
        variables: formData,
      });

      navigate({
        to: "/sales/invoices/$invoiceId",
        params: { invoiceId: depositDetails.invoiceId },
      });
    };

    return (
      <div className="p-8">
        <div className="flex justify-between">
          {depositDetails.note ? (
            <span>
              Note:
              <br />
              <span className="pl-1">{depositDetails.note}</span>
            </span>
          ) : (
            <span className="text-m-p-sm md:text-d-p-sm uppercase text-gray-500">
              No note
            </span>
          )}
          <div>
            <form onSubmit={handleSubmit}>
              <input hidden readOnly name="intent" value="delete" />
              <input hidden readOnly name="depositId" value={depositId} />
              <button type="submit">
                <TrashIcon />
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  },
});

export const salesIndexOverviewRoute = new Route({
  getParentRoute: () => salesRoute,
  path: "/",
  component: () => {
    return <div>Sales Overview</div>;
  },
});
