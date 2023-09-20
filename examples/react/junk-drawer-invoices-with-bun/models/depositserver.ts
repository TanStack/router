import type { Deposit } from "@prisma/client";
import { prisma } from "../db";

export type { Deposit };

export async function getDepositListItems() {
  const deposits = await prisma.deposit.findMany({
    orderBy: {
      depositDate: "desc",
    },
    select: {
      id: true,
      depositDate: true,
      amount: true,
      invoice: {
        select: {
          id: true,
          number: true,
          customer: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  return deposits.map((d) => ({
    ...d,
    depositDateFormatted: d.depositDate.toLocaleDateString(),
  }));
}

export async function getDepositDetails(depositId: string) {
  return prisma.deposit.findFirst({
    where: { id: depositId },
  });
}

export async function createDeposit(
  data: Pick<Deposit, "invoiceId" | "amount" | "note" | "depositDate">
) {
  return prisma.deposit.create({ data });
}

export async function deleteDeposit(id: string) {
  return prisma.deposit.delete({ where: { id } });
}
