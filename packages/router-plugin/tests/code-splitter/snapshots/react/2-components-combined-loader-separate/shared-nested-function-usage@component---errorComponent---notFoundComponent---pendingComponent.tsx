// Variable used inside nested function
const collection = {
  name: 'todos',
  items: []
};
function TestComponent() {
  return <div>{collection.name}</div>;
}
export { TestComponent as component };