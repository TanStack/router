export const inputClasses =
  "text-lg w-full rounded border border-gray-500 px-2 py-1";

export const submitButtonClasses =
  "w-full rounded bg-green-500 py-2 px-4 text-white hover:bg-green-600 focus:bg-green-400";

export const dangerButtonClasses =
  "w-full rounded bg-red-600 py-2 px-4 text-white hover:bg-red-700 focus:bg-red-500";

export function LabelText({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[12px] font-medium uppercase leading-[24px] text-gray-400">
      {children}
    </div>
  );
}
