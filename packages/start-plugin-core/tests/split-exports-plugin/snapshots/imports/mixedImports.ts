// Test file: Mixed default and named imports
import utils, { foo, bar } from "./utils?tss-split-exports=bar,default,foo";
export function main() {
  return utils.process() + foo() + bar();
}