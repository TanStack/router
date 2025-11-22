import { collection } from "shared-variable-dependency.tsx";
// Variable references another shared variable
const baseConfig = {
  apiUrl: 'http://api.com',
  timeout: 5000
};
function TestComponent() {
  return <div>
      {collection.name} - {baseConfig.apiUrl}
    </div>;
}
export { TestComponent as component };