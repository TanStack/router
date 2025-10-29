const createBits = () => ({
  component: AboutComponentImpl,
  loader: () => ({
    message: 'hello'
  })
});
const {
  loader
} = createBits();
function AboutComponentImpl() {
  return <div>About</div>;
}
import { Route } from "destructured-export.tsx";
export { loader };