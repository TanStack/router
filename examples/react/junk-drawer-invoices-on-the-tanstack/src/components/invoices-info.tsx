import { currencyFormatter } from "../../utils";
import { LabelText } from "./label-text";

export function InvoicesInfo({
  label,
  amount,
  right,
}: {
  label: string;
  amount: number;
  right?: boolean;
}) {
  return (
    <div className={right ? "text-right" : ""}>
      <LabelText>{label}</LabelText>
      <div className="text-[length:18px] text-black">
        {currencyFormatter.format(amount)}
      </div>
    </div>
  );
}
