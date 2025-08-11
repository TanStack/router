// Test edge cases with true, undefined, and mixed scenarios
import { Route } from "edge-case-literals.tsx";
const SplitComponent = () => <div>Edge Test</div>;
export { SplitComponent as component };
const SplitErrorComponent = true;
export { SplitErrorComponent as errorComponent };