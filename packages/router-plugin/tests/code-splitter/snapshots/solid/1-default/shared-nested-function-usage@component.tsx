import { collection } from "shared-nested-function-usage.tsx"; // Variable used inside nested function
function TestComponent() {
  return <div>{collection.name}</div>;
}
export { TestComponent as component };