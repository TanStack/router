import { prisma } from "../db";
import type { Invoice, LineItem } from "@prisma/client";

export type { Invoice, LineItem };
export type DueStatus = "paid" | "overpaid" | "overdue" | "due";

export type InvoiceDetails = {
  customerName: string;
  customerId: string;
  totalAmount: number;
  dueStatus: DueStatus;
  dueDisplay: string;
  invoiceDateDisplay: string;
  lineItems: {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
  }[];
  deposits: {
    id: string;
    amount: number;
    depositDateFormatted: string;
  }[];
};

const getDaysToDueDate = (date: Date) =>
  Math.ceil(
    (date.getTime() - asUTC(new Date()).getTime()) / (1000 * 60 * 60 * 24)
  );

export function getInvoiceDerivedData(invoice: {
  dueDate: Date;
  lineItems: Array<{ quantity: number; unitPrice: number }>;
  deposits: Array<{ amount: number }>;
}) {
  const daysToDueDate = getDaysToDueDate(invoice.dueDate);

  const totalAmount = invoice.lineItems.reduce(
    (acc, item) => acc + item.quantity * item.unitPrice,
    0
  );
  const totalDeposits = invoice.deposits.reduce(
    (acc, deposit) => acc + deposit.amount,
    0
  );
  const dueStatus: DueStatus =
    totalAmount === totalDeposits
      ? "paid"
      : totalDeposits > totalAmount
      ? "overpaid"
      : daysToDueDate < 0
      ? "overdue"
      : "due";

  const dueStatusDisplay =
    dueStatus === "paid"
      ? "Paid"
      : dueStatus === "overpaid"
      ? "Overpaid"
      : dueStatus === "overdue"
      ? "Overdue"
      : daysToDueDate === 0
      ? "Due today"
      : daysToDueDate === 1
      ? `Due tomorrow`
      : `Due in ${daysToDueDate} days`;

  return {
    totalAmount,
    totalDeposits,
    daysToDueDate,
    dueStatus,
    dueStatusDisplay,
  };
}

function asUTC(date: Date) {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export async function getFirstInvoice() {
  return prisma.invoice.findFirst();
}

export async function getInvoiceListItems() {
  const invoices = await prisma.invoice.findMany({
    select: {
      id: true,
      dueDate: true,
      number: true,
      customer: {
        select: { name: true },
      },
      lineItems: {
        select: { quantity: true, unitPrice: true },
      },
      deposits: {
        select: { amount: true },
      },
    },
  });
  return invoices.map((invoice) => {
    return {
      id: invoice.id,
      name: invoice.customer.name,
      number: invoice.number,
      ...getInvoiceDerivedData(invoice),
    };
  });
}

export async function getInvoiceDetails(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      number: true,
      invoiceDate: true,
      dueDate: true,
      customer: {
        select: { id: true, name: true },
      },
      lineItems: {
        select: {
          id: true,
          quantity: true,
          unitPrice: true,
          description: true,
        },
      },
      deposits: {
        select: { id: true, amount: true, depositDate: true },
      },
    },
  });
  if (!invoice) return null;
  return { invoice, ...getInvoiceDerivedData(invoice) };
}

export type LineItemFields = Pick<
  LineItem,
  "quantity" | "unitPrice" | "description"
>;

export async function createInvoice({
  dueDate,
  customerId,
  lineItems,
}: {
  dueDate: Date;
  customerId: string;
  lineItems: Array<LineItemFields>;
}) {
  const largestInvoiceNumber = await prisma.invoice.findFirst({
    select: { number: true },
    orderBy: { number: "desc" },
  });
  const nextNumber = largestInvoiceNumber ? largestInvoiceNumber.number + 1 : 1;
  return prisma.invoice.create({
    data: {
      number: nextNumber,
      dueDate,
      customer: { connect: { id: customerId } },
      lineItems: {
        create: lineItems.map((li) => ({
          description: li.description,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
        })),
      },
    },
  });
}
