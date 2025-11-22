// Variable references another shared variable
const baseConfig = {
  apiUrl: 'http://api.com',
  timeout: 5000
};
const collection = {
  config: baseConfig,
  name: 'todos'
};
const SplitLoader = async () => {
  return collection.name;
};
export { SplitLoader as loader };