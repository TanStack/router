import { Customer, CustomerIdFetcherType } from "@/types";
import { defer } from "@tanstack/react-router";
import axios from "axios";

export const fetchCustomers = async () => {
  console.log("Fetching customers...");
  await new Promise((r) => setTimeout(r, 500));
  const customers = await axios
    .get<Customer[]>("http://localhost:8080/customers")
    .then((r) => r.data);
  return { customers };
};

export const fetchCustomerById = async (customerId: string) => {
  console.log(`Fetching customer by id ${customerId}...`);
  await new Promise((r) => setTimeout(r, 500));
  const { customerInfo } = await axios
    .get<CustomerIdFetcherType>(`http://localhost:8080/customers/${customerId}`)
    .then((r) => r.data);
  const customerDetailsData = axios
    .get<{ data: CustomerIdFetcherType["customerDetails"] }>(
      `http://localhost:8080/customerDetails/${customerId}`
    )
    .then((r) => r.data);
  return { customerDetails: defer(customerDetailsData), customerInfo };
};
