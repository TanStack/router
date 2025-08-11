// Test edge cases with true, undefined, and mixed scenarios
import { Route } from "edge-case-literals.tsx";
const SplitLoader = async () => ({
  data: 'edge'
});
export { SplitLoader as loader };
const SplitComponent = () => <div>Edge Test</div>;
export { SplitComponent as component };