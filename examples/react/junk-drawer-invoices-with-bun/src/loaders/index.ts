import { fetchCustomerById, fetchCustomers } from "@/fetchers/customers";
import {
  fetchInvoiceById,
  fetchInvoicesAndCustomers,
} from "@/fetchers/invoices";
import { Loader, LoaderClient, typedClient } from "@tanstack/react-loaders";

// All instances of a Loader being defined here are what Tanner Linsley 
// has referred to as a React Query Lite. 

// ** All Loaders here are different than the loaders that you defined in a Route **

const invoicesLoader = new Loader({
  key: "invoices",
  fn: async () => {
    return fetchInvoicesAndCustomers();
  },
});

const invoiceLoader = new Loader({
  key: "invoice",
  fn: async (invoiceId: string) => {
    return fetchInvoiceById(invoiceId);
  },
  onInvalidate: async ({ client }) => {
    await typedClient(client).invalidateLoader({ key: "invoices" });
  },
});

const customersLoader = new Loader({
  key: "customers",
  fn: async () => {
    return fetchCustomers();
  },
});

const individualCustomerLoader = new Loader({
  key: "customer",
  fn: async (customerId: string) => {
    return fetchCustomerById(customerId);
  },
  onInvalidate: async ({ client }) => {
    await typedClient(client).invalidateLoader({ key: "customers" });
  },
});

// This LoaderClient is a registry of all your React Query Lite Loaders. 

// ** Again, these loaders being registered are different than the loaders that you defined in a Route **

export const loaderClient = new LoaderClient({
  loaders: [
    invoicesLoader,
    invoiceLoader,
    customersLoader,
    individualCustomerLoader,
  ],
});
