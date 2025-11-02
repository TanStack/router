const createBits = () => ({
  component: AboutComponentImpl,
  loader: () => ({
    message: 'hello'
  })
});
const fallbackLoader = () => ({
  message: 'fallback'
});
const {
  loader = fallbackLoader
} = createBits();
function AboutComponentImpl() {
  return <div>About</div>;
}
export { loader };