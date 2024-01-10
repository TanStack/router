import { InvoiceList } from "../components/invoice-list";
import { InvoicesInfo } from "../components/invoices-info";
import {
  LabelText,
  inputClasses,
  submitButtonClasses,
} from "../components/label-text";
import {
  Link,
  Outlet,
  useNavigate,
  useParams,
  useRouter,
  Route,
} from "@tanstack/react-router";
import { salesRoute } from "./salesRoutes";
import {
  fetchInvoiceById,
  fetchInvoicesAndCustomers,
} from "../fetchers/invoices";
import { Customer } from "@/types";
import { currencyFormatter } from "../../utils";
import {
  Deposits,
  LineItemDisplay,
  lineItemClassName,
} from "@/components/deposits";
import { ErrorBoundaryComponent } from "@/components/error-boundary";
import { LineItems } from "@/components/forms/create-invoice";
import { useRef } from "react";
import { fetchCustomers } from "@/fetchers/customers";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createInvoice } from "@/actions";
import { SpinnerIcon } from "@/components";

export const invoicesRoute = new Route({
  getParentRoute: () => salesRoute,
  path: "invoices",
  loader: fetchInvoicesAndCustomers,
  component: () => {
    const {
      invoices: { invoiceListItems, dueSoonAmount, overdueAmount },
      customers,
    } = invoicesRoute.useLoaderData();

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
  component: () => {
    const { invoiceId } = useParams({ strict: false });

    const {
      data: invoiceData,
      isLoading,
      error,
    } = useQuery({
      queryKey: ["invoices", invoiceId],
      queryFn: () => {
        return fetchInvoiceById(invoiceId);
      },
    });

    if (isLoading) {
      return <SpinnerIcon />;
    }

    if (error) {
      return <div>Error: {error.message}</div>;
    }

    const data = invoiceData?.data;

    if (data) {
      return (
        <div className="relative p-10">
          <Link
            to="/sales/customers/$customerId"
            params={{ customerId: data.customerId }}
            className="text-[length:14px] font-bold leading-6 text-blue-600 underline"
          >
            {data.customerName}
          </Link>
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
          <Deposits data={data} invoiceId={invoiceId as string} />
        </div>
      );
    }
  },
});

export const newInvoiceRoute = new Route({
  getParentRoute: () => invoicesRoute,
  path: "new",
  loader: async () => {
    const customers = await fetchCustomers();
    return customers;
  },
  component: () => {
    const invoiceFormRef = useRef<any>();
    const router = useRouter();
    const navigate = useNavigate({
      from: router.state.location.pathname as any,
    });

    const { customers } = newInvoiceRoute.useLoaderData() as {
      customers: Customer[];
    };

    const { mutateAsync } = useMutation({
      mutationFn: (data: FormData) => {
        return createInvoice(data);
      },
    });

    const handleSubmit = async (event: any) => {
      event.preventDefault();
      event.stopPropagation();
      const formData = new FormData(event.target as HTMLFormElement);
      const res = await mutateAsync(formData);
      router.invalidate();
      navigate({
        to: "/sales/invoices/$invoiceId",
        params: { invoiceId: res?.data?.id as string },
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
