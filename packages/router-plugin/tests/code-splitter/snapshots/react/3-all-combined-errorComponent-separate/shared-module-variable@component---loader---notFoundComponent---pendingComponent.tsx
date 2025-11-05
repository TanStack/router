import { collection } from "shared-module-variable.tsx";
// Module-level variable used in both loader and component
// This simulates a collection/query that should only be initialized once

// Side effect at module level - should only run once
console.log('Module initialized:', collection.name);
function TodosComponent() {
  // Use collection in component
  return <div>{collection.name}</div>;
}
const SplitLoader = async () => {
  // Use collection in loader
  await collection.preload();
  return {
    data: 'loaded'
  };
};
export { SplitLoader as loader };
export { TodosComponent as component };