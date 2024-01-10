import express from "express";
import Express from "express";
import cors from "cors";
import invariant from "tiny-invariant";
import {
  createCustomer,
  getCustomerDetails,
  getCustomerInfo,
  getCustomerListItems,
  getFirstCustomer,
  searchCustomers,
} from "./models/customerserver";
import "dotenv/config";
import {
  DueStatus,
  createInvoice,
  getFirstInvoice,
  getInvoiceDetails,
  getInvoiceListItems,
} from "./models/invoiceserver";
import {
  createDeposit,
  deleteDeposit,
  getDepositDetails,
} from "./models/depositserver";

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const port = 8080;

app.get(
  "/customers",
  async (_req: Express.Request, res: Express.Response, next) => {
    try {
      const customers = await getCustomerListItems();
      res.status(200).send(customers);
    } catch (error) {
      res.status(500).send(error);
    }
  }
);

// add customer route
app.post(
  "/add-customer",
  async (req: Express.Request, res: Express.Response, next) => {
    try {
      const data = req.body.data;
      console.log("data", data);
      const customer = await createCustomer(data);

      res.status(200).send(customer);
    } catch (error) {
      res.status(500).send(error);
    }
  }
);

// TODO:
// if someone wants to try to add this in feel free.
// Not sure how to take Remix's useFetcher idea of posting to the search params of a route you are on that would then update the
// loader on that page with the new search params.

// app.get("/search-customers", async (req, res) => {});

// get first customer id

app.get(
  "/first-data-info",
  async (_req: Express.Request, res: Express.Response) => {
    try {
      const [firstInvoice, firstCustomer] = await Promise.all([
        getFirstInvoice(),
        getFirstCustomer(),
      ]);

      res.status(200).send({
        firstInvoiceId: firstInvoice?.id,
        firstCustomerId: firstCustomer?.id,
      });
    } catch (error) {
      res.status(500).send(error);
    }
  }
);

// get customer by id route

app.get(
  "/customers/:customerId",
  async (req: Express.Request, res: Express.Response) => {
    try {
      const { customerId } = req.params;
      invariant(
        typeof customerId === "string",
        "params.customerId is not available"
      );
      const customerInfo = await getCustomerInfo(customerId);
      if (!customerInfo) {
        throw new Response("not found", { status: 404 });
      }
      const customerDetails = getCustomerDetails(customerId);
      const customers = await getCustomerListItems();

      const data = { customers, customerInfo, customerDetails };

      res.status(200).json(data);
    } catch (error) {
      res.status(500).send(error);
    }
  }
);

app.get(
  "/customerDetails/:customerId",
  async (req: Express.Request, res: Express.Response) => {
    try {
      const { customerId } = req.params;
      invariant(
        typeof customerId === "string",
        "params.customerId is not available"
      );

      const customerDetails = await getCustomerDetails(customerId);

      res.status(200).json({ data: customerDetails });
    } catch (error) {
      res.status(500).send(error);
    }
  }
);

// customer search

app.get("/search-customers", async (req, res) => {
  try {
    const { query } = req.query;
    const customers = await searchCustomers(query as string);
    res.status(200).send(customers);
  } catch (error) {
    res.status(500).send(error);
  }
});

// get invoices route

app.get("/invoices", async (_req: Express.Request, res: Express.Response) => {
  try {
    const invoiceListItems = await getInvoiceListItems();
    const dueSoonAmount = invoiceListItems.reduce(
      (sum: number, li: LineItem) => {
        if (li.dueStatus !== "due") {
          return sum;
        }
        const remainingBalance = li.totalAmount - li.totalDeposits;
        return sum + remainingBalance;
      },
      0
    );
    const overdueAmount = invoiceListItems.reduce(
      (sum: number, li: LineItem) => {
        if (li.dueStatus !== "overdue") {
          return sum;
        }
        const remainingBalance = li.totalAmount - li.totalDeposits;
        return sum + remainingBalance;
      },
      0
    );
    res.status(200).json({ invoiceListItems, dueSoonAmount, overdueAmount });
  } catch (error) {
    res.status(500).send(error);
  }
});

// get invoice by id route
app.get(
  "/invoices/:invoiceId",
  async (req: Express.Request, res: Express.Response) => {
    try {
      const { invoiceId } = req.params;
      if (typeof invoiceId !== "string") {
        throw new Error("This should be impossible.");
      }
      const invoiceDetails = await getInvoiceDetails(invoiceId);
      if (!invoiceDetails) {
        throw new Response("not found", { status: 404 });
      }
      res.status(200).json({
        customerName: invoiceDetails.invoice.customer.name,
        customerId: invoiceDetails.invoice.customer.id,
        totalAmount: invoiceDetails.totalAmount,
        dueStatus: invoiceDetails.dueStatus,
        dueDisplay: invoiceDetails.dueStatusDisplay,
        invoiceDateDisplay:
          invoiceDetails.invoice.invoiceDate.toLocaleDateString(),
        lineItems: invoiceDetails.invoice.lineItems.map(
          (li: InvoiceLineItem) => ({
            id: li.id,
            description: li.description,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
          })
        ),
        deposits: invoiceDetails.invoice.deposits.map(
          (deposit: { id: string; amount: number; depositDate: Date }) => ({
            id: deposit.id,
            amount: deposit.amount,
            depositDateFormatted: deposit.depositDate.toLocaleDateString(),
          })
        ),
      });
    } catch (error) {
      res.status(500).send(error);
    }
  }
);

// add invoice route

app.post(
  "/add-invoice",
  async (req: Express.Request, res: Express.Response) => {
    try {
      const data = req.body.data;
      const invoice = await createInvoice(data);
      res.status(200).send(invoice);
    } catch (error) {
      console.log("error", error);
      res.status(500).send(error);
    }
  }
);

// get deposit by id route

app.get(
  "/deposits/:depositId",
  async (req: Express.Request, res: Express.Response) => {
    try {
      const { depositId } = req.params;
      invariant(
        typeof depositId === "string",
        "params.depositId is not available"
      );
      const depositDetails = await getDepositDetails(depositId);
      if (!depositDetails) {
        throw new Response("not found", { status: 404 });
      }

      res.status(200).json(depositDetails);
    } catch (error) {
      res.status(500).send(error);
    }
  }
);

// add deposit route

app.post(
  "/add-deposit",
  async (req: Express.Request, res: Express.Response) => {
    try {
      const data = await req.body.data;
      const { invoiceId, amount, note, depositDate } = data;

      await createDeposit({ invoiceId, amount, note, depositDate });

      res.status(200).send({ message: "ok" });
    } catch (error) {
      res.status(500).send(error);
    }
  }
);

// delete deposit route (deletes by id)

app.post(
  "/delete-deposit",
  async (req: Express.Request, res: Express.Response) => {
    try {
      const data = await req.body.data;

      await deleteDeposit(data.depositId);
      res.status(200).send({ message: "ok" });
    } catch (error) {
      res.status(500).send(error);
    }
  }
);

app.listen(port, () => {
  console.log(`Listening on port ${port}...`);
});

export const viteNodeApp = app;

type LineItem = {
  totalAmount: number;
  totalDeposits: number;
  daysToDueDate: number;
  dueStatus: DueStatus;
  dueStatusDisplay: string;
  id: string;
  name: string;
  number: number;
};

type InvoiceLineItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
};
