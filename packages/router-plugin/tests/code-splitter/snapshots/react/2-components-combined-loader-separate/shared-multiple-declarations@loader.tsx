// Multiple declarations in same const statement
// Only collection1 is shared, but both are in same declaration
const collection1 = {
  name: 'todos'
};
const SplitLoader = async () => {
  return collection1.name;
};
export { SplitLoader as loader };