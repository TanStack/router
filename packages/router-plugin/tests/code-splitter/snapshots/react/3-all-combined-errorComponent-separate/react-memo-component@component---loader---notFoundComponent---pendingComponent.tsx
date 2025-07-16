import React from 'react';
import { importedLoader } from '../../shared/imported';
import { Route } from "react-memo-component.tsx";
function Component() {
  return <div>Component</div>;
}
const SplitLoader = importedLoader;
export { SplitLoader as loader };
const SplitComponent = React.memo(Component);
export { SplitComponent as component };