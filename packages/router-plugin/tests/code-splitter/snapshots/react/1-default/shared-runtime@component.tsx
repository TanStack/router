import { state, Labels } from "shared-runtime.tsx?tsr-shared=1";
const label = createComponentLabel();
function createComponentLabel() {
  console.log('shared-runtime:component');
  return Labels.component;
}
const SplitComponent = () => {
  if (state.count === 3) {
    throw new Error('route source-map contract');
  }
  return `${label}:${state.count}`;
};
export { SplitComponent as component };