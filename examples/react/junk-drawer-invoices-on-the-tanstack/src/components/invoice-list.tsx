import { Link } from "@tanstack/react-router";
import { currencyFormatter } from "../../utils";
import CreateInvoiceForm from "./forms/create-invoice";
import { Customer } from "@/types";
import { FilePlusIcon } from ".";

export function InvoiceList({
  children,
  invoiceListItems,
  customers,
}: {
  children: React.ReactNode;
  invoiceListItems: any;
  customers: Customer[];
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-gray-100">
      <div className="w-1/2 border-r border-gray-100">
        {/* This will be where the modal goes for adding a new Invoice */}
        <div
          className={
            "block border-b-4 border-gray-100 py-3 px-4 hover:bg-gray-50"
          }
        >
          <Link to="/sales/invoices/new">
            <span className="flex gap-1">
              <FilePlusIcon /> <span>Create new invoice</span>
            </span>
          </Link>
        </div>
        <div className="max-h-96 overflow-y-scroll">
          {invoiceListItems.map((invoice: any) => (
            <Link
              key={invoice.id}
              to="/sales/invoices/$invoiceId"
              params={{ invoiceId: invoice.id }}
              preload="intent"
              activeProps={{
                className: "bg-gray-100",
              }}
              className="block border-b border-gray-50 py-3 px-4 hover:bg-gray-50"
            >
              <div className="flex justify-between text-[length:14px] font-bold leading-6">
                <div>{invoice.name}</div>
                <div>{currencyFormatter.format(invoice.totalAmount)}</div>
              </div>
              <div className="flex justify-between text-[length:12px] font-medium leading-4 text-gray-400">
                <div>{invoice.number}</div>
                <div
                  className={
                    "uppercase" +
                    " " +
                    (invoice.dueStatus === "paid"
                      ? "text-green-brand"
                      : invoice.dueStatus === "overdue"
                      ? "text-red-brand"
                      : "")
                  }
                >
                  {invoice.dueStatusDisplay}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
      <div className="w-1/2">{children}</div>
    </div>
  );
}
