// Alias chain - ensure we track through aliases
const base = {
  name: 'collection',
  items: []
};
const alias = base;
function TestComponent() {
  return <div>{alias.name}</div>;
}
const SplitLoader = async () => {
  return alias.items;
};
export { SplitLoader as loader };
export { TestComponent as component };