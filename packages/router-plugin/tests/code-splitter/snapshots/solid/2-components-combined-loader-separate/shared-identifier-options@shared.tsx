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
export { read, render, seed };