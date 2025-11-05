// Multiple declarators in same statement
// Only 'shared' is used by both loader and component
// 'a' is only used in component, should NOT be exported
const a = 1,
  shared = new Map();
function TestComponent() {
  // Uses both shared and a
  return <div>Count: {shared.size + a}</div>;
}
const SplitLoader = async () => {
  // Only uses shared, not a
  shared.set('loaded', true);
  return {
    data: 'loaded'
  };
};
export { SplitLoader as loader };
export { TestComponent as component };