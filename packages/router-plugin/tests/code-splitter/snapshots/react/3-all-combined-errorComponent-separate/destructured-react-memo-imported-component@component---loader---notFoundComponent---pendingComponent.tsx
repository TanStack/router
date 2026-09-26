import { memo } from 'react';
import { importedLoader } from '../../shared/imported';
function Component() {
  return <div>Component</div>;
}
const SplitComponent = memo(Component);
export { SplitComponent as component };
export { importedLoader as loader };