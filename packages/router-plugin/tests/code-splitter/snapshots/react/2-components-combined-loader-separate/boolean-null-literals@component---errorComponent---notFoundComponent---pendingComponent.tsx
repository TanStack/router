// Test errorComponent with false literal
import { Route } from "boolean-null-literals.tsx";
const SplitComponent = () => <div>Test Component</div>;
export { SplitComponent as component };
const SplitPendingComponent = null;
export { SplitPendingComponent as pendingComponent };
const SplitErrorComponent = false;
export { SplitErrorComponent as errorComponent };