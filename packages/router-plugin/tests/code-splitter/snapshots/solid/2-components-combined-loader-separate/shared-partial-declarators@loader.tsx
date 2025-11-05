// Multiple declarators in same statement
// Only 'shared' is used by both loader and component
// 'a' is only used in component, should NOT be exported
const shared = new Map();
const SplitLoader = async () => {
  // Only uses shared, not a
  shared.set('loaded', true);
  return {
    data: 'loaded'
  };
};
export { SplitLoader as loader };