import { useRef } from "react";
import { currencyFormatter } from "../../utils";
import { LabelText, inputClasses, submitButtonClasses } from "./label-text";
import { Link, useRouter } from "@tanstack/react-router";
import { useAction } from "@tanstack/react-actions";

export const lineItemClassName =
  "flex justify-between border-t border-gray-100 py-4 text-[14px] leading-[24px]";

export function Deposits({
  deposits,
  invoiceId,
}: {
  deposits: any[];
  invoiceId: string;
}) {
  const formRef = useRef<DepositFormElement>(null);

  // use reacts experimental_useOptimistic hook like in the next app to update the UI before the server responds

  // pass in the deposits as a prop

  const [{ latestSubmission }, submitCreateCustomer] = useAction({
    key: "createDeposit",
  });
  // const router = useRouter();

  const handleSubmit = async (event: any) => {
    event.preventDefault();
    event.stopPropagation();
    const formData = new FormData(event.target as HTMLFormElement);

    await submitCreateCustomer({
      variables: formData,
    });
  };

  return (
    <div>
      <div className="font-bold leading-8">Deposits</div>
      {deposits.length > 0 ? (
        deposits.map((deposit) => (
          <div key={deposit.id} className={lineItemClassName}>
            <Link
              to="/sales/deposits/$depositId"
              params={{ depositId: deposit.id }}
              className="text-blue-600 underline"
            >
              {deposit.depositDateFormatted}
            </Link>
            <div>{currencyFormatter.format(deposit.amount)}</div>
          </div>
        ))
      ) : (
        <div>None yet</div>
      )}
      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 gap-x-4 gap-y-2 lg:grid-cols-2"
        ref={formRef}
        noValidate
      >
        <div className="min-w-[100px]">
          <div className="flex flex-wrap items-center gap-1">
            <LabelText>
              <label htmlFor="depositAmount">Amount</label>
            </LabelText>
          </div>
          <input
            id="depositAmount"
            name="amount"
            type="number"
            className={inputClasses}
            min="0.01"
            step="any"
            required
            //   aria-invalid={Boolean(errors?.amount) || undefined}
            //   aria-errormessage={errors?.amount ? "amount-error" : undefined}
          />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-1">
            <LabelText>
              <label htmlFor="depositDate">Date</label>
            </LabelText>
          </div>
          <input
            id="depositDate"
            name="depositDate"
            type="date"
            className={`${inputClasses} h-[34px]`}
            required
            //   aria-invalid={Boolean(errors?.depositDate) || undefined}
            //   aria-errormessage={
            //     errors?.depositDate ? "depositDate-error" : undefined
            //   }
          />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:col-span-2 lg:flex">
          <div className="flex-1">
            <LabelText>
              <label htmlFor="depositNote">Note</label>
            </LabelText>
            <input
              id="depositNote"
              name="note"
              type="text"
              className={inputClasses}
            />
          </div>
          <div className="flex items-end">
            <input hidden readOnly name="intent" value="create-deposit" />
            <input hidden readOnly name="invoiceId" value={invoiceId} />
            <button type="submit" className={submitButtonClasses}>
              Create
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function LineItemDisplay({
  description,
  quantity,
  unitPrice,
}: {
  description: string;
  quantity: number;
  unitPrice: number;
}) {
  return (
    <div className={lineItemClassName}>
      <div>{description}</div>
      {quantity === 1 ? null : <div className="text-[10px]">({quantity}x)</div>}
      <div>{currencyFormatter.format(unitPrice)}</div>
    </div>
  );
}

interface DepositFormControlsCollection extends HTMLFormControlsCollection {
  amount?: HTMLInputElement;
  depositDate?: HTMLInputElement;
  note?: HTMLInputElement;
  intent?: HTMLButtonElement;
}
interface DepositFormElement extends HTMLFormElement {
  readonly elements: DepositFormControlsCollection;
}

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
