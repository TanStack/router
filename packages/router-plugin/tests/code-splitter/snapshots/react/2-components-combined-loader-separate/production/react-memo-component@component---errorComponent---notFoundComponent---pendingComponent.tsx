import React from 'react';
import { Route } from "react-memo-component.tsx";
function Component() {
  return <div>Component</div>;
}
const SplitComponent = React.memo(Component);
export { SplitComponent as component };