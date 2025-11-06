import { collection1, collection2 } from "./shared-multiple-variables.tsx";
// Multiple shared variables used by both loader and component

const config = {
  apiUrl: 'http://api.com'
};
function TestComponent() {
  return <div>
      {collection1.name} {collection2.name} {config.apiUrl}
    </div>;
}
export { TestComponent as component };