import { pattern, values } from "shared-native-literals.tsx?tsr-shared=1";
const SplitComponent = () => <div>{`${pattern.source}: ${values[0]}`}</div>;
export { SplitComponent as component };