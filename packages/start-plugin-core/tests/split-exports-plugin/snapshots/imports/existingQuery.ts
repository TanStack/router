// Test file: Imports with existing query string
import { foo } from "./utils?v=123&tss-split-exports=foo";
import { bar } from "./helpers?tss-split-exports=bar";
export function main() {
  return foo() + bar();
}