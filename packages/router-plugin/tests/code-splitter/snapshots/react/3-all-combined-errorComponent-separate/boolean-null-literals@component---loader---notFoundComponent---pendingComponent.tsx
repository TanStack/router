// Test errorComponent with false literal
import { Route } from "boolean-null-literals.tsx";
const SplitLoader = async () => ({
  data: 'test'
});
export { SplitLoader as loader };
const SplitComponent = () => <div>Test Component</div>;
export { SplitComponent as component };