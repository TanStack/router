import {
  FilePlusIcon,
  InvoiceDetailsFallback,
  LabelText,
  inputClasses,
  submitButtonClasses,
} from "@/components";
import { fetchCustomerById, fetchCustomers } from "@/fetchers/customers";
import {
  Await,
  ErrorComponent,
  Link,
  Outlet,
  useNavigate,
  useRouter,
  Route,
  redirect,
} from "@tanstack/react-router";
import { salesRoute } from "./salesRoutes";
import { Customer, NotFoundError, customerQuerySchema } from "@/types";
import { Suspense } from "react";
import { currencyFormatter } from "../../utils";
import { useMutation } from "@tanstack/react-query";
import { createCustomer } from "@/actions/index";

export const customersRoute = new Route({
  getParentRoute: () => salesRoute,
  path: "customers",
  loader: async () => await fetchCustomers(),
  component: () => {
    const { customers } = customersRoute.useLoaderData() as {
      customers: Customer[];
    };
    return (
      <div className="flex overflow-hidden rounded-lg border border-gray-100">
        <div className="w-1/2 border-r border-gray-100">
          <Link
            to="/sales/customers/new"
            preload="intent"
            activeProps={{ className: "bg-gray-50" }}
            className="block border-b-4 border-gray-100 py-3 px-4 hover:bg-gray-50"
          >
            <span className="flex gap-1">
              <FilePlusIcon /> <span>Create new customer</span>
            </span>
          </Link>
          <div className="max-h-96 overflow-y-scroll">
            {customers.map((customer) => (
              <Link
                key={customer.id}
                to="/sales/customers/$customerId"
                params={{ customerId: customer.id }}
                // state={{ customer }}
                preload="intent"
                activeProps={{
                  className: "bg-gray-100",
                }}
                className="block border-b border-gray-50 py-3 px-4 hover:bg-gray-50"
              >
                <div className="flex justify-between text-[length:14px] font-bold leading-6">
                  <div>{customer.name}</div>
                </div>
                <div className="flex justify-between text-[length:12px] font-medium leading-4 text-gray-400">
                  <div>{customer.email}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
        <div className="flex w-1/2 flex-col justify-between">
          {/* {loadingCustomer && showSkeleton ? (
          <CustomerSkeleton
            name={loadingCustomer.name}
            email={loadingCustomer.email}
          />
        ) : ( */}
          <Outlet />
          {/* )} */}
          <small className="p-2 text-center">
            Note: this is arbitrarily slow to demonstrate pending UI.
          </small>
        </div>
      </div>
    );
  },
});

const lineItemClassName = "border-t border-gray-100 text-[14px] h-[56px]";

export const customerIdRoute = new Route({
  getParentRoute: () => customersRoute,
  path: "$customerId",
  loader: async ({ params: { customerId } }) => fetchCustomerById(customerId),
  beforeLoad: ({ context: { authentication } }) => {
    const isSignedIn = authentication?.isSignedIn;
    if (!isSignedIn) {
      throw Error("you must be signed in to create a customer");
    }
    // you could add sentry error logging here
  },
  errorComponent: ({ error }) => {
    if (error instanceof NotFoundError) {
      return <div>{error.message}</div>;
    }
    return <ErrorComponent error={error} />;
  },
  component: () => {
    const { customerInfo, customerDetails } = customerIdRoute.useLoaderData();
    return (
      <div className="relative p-10">
        <div className="text-[length:14px] font-bold leading-6">
          {customerInfo.email}
        </div>
        <div className="text-[length:32px] font-bold leading-[40px]">
          {customerInfo.name}
        </div>
        <div className="h-4" />
        <div className="text-m-h3 font-bold leading-8">Invoices</div>
        <div className="h-4" />
        <Suspense fallback={<InvoiceDetailsFallback />}>
          <Await promise={customerDetails}>
            {({ data }) => {
              console.log("customer details", data);
              return (
                <table className="w-full">
                  <tbody>
                    {data?.invoiceDetails?.map((details: any) => (
                      <tr key={details.id} className={lineItemClassName}>
                        <td>
                          <Link
                            className="text-blue-600 underline"
                            to="/sales/invoices/$invoiceId"
                            params={{ invoiceId: details.id }}
                          >
                            {details.number}
                          </Link>
                        </td>
                        <td
                          className={
                            "text-center uppercase" +
                            " " +
                            (details.dueStatus === "paid"
                              ? "text-green-brand"
                              : details.dueStatus === "overdue"
                              ? "text-red-brand"
                              : "")
                          }
                        >
                          {details.dueStatusDisplay}
                        </td>
                        <td className="text-right">
                          {currencyFormatter.format(details.totalAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            }}
          </Await>
        </Suspense>
      </div>
    );
  },
});

export const newCustomerRoute = new Route({
  getParentRoute: () => customersRoute,
  path: "new",
  component: () => {
    const router = useRouter();
    const navigate = useNavigate({
      from: router.state.location.pathname as any,
    });

    const { mutateAsync } = useMutation({
      mutationFn: (data: FormData) => {
        return createCustomer(data);
      },
    });

    const handleSubmit = async (event: any) => {
      event.preventDefault();
      event.stopPropagation();
      const formData = new FormData(event.target as HTMLFormElement);
      const res = await mutateAsync(formData);
      console.log("res", res);
      router.invalidate();
      navigate({
        to: "/sales/customers/$customerId",
        params: { customerId: res?.data?.id as string },
      });
    };

    return (
      <div className="relative p-10">
        <h2 className="font-display mb-4">New Customer</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="name">
              <LabelText>Name</LabelText>
            </label>
            <input id="name" name="name" className={inputClasses} type="text" />
          </div>
          <div>
            <label htmlFor="email">
              <LabelText>Email</LabelText>
            </label>
            <input
              id="email"
              name="email"
              className={inputClasses}
              type="email"
            />
          </div>
          <input hidden readOnly name="intent" value="create" />
          <div>
            <button type="submit" className={submitButtonClasses}>
              Create Customer
            </button>
          </div>
        </form>
      </div>
    );
  },
});

function CustomerSkeleton({ name, email }: { name: string; email: string }) {
  return (
    <div className="relative p-10">
      <div className="text-[length:14px] font-bold leading-6">{email}</div>
      <div className="text-[length:32px] font-bold leading-[40px]">{name}</div>
      <div className="h-4" />
      <div className="text-m-h3 font-bold leading-8">Invoices</div>
      <div className="h-4" />
      <InvoiceDetailsFallback />
    </div>
  );
}
