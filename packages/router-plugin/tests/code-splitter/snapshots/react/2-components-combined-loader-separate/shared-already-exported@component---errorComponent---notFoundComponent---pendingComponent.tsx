// Already exported variable - should not be double-exported
import { collection } from "shared-already-exported.tsx";
function TestComponent() {
  return <div>{collection.name}</div>;
}
export { TestComponent as component };