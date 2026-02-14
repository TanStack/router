function DefaultComponent() {
  return <div>Default</div>;
}
const createBits = () => ({
  component: ActualComponent,
  loader: () => ({
    message: 'hello'
  })
});
const {
  component: MyComponent = DefaultComponent
} = createBits();
function ActualComponent() {
  return <div>About</div>;
}
export { MyComponent as component };