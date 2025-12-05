// Nested closure - ensure we track through closures
const cfg = {
  api: 'http://api.com'
};
const Component = () => <div>{cfg.api}</div>;
export { Component as component };