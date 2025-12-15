// Test file: External (node_modules) imports should be skipped
import { useState } from 'react';
import { foo } from "./utils?tss-split-exports=foo";
export function Component() {
  const [state] = useState(foo());
  return state;
}