function getComponentName(obj: Record<string, unknown>): string {
  return Object.keys(obj)[0];
}
const App = () => {
  const componentName = getComponentName({
    App
  });
  return <div>
      Component Name is {componentName}
      <OtherComponent />
    </div>;
};
function OtherComponent() {
  const componentName = getComponentName({
    App
  });
  return <div>App component name is {componentName}</div>;
}
import { Route } from "circular-reference-arrow-function.tsx";
export { App as component };