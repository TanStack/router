// Alias chain - ensure we track through aliases
const base = {
  name: 'collection',
  items: []
};
const alias = base;
const SplitLoader = async () => {
  return alias.items;
};
export { SplitLoader as loader };