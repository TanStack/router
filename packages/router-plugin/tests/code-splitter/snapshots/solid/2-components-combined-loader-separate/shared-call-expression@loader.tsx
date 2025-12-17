// Call expression initializers - should still work
const collection = {
  create: (name: string) => ({
    name,
    items: []
  })
}.create('todos');
const SplitLoader = async () => {
  return collection.items;
};
export { SplitLoader as loader };