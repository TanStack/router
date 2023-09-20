import { Customer, CustomerIdFetcherType, SearchCustomerType } from "@/types";
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
  return await axios
    .get<CustomerIdFetcherType>(`http://localhost:8080/customers/${customerId}`)
    .then((r) => r.data);
};

// export const fetchCustomerSearch = async (query: string) => {
//   console.log(`Fetching customer by search ${query}...`);
//   await new Promise((r) => setTimeout(r, 500));
//   return await axios
//     .post<SearchCustomerType>(`http://localhost:8080/search-customers/`, {
//       query,
//     })
//     .then((r) => r.data);
// };
