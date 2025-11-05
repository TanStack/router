import { collection } from "./shared-module-variable.tsx";
// Module-level variable used in both loader and component
// This simulates a collection/query that should only be initialized once

// Side effect at module level - should only run once
console.log('Module initialized:', collection.name);