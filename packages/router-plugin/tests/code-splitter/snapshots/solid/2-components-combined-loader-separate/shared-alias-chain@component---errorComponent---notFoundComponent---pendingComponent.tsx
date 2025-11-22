// Alias chain - ensure we track through aliases
const base = {
  name: 'collection',
  items: []
};
const alias = base;
function TestComponent() {
  return <div>{alias.name}</div>;
}
export { TestComponent as component };