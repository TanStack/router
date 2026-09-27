import { pattern, values } from "shared-native-literals.tsx?tsr-shared=1";
const SplitLoader = () => ({ matched: pattern.test('café'), value: values[0] });
export { SplitLoader as loader };