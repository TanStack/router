import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function asUTC(date: Date) {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

const fromNow = (days: number) =>
  asUTC(new Date(asUTC(new Date()).getTime() + 1000 * 60 * 60 * 24 * days));

async function seed() {
  const email = "kody@remix.run";

  // cleanup the existing database
  await prisma.user.deleteMany({});
  await prisma.customer.deleteMany({});

  const hashedPassword = await bcrypt.hash("kodylovesyou", 10);

  await prisma.user.create({
    data: {
      email,
      password: {
        create: {
          hash: hashedPassword,
        },
      },
    },
  });

  console.log("Created user");

  type SeedData = Array<{
    name: string;
    email: string;
    invoices: Array<{
      number: number;
      invoiceDate: Date;
      dueDate: Date;
      lineItems: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
      }>;
      deposits: Array<{
        amount: number;
        depositDate: Date;
        note: string;
      }>;
    }>;
  }>;

  const seedData: SeedData = [
    {
      name: "Santa Monica",
      email: "santa@monica.jk",
      invoices: [
        {
          number: 1995,
          invoiceDate: fromNow(-13),
          dueDate: fromNow(-1),
          lineItems: [
            { description: "Cat Drawing", quantity: 1, unitPrice: 10_800.34 },
          ],
          deposits: [
            {
              amount: 6_409.04,
              depositDate: fromNow(-8),
              note: "Will get the rest to you by the due date. Love the cat!",
            },
          ],
        },
      ],
    },
    {
      name: "Stankonia",
      email: "stan@konia.jk",
      invoices: [
        {
          number: 2000,
          invoiceDate: fromNow(-5),
          dueDate: fromNow(0),
          lineItems: [
            { description: "Robbin Drawing", unitPrice: 6_000.23, quantity: 1 },
            {
              description: "Squirrel Drawing",
              unitPrice: 2_000.98,
              quantity: 2,
            },
          ],
          deposits: [
            {
              amount: 2_000.98,
              depositDate: fromNow(-2),
              note: "Paying off the first squirrel drawing.",
            },
          ],
        },
      ],
    },
    {
      name: "Ocean Avenue",
      email: "ocean@avenue.jk",
      invoices: [
        {
          number: 2003,
          invoiceDate: fromNow(-16),
          dueDate: fromNow(-3),
          lineItems: [
            { description: "Koala Drawing", quantity: 2, unitPrice: 9_500.02 },
          ],
          deposits: [
            {
              amount: 9_500.02,
              depositDate: fromNow(-4),
              note: "First Koala payment. Will pay the second soon.",
            },
            {
              amount: 9_500.02,
              depositDate: fromNow(-2),
              note: "Final payment. Thanks a ton!",
            },
          ],
        },
      ],
    },
    {
      name: "Tubthumper",
      email: "tub@thumper.jk",
      invoices: [
        {
          number: 1997,
          invoiceDate: fromNow(-2),
          dueDate: fromNow(10),
          lineItems: [
            {
              description: "Giraffe Drawing",
              quantity: 1,
              unitPrice: 14_000.4,
            },
          ],
          deposits: [],
        },
      ],
    },
    {
      name: "Wide Open Spaces",
      email: "wideopen@spaces.jk",
      invoices: [
        {
          number: 1998,
          invoiceDate: fromNow(-4),
          dueDate: fromNow(8),
          lineItems: [
            {
              description: "Elephant Drawing",
              quantity: 3,
              unitPrice: 4_600.65,
            },
          ],
          deposits: [
            {
              amount: 4_600.65,
              depositDate: fromNow(-1),
              note: "This elephant is amazing",
            },
          ],
        },
      ],
    },
  ];

  for (const data of seedData) {
    await prisma.customer.create({
      data: {
        name: data.name,
        email: data.email,
        invoices: {
          create: data.invoices.map((invoice) => ({
            number: invoice.number,
            invoiceDate: invoice.invoiceDate,
            dueDate: invoice.dueDate,
            deposits: {
              create: invoice.deposits.map((d) => ({
                amount: d.amount,
                depositDate: d.depositDate,
                note: d.note,
              })),
            },
            lineItems: {
              create: invoice.lineItems.map((li) => ({
                description: li.description,
                quantity: li.quantity,
                unitPrice: li.unitPrice,
              })),
            },
          })),
        },
      },
    });
  }
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
