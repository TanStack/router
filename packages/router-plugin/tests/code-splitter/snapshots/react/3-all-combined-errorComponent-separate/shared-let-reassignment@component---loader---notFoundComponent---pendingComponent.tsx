// let with reassignment - tests live binding behavior
let store = {
  count: 0
};
store = {
  count: 1,
  updated: true
};
function TestComponent() {
  return <div>Count: {store.count}</div>;
}
const SplitLoader = async () => {
  store.count++;
  return {
    data: 'loaded'
  };
};
export { SplitLoader as loader };
export { TestComponent as component };