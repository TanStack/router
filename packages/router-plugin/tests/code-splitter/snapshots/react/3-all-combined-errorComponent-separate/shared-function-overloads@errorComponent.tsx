export function format(value: string): string;
export function format(value: number): string;
export function format(value: string | number) {
  return String(value);
}
export { format as formatValue };