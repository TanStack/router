export function format(value: string): string;
export function format(value: number): string;
export function format(value: string | number) {
  return String(value);
}
export { format as formatValue };
const SplitLoader = () => format(42);
export { SplitLoader as loader };
const SplitComponent = () => <div>{format('label')}</div>;
export { SplitComponent as component };