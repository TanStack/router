import { memo } from 'react';
import { importedLoader } from '../shared/imported';
function Component() {
  return <div>Component</div>;
}
const component = memo(Component);
export { component };
const loader = importedLoader;
export { loader };