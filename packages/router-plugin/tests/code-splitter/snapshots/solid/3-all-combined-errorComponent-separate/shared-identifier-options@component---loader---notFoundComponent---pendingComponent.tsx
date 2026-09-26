const seed = {
  value: 'shared'
};
const {
  read,
  render
} = {
  read: () => seed.value,
  render: () => <div>{seed.value}</div>
};
const SplitLoader = () => read();
export { SplitLoader as loader };
const SplitComponent = () => render();
export { SplitComponent as component };