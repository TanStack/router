import type { Customer } from "@prisma/client";
import { prisma } from "../db";
import { getInvoiceDerivedData } from "./invoiceserver";

export type { Customer };

export async function searchCustomers(query: string) {
  const customers = await prisma.customer.findMany({
    select: {
      id: true,
      name: true,
      email: true,
    },
  });
  const lowerQuery = query.toLowerCase();
  return customers.filter((c) => {
    return (
      c.name.toLowerCase().includes(lowerQuery) ||
      c.email.toLowerCase().includes(lowerQuery)
    );
  });
}

export async function getFirstCustomer() {
  return prisma.customer.findFirst();
}

export async function getCustomerListItems() {
  return prisma.customer.findMany({
    select: {
      id: true,
      name: true,
      email: true,
    },
  });
}

export async function getCustomerInfo(customerId: string) {
  return prisma.customer.findUnique({
    where: { id: customerId },
    select: { name: true, email: true },
  });
}

export async function getCustomerDetails(customerId: string) {
  await new Promise((resolve) =>
    setTimeout(resolve, Math.random() * 3000 + 1500)
  );
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      name: true,
      email: true,
      invoices: {
        select: {
          id: true,
          dueDate: true,
          number: true,
          lineItems: {
            select: {
              quantity: true,
              unitPrice: true,
            },
          },
          deposits: {
            select: { amount: true },
          },
        },
      },
    },
  });
  if (!customer) return null;

  const invoiceDetails = customer.invoices.map((invoice) => ({
    id: invoice.id,
    number: invoice.number,
    ...getInvoiceDerivedData(invoice),
  }));

  return { name: customer.name, email: customer.email, invoiceDetails };
}

export async function createCustomer({
  name,
  email,
}: Pick<Customer, "name" | "email">) {
  return prisma.customer.create({ data: { email, name } });
}
