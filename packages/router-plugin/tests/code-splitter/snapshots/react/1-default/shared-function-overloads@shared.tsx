function format(value: string): string;
function format(value: number): string;
function format(value: string | number) {
  return String(value);
}
export { format };