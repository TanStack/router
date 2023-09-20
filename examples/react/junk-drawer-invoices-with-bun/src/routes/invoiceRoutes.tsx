import { InvoiceList } from "../components/invoice-list";
import { InvoicesInfo } from "../components/invoices-info";
import {
  LabelText,
  inputClasses,
  submitButtonClasses,
} from "../components/label-text";
import {
  ErrorComponent,
  Link,
  Outlet,
  useNavigate,
  useParams,
  useRouter,
} from "@tanstack/react-router";
import { Route } from "@tanstack/router-core";
import { salesRoute } from "./salesRoutes";
import {
  fetchInvoicesAndCustomers,
  type InvoicesType,
} from "../fetchers/invoices";
import { Customer, NotFoundError, customerQuerySchema } from "@/types";
import { currencyFormatter } from "../../utils";
import {
  Deposits,
  LineItemDisplay,
  lineItemClassName,
} from "@/components/deposits";
import {
  createLoaderOptions,
  useLoaderInstance,
} from "@tanstack/react-loaders";
import { ErrorBoundaryComponent } from "@/components/error-boundary";
import { LineItems } from "@/components/forms/create-invoice";
import { useAction } from "@tanstack/react-actions";
import { useRef } from "react";
import { fetchCustomers } from "@/fetchers/customers";

type LoaderData = {
  invoices: InvoicesType;
  customers: Customer[];
};

export const invoicesRoute = new Route({
  getParentRoute: () => salesRoute,
  path: "invoices",
  loader: fetchInvoicesAndCustomers,
  component: ({ useLoader }) => {
    const {
      invoices: { invoiceListItems, dueSoonAmount, overdueAmount },
      customers,
    } = useLoader<LoaderData>();
    const hundo = dueSoonAmount + overdueAmount;
    const dueSoonPercent = Math.floor((dueSoonAmount / hundo) * 100);
    return (
      <div className="relative">
        <div className="flex items-center justify-between gap-4">
          <InvoicesInfo label="Overdue" amount={overdueAmount} />
          <div className="flex h-4 flex-1 overflow-hidden rounded-full">
            <div className="bg-yellow-brand flex-1" />
            <div
              className="bg-green-brand"
              style={{ width: `${dueSoonPercent}%` }}
            />
          </div>
          <InvoicesInfo label="Due Soon" amount={dueSoonAmount} right />
        </div>
        <div className="h-4" />
        <LabelText>Invoice List</LabelText>
        <div className="h-2" />
        <InvoiceList invoiceListItems={invoiceListItems} customers={customers}>
          <Outlet />
        </InvoiceList>
      </div>
    );
  },
});

export const invoiceIdRoute = new Route({
  getParentRoute: () => invoicesRoute,
  path: "$invoiceId",
  beforeLoad: ({ params: { invoiceId } }) => {
    const loaderOptions = createLoaderOptions({
      key: "invoice",
      variables: invoiceId,
    });

    return { loaderOptions };
  },
  loader: async ({
    preload,
    context: { loaderClient },
    routeContext: { loaderOptions },
  }) => {
    await loaderClient.load({
      ...loaderOptions,
      preload,
    });
  },
  errorComponent: ({ error }) => {
    if (error instanceof NotFoundError) {
      return <div>{error.message}</div>;
    }

    return <ErrorComponent error={error} />;
  },
  component: ({ useLoader, useRouteContext }) => {
    const { loaderOptions } = useRouteContext();
    const { data } = useLoaderInstance(loaderOptions);
    const { invoiceId } = useParams({ strict: false });
    return (
      <div className="relative p-10">
        {/* <Link
              to={`../../customers/${data.customerId}`}
              className="text-[length:14px] font-bold leading-6 text-blue-600 underline"
            >
              {data.customerName}
            </Link> */}
        <div className="text-[length:32px] font-bold leading-[40px]">
          {currencyFormatter.format(data.totalAmount)}
        </div>
        <LabelText>
          <span
            className={
              data.dueStatus === "paid"
                ? "text-green-brand"
                : data.dueStatus === "overdue"
                ? "text-red-brand"
                : ""
            }
          >
            {data.dueDisplay}
          </span>
          {` • Invoiced ${data.invoiceDateDisplay}`}
        </LabelText>
        <div className="h-4" />
        {data.lineItems.map((item: any) => (
          <LineItemDisplay
            key={item.id}
            description={item.description}
            unitPrice={item.unitPrice}
            quantity={item.quantity}
          />
        ))}
        <div className={`${lineItemClassName} font-bold`}>
          <div>Net Total</div>
          <div>{currencyFormatter.format(data.totalAmount)}</div>
        </div>
        <div className="h-8" />
        <Deposits deposits={data.deposits} invoiceId={invoiceId as string} />
      </div>
    );
  },
});

export const newInvoiceRoute = new Route({
  getParentRoute: () => invoicesRoute,
  path: "new",
  loader: async () => {
    const customers = await fetchCustomers();
    return customers;
  },
  component: ({ useLoader }) => {
    const invoiceFormRef = useRef<any>();
    const [{ latestSubmission }, submitCreateInvoice] = useAction({
      key: "createInvoice",
    });

    const { customers } = useLoader();
    const router = useRouter();

    const navigate = useNavigate({
      from: router.state.location.pathname as any,
    });

    const handleSubmit = async (event: any) => {
      event.preventDefault();
      event.stopPropagation();
      const formData = new FormData(event.target as HTMLFormElement);

      const response = await submitCreateInvoice({
        variables: formData,
      });

      navigate({
        to: "/sales/invoices/$invoiceId",
        params: { invoiceId: response?.data?.id },
      });
    };

    return (
      <ErrorBoundaryComponent>
        <div className="relative p-10">
          <h2 className="font-display mb-4">New Invoice</h2>
          <form
            onSubmit={handleSubmit}
            ref={invoiceFormRef}
            className="flex flex-col gap-4"
          >
            <div className="relative">
              <div className="flex flex-wrap items-center gap-1">
                <label htmlFor="customers">
                  <LabelText>Customer</LabelText>
                </label>
                <select name="customerId" id="customerId">
                  {customers?.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {/* Replace all bracketed content with the combobox once that's figured out */}
            <div>
              <div className="flex flex-wrap items-center gap-1">
                <label htmlFor="dueDate">
                  <LabelText>Due Date</LabelText>
                </label>
              </div>
              <input
                id="dueDate"
                name="dueDateString"
                className={inputClasses}
                type="date"
                required
              />
              <input hidden readOnly name="intent" value="create" />
            </div>
            <LineItems />
            <div>
              <button type="submit" className={submitButtonClasses}>
                Create Invoice
              </button>
            </div>
          </form>
        </div>
      </ErrorBoundaryComponent>
    );
  },
});
