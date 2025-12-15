// Test file: Default import from relative module
import utils from "./utils?tss-split-exports=default";
import config from "../config?tss-split-exports=default";
export function main() {
  return utils.process(config);
}