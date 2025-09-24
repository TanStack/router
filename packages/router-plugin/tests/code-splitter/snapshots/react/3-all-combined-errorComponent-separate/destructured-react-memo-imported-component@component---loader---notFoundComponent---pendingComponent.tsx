import { memo } from 'react';
import { importedLoader } from '../../shared/imported';
import { Route } from "destructured-react-memo-imported-component.tsx";
function Component() {
  return <div>Component</div>;
}
const SplitLoader = importedLoader;
export { SplitLoader as loader };
const SplitComponent = memo(Component);
export { SplitComponent as component };