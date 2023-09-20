import { Router } from "@tanstack/react-router";
import { indexRoute, rootRoute } from "./rootRoute";
import { postsRoute, postRoute, postsIndexRoute } from "./postRoutes";
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
import { loaderClient } from "@/loaders";
import { actionClient } from "../actions";

const routeTree = rootRoute.addChildren([
  postsRoute.addChildren([postRoute, postsIndexRoute]),
  salesRoute.addChildren([
    invoicesRoute.addChildren([invoiceIdRoute, newInvoiceRoute]),
    customersRoute.addChildren([customerIdRoute, newCustomerRoute]),
    depositsRoute.addChildren([depositIdRoute]),
    subscriptionsRoute,
    salesIndexOverviewRoute,
  ]),
  indexRoute,
]);

// Set up a Router instance
export const router = new Router({
  routeTree,
  defaultPreload: "intent",
  context: {
    loaderClient,
    actionClient,
  },
});
