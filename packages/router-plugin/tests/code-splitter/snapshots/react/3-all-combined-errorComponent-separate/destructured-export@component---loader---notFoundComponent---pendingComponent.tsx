const createBits = () => ({
  component: AboutComponentImpl,
  loader: () => ({
    message: 'hello'
  })
});
function DefaultAboutComponent() {
  return <div>Default About</div>;
}
const fallbackLoader = () => ({
  message: 'fallback'
});
const {
  component: AboutComponent = DefaultAboutComponent,
  loader = fallbackLoader
} = createBits();
function AboutComponentImpl() {
  return <div>About</div>;
}
export { loader };
export { AboutComponent as component };