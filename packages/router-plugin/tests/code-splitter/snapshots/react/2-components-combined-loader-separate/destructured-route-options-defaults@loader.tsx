function defaultLoader() {
  return {
    message: 'default'
  };
}
const createBits = () => ({
  component: ActualComponent,
  loader: () => ({
    message: 'hello'
  })
});
const {
  loader = defaultLoader
} = createBits();
function ActualComponent() {
  return <div>About</div>;
}
export { loader };