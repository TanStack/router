import { state, createSeed, increment } from "shared-runtime.tsx?tsr-shared=1";
export { state as firstState, state as secondState, state as 'odd-name' };
export default createSeed;
const SplitLoader = () => {
  increment();
  return state;
};
export { SplitLoader as loader };