// Multiple declarations in same const statement
// Only collection1 is shared, but both are in same declaration
const collection1 = {
    name: 'todos'
  },
  collection2 = {
    name: 'users'
  };
function TestComponent() {
  return <div>
      {collection1.name} {collection2.name}
    </div>;
}
export { TestComponent as component };