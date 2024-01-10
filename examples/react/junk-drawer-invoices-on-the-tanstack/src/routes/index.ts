import { Router } from "@tanstack/react-router";
import { indexRoute, rootRoute } from "./rootRoute";
import {
  depositIdRoute,
  depositsRoute,
  salesIndexOverviewRoute,
  salesRoute,
  subscriptionsRoute,
} from "./salesRoutes";
import {
  invoiceIdRoute,
  invoicesRoute,
  newInvoiceRoute,
} from "./invoiceRoutes";
import {
  customerIdRoute,
  customersRoute,
  newCustomerRoute,
} from "./customerRoutes";
import { QueryClient } from "@tanstack/react-query";

const routeTree = rootRoute.addChildren([
  salesRoute.addChildren([
    invoicesRoute.addChildren([invoiceIdRoute, newInvoiceRoute]),
    customersRoute.addChildren([customerIdRoute, newCustomerRoute]),
    depositsRoute.addChildren([depositIdRoute]),
    subscriptionsRoute,
    salesIndexOverviewRoute,
  ]),
  indexRoute,
]);

export const queryClient = new QueryClient();

export const router = new Router({
  routeTree,
  defaultPreload: "intent",
  context: {
    queryClient,
    authentication: undefined,
  },
});
