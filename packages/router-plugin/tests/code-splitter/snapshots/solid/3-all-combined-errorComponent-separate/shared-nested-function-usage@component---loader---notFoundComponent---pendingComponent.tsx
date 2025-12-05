// Variable used inside nested function
const collection = {
  name: 'todos',
  items: []
};
function loadData() {
  return collection.items;
}
function TestComponent() {
  return <div>{collection.name}</div>;
}
export { loadData as loader };
export { TestComponent as component };