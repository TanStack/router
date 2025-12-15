// Test file: Named imports from relative module
import { foo, bar } from "./utils?tss-split-exports=bar,foo";
import { helper } from "../shared/helpers?tss-split-exports=helper";
export function main() {
  return foo() + bar() + helper();
}