// let with reassignment - tests live binding behavior
let store = {
  count: 0
};
store = {
  count: 1,
  updated: true
};
const SplitLoader = async () => {
  store.count++;
  return {
    data: 'loaded'
  };
};
export { SplitLoader as loader };