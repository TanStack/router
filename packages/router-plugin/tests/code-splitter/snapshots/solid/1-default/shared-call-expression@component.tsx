import { collection } from "./shared-call-expression.tsx";
// Call expression initializers - should still work

const query = {
  from: (table: string) => ({
    table,
    filters: []
  })
}.from('users');
function TestComponent() {
  return <div>
      {collection.name} - {query.table}
    </div>;
}
export { TestComponent as component };