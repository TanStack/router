import { loaderClient } from "@/loaders";
import { ActionContext } from "@tanstack/react-actions";
import axios from "axios";
import invariant from "tiny-invariant";
import {
  parseDate,
  validateAmount,
  validateCustomerId,
  validateDepositDate,
  validateDueDate,
  validateLineItemQuantity,
  validateLineItemUnitPrice,
} from "../../utils";
import type { LineItemFields } from "@/types";
import { useNavigate } from "@tanstack/react-router";

const actionContext = new ActionContext<{
  loaderClient: typeof loaderClient;
}>();

const createInvoice = async (formData: FormData) => {
  await new Promise((r) => setTimeout(r, 500));

  const intent = formData.get("intent");
  switch (intent) {
    case "create": {
      const customerId = formData.get("customerId");
      const dueDateString = formData.get("dueDateString");
      invariant(typeof customerId === "string", "customerId is required");
      invariant(typeof dueDateString === "string", "dueDate is required");
      const dueDate = parseDate(dueDateString);

      const lineItemIds = formData.getAll("lineItemId");
      const lineItemQuantities = formData.getAll("quantity");
      const lineItemUnitPrices = formData.getAll("unitPrice");
      const lineItemDescriptions = formData.getAll("description");
      const lineItems: Array<LineItemFields> = [];
      for (let i = 0; i < lineItemQuantities.length; i++) {
        // @ts-ignore
        const quantity = +lineItemQuantities[i];
        // @ts-ignore
        const unitPrice = +lineItemUnitPrices[i];
        const description = lineItemDescriptions[i];
        invariant(typeof quantity === "number", "quantity is required");
        invariant(typeof unitPrice === "number", "unitPrice is required");
        invariant(typeof description === "string", "description is required");

        lineItems.push({ quantity, unitPrice, description });
      }

      const errors = {
        customerId: validateCustomerId(customerId),
        dueDate: validateDueDate(dueDate),
        lineItems: lineItems.reduce(
          (acc, lineItem, index) => {
            const id = lineItemIds[index];
            invariant(typeof id === "string", "lineItem ids are required");
            acc[id] = {
              quantity: validateLineItemQuantity(lineItem.quantity),
              unitPrice: validateLineItemUnitPrice(lineItem.unitPrice),
            };
            return acc;
          },
          {} as Record<
            string,
            { quantity: null | string; unitPrice: null | string }
          >
        ),
      };

      const customerIdHasError = errors.customerId !== null;
      const dueDateHasError = errors.dueDate !== null;
      const lineItemsHaveErrors = Object.values(errors.lineItems).some(
        (lineItem) => Object.values(lineItem).some(Boolean)
      );
      const hasErrors =
        dueDateHasError || customerIdHasError || lineItemsHaveErrors;
      if (hasErrors) {
        console.log("errors", errors);
        throw new Error(
          `One ore more errors has occurred. Check the logs for the errors`
        );
      }

      const data = {
        dueDate,
        customerId,
        lineItems,
      };

      const response = await axios.post("http://localhost:8080/add-invoice", {
        data,
      });

      return response;
    }
  }

  // grab the form data info from the /add-invoice api call in the bun backend
  // make that part of this function where this ufnction receives the form data and then only sends
  // data to the backend once all the validation has happened.
};

const createCustomer = async (formData: FormData) => {
  const intent = formData.get("intent");
  switch (intent) {
    case "create": {
      const name = formData.get("name");
      const email = formData.get("email");
      invariant(typeof name === "string", "name is required");
      invariant(typeof email === "string", "email is required");

      const data = {
        name,
        email,
      };

      const response = await axios.post("http://localhost:8080/add-customer", {
        data,
      });

      console.log("response in action", response);

      // handle the redirect/navigation on the frontend
      // res.redirect(`/sales/customers/${customer.id}`);
      return response;
    }
  }
};

const createDeposit = async (formData: FormData) => {
  const invoiceId = formData.get("invoiceId");
  if (typeof invoiceId !== "string") {
    throw new Error("This should be impossible.");
  }
  const intent = formData.get("intent");
  invariant(typeof intent === "string", "intent required");
  switch (intent) {
    case "create-deposit": {
      const amount = Number(formData.get("amount"));
      const depositDateString = formData.get("depositDate");
      const note = formData.get("note");
      invariant(!Number.isNaN(amount), "amount must be a number");
      invariant(typeof depositDateString === "string", "dueDate is required");
      invariant(typeof note === "string", "dueDate is required");
      const depositDate = parseDate(depositDateString);

      const errors = {
        amount: validateAmount(amount),
        depositDate: validateDepositDate(depositDate),
      };
      const hasErrors = Object.values(errors).some(
        (errorMessage) => errorMessage
      );
      if (hasErrors) {
        throw errors;
      }

      const data = {
        invoiceId,
        amount,
        depositDate,
        note,
      };

      const response = await axios.post("http://localhost:8080/add-deposit", {
        data,
      });
      return response;
    }
    default: {
      throw new Error(`Unsupported intent: ${intent}`);
    }
  }
};

const deleteDeposit = async (formData: FormData) => {
  const depositId = formData.get("depositId");
  invariant(typeof depositId === "string", "params.depositId is not available");

  const intent = formData.get("intent");
  invariant(typeof intent === "string", "intent must be a string");
  switch (intent) {
    case "delete": {
      const response = await axios.post(
        "http://localhost:8080/delete-deposit",
        {
          data: { depositId },
        }
      );

      return response;
    }
    default: {
      throw new Error(`Unsupported intent: ${intent}`);
    }
  }
};

const createInvoiceAction = actionContext.createAction({
  key: "createInvoice",
  fn: createInvoice,
  onEachSuccess: async ({ context: { loaderClient } }) => {
    await loaderClient.invalidateLoader({ key: "invoices" });
  },
});

const createCustomerAction = actionContext.createAction({
  key: "createCustomer",
  fn: createCustomer,
  onEachSuccess: async ({ context: { loaderClient } }) => {
    await loaderClient.invalidateLoader({ key: "customers" });
  },
});

const createDepositAction = actionContext.createAction({
  key: "createDeposit",
  fn: createDeposit,
  onEachSuccess: async ({ context: { loaderClient } }) => {
    await loaderClient.invalidateLoader({ key: "invoice" });
  },
});

const deleteDepositAction = actionContext.createAction({
  key: "deleteDeposit",
  fn: deleteDeposit,
});

// use the code below in the component for the formdata

// const [{ latestSubmission }, submitCreateInvoice] = useAction({
//     key: 'createInvoice',
//   })

// const updateInvoiceAction = actionContext.createAction({
//   key: "updateInvoice",
//   fn: patchInvoice,
//   onEachSuccess: async ({ submission, context: { loaderClient } }) => {
//     await loaderClient.invalidateLoader({ key: "invoices" });
//     await loaderClient.invalidateInstance({
//       key: "invoice",
//       variables: submission.variables.id,
//     });
//   },
// });

export const actionClient = actionContext.createClient({
  context: {
    loaderClient,
  },
  actions: [
    createInvoiceAction,
    createCustomerAction,
    createDepositAction,
    deleteDepositAction,
  ],
});

//   actions: [createInvoiceAction, updateInvoiceAction],
