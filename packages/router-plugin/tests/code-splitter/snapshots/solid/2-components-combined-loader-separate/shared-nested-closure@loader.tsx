// Nested closure - ensure we track through closures
const cfg = {
  api: 'http://api.com'
};
const makeLoader = () => () => cfg.api;
const SplitLoader = makeLoader();
export { SplitLoader as loader };