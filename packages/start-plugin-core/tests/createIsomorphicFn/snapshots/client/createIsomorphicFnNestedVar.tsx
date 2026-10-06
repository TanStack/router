// Server-only state declared with `var` inside nested statements
if (typeof window === 'undefined') {}
export function getValue(flag: boolean) {
  if (flag) {}
  const read = () => 'client';
  return read();
}