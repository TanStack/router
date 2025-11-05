// Object contains methods (functions) - should still be shared as whole object
const api = {
  endpoint: 'http://api.com',
  fetch: async () => ({
    data: 'loaded'
  }),
  cache: new Map()
};
const SplitLoader = async () => {
  return api.fetch();
};
export { SplitLoader as loader };