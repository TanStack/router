import { store } from "./shared-let-reassignment.tsx";
// let with reassignment - tests live binding behavior

store = {
  count: 1,
  updated: true
};
function TestComponent() {
  return <div>Count: {store.count}</div>;
}
export { TestComponent as component };