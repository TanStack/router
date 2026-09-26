import { state, increment } from "shared-runtime.tsx?tsr-shared=1";
const SplitLoader = () => {
  increment();
  return state;
};
export { SplitLoader as loader };