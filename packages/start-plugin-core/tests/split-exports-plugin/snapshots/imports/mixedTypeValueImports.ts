// Test file: Mixed type and value imports in same declaration
import { type UserType, type Config, processUser, formatData } from "./utils?tss-split-exports=formatData,processUser";
import { type HelperType, helper } from "./helpers?tss-split-exports=helper";
export function main(user: UserType, config: Config) {
  return processUser(user) + formatData(config) + helper();
}