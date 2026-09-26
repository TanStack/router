import { state, Labels, increment } from "shared-runtime.tsx?tsr-shared=1";
const label = createComponentLabel();
function createComponentLabel() {
  console.log('shared-runtime:component');
  return Labels.component;
}
const SplitLoader = () => {
  increment();
  return state;
};
export { SplitLoader as loader };
const SplitComponent = () => {
  if (state.count === 3) {
    throw new Error('route source-map contract');
  }
  return `${label}:${state.count}`;
};
export { SplitComponent as component };