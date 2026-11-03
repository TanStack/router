import { makeHelpers } from '../helpers';
const {
  read,
  render
} = makeHelpers();
const SplitLoader = () => read();
export { SplitLoader as loader };
const SplitComponent = () => render();
export { SplitComponent as component };
export { render as pendingComponent };