import { importedComponent, importedLoader } from '../shared/imported';
const component = importedComponent;
export { component };
const pendingComponent = () => <div>Loading...</div>;
export { pendingComponent };
const loader = importedLoader;
export { loader };