import React from 'react';
import { importedLoader } from '../shared/imported';
function Component() {
  return <div>Component</div>;
}
const SplitComponent = React.memo(Component);
export { SplitComponent as component };
const SplitLoader = importedLoader;
export { SplitLoader as loader };