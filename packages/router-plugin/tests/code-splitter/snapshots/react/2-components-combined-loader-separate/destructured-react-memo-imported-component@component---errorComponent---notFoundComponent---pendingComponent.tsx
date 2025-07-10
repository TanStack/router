import { memo } from 'react';
import { Route } from "destructured-react-memo-imported-component.tsx";
function Component() {
  return <div>Component</div>;
}
const SplitComponent = memo(Component);
export { SplitComponent as component };