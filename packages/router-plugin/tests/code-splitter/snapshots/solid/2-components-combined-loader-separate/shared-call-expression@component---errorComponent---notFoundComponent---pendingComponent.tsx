// Call expression initializers - should still work
const collection = {
  create: (name: string) => ({
    name,
    items: []
  })
}.create('todos');
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