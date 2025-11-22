const createBits = () => ({
  component: AboutComponentImpl,
  loader: () => ({
    message: 'hello'
  })
});
function DefaultAboutComponent() {
  return <div>Default About</div>;
}
const {
  component: AboutComponent = DefaultAboutComponent
} = createBits();
function AboutComponentImpl() {
  return <div>About</div>;
}
export { AboutComponent as component };