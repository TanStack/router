import { api } from "shared-object-with-methods.tsx"; // Object contains methods (functions) - should still be shared as whole object
function TestComponent() {
  return <div>
      {api.endpoint} - Cache size: {api.cache.size}
    </div>;
}
export { TestComponent as component };