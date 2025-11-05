import { shared } from "./shared-partial-declarators.tsx";
// Multiple declarators in same statement
// Only 'shared' is used by both loader and component
// 'a' is only used in component, should NOT be exported
const a = 1;
function TestComponent() {
  // Uses both shared and a
  return <div>Count: {shared.size + a}</div>;
}
export { TestComponent as component };