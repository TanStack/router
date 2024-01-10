export const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function validateAmount(amount: number) {
  if (amount <= 0) return "Must be greater than 0";
  if (Number(amount.toFixed(2)) !== amount) {
    return "Must only have two decimal places";
  }
  return null;
}

export function validateDepositDate(date: Date) {
  if (Number.isNaN(date.getTime())) {
    return "Please enter a valid date";
  }
  return null;
}
export function validateCustomerId(customerId: string) {
  // the database won't let us create an invoice without a customer
  // so all we need to do is make sure this is not an empty string
  return customerId === "" ? "Please select a customer" : null;
}

export function validateDueDate(date: Date) {
  if (Number.isNaN(date.getTime())) {
    return "Please enter a valid date";
  }
  return null;
}

export function validateLineItemQuantity(quantity: number) {
  if (quantity <= 0) return "Must be greater than 0";
  if (Number(quantity.toFixed(0)) !== quantity) {
    return "Fractional quantities are not allowed";
  }
  return null;
}

export function validateLineItemUnitPrice(unitPrice: number) {
  if (unitPrice <= 0) return "Must be greater than 0";
  if (Number(unitPrice.toFixed(2)) !== unitPrice) {
    return "Must only have two decimal places";
  }
  return null;
}

export function validateEmail(email: unknown): email is string {
  return typeof email === "string" && email.length > 3 && email.includes("@");
}

export function asUTC(date: Date) {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function parseDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  //@ts-ignore
  return asUTC(new Date(year, month - 1, day));
}
