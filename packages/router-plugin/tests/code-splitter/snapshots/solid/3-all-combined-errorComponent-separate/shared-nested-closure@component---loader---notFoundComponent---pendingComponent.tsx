// Nested closure - ensure we track through closures
const cfg = {
  api: 'http://api.com'
};
const makeLoader = () => () => cfg.api;
const Component = () => <div>{cfg.api}</div>;
const SplitLoader = makeLoader();
export { SplitLoader as loader };
export { Component as component };